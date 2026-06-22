import fs from 'fs';
import path from 'path';
import { Address, beginCell } from '@ton/ton';
import { TonClient } from '@ton/ton';
import { DEX } from '@ston-fi/sdk/dex/v2_1';

type DeployConfig = Record<string, unknown>;
type TestDexToken = {
    symbol: string;
    name: string;
    address: string;
    decimals: number;
    routerWallet?: string;
};
type TestDexConfig = {
    pools?: Array<string | { address: string; token0?: string; token1?: string }>;
    tokens?: TestDexToken[];
    routerAddress?: string;
    [key: string]: unknown;
};

function readJson(filePath: string): DeployConfig | null {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as DeployConfig;
}

async function routerJettonWallet(
    client: TonClient,
    jettonMaster: string,
    routerAddress: string,
): Promise<string> {
    const res = await client.runMethod(Address.parse(jettonMaster), 'get_wallet_address', [
        {
            type: 'slice',
            cell: beginCell().storeAddress(Address.parse(routerAddress)).endCell(),
        },
    ]);
    return res.stack.readAddress().toString();
}

async function enrichTokens(client: TonClient, base: TestDexConfig): Promise<void> {
    const routerAddress = base.routerAddress;
    const tokens = base.tokens;
    if (!routerAddress || !tokens?.length) return;

    for (const token of tokens) {
        try {
            token.routerWallet = await routerJettonWallet(client, token.address, routerAddress);
        } catch {
            /* ignore */
        }
    }
}

async function maybeExportPool(client: TonClient, base: TestDexConfig): Promise<void> {
    const routerAddress = base.routerAddress;
    const tokens = base.tokens;
    if (!routerAddress || !tokens || tokens.length < 2) return;

    const router = client.open(DEX.Router.CPI.create(routerAddress));

    try {
        const poolAddress = await router.getPoolAddressByJettonMinters({
            token0: tokens[0]!.address,
            token1: tokens[1]!.address,
        });

        const walletToSymbol = new Map<string, string>();
        for (const token of tokens) {
            const wallet = token.routerWallet ?? (await routerJettonWallet(client, token.address, routerAddress));
            token.routerWallet = wallet;
            walletToSymbol.set(Address.parse(wallet).toRawString(), token.symbol);
        }

        let token0 = tokens[0]!.symbol;
        let token1 = tokens[1]!.symbol;

        if (await client.isContractDeployed(poolAddress)) {
            const pool = client.open(DEX.Pool.CPI.create(poolAddress));
            const data = await pool.getPoolData();
            token0 = walletToSymbol.get(data.token0WalletAddress.toRawString()) ?? token0;
            token1 = walletToSymbol.get(data.token1WalletAddress.toRawString()) ?? token1;
        }

        base.pools = [
            {
                address: poolAddress.toString(),
                token0,
                token1,
            },
        ];
    } catch {
        /* pool not deployed yet */
    }
}

async function main() {
    const contractsCfg = readJson(path.resolve(__dirname, '../build/deploy.config.json'));
    const ptonCfg = readJson(path.resolve(__dirname, '../../pton/build/deploy.config.json'));
    const outPath = path.resolve(__dirname, '../../config/testnet.json');
    const templatePath = path.resolve(__dirname, '../../config/testnet.example.json');

    const base = (readJson(outPath) ?? readJson(templatePath)) as TestDexConfig | null;
    if (!base) {
        throw new Error('config/testnet.json or testnet.example.json not found');
    }

    if (contractsCfg?.routerAddress) {
        base.routerAddress = String(contractsCfg.routerAddress);
    }
    if (contractsCfg?.adminAddress) {
        base.adminAddress = String(contractsCfg.adminAddress);
        base.protocolFeeAddress = String(contractsCfg.adminAddress);
    }
    if (ptonCfg?.minterAddress) {
        base.ptonMasterAddress = String(ptonCfg.minterAddress);
    }
    if (contractsCfg?.tokenAlphaAddress && contractsCfg?.tokenBetaAddress) {
        base.tokens = [
            {
                symbol: 'TTA',
                name: 'TestDex TTA',
                address: String(contractsCfg.tokenAlphaAddress),
                decimals: 9,
            },
            {
                symbol: 'TTB',
                name: 'TestDex TTB',
                address: String(contractsCfg.tokenBetaAddress),
                decimals: 9,
            },
        ];
    }

    const endpoint = process.env.TONCENTER_ENDPOINT ?? 'https://testnet.toncenter.com/api/v2/jsonRPC';
    const apiKey = process.env.ENDPOINT_KEY;
    const client = new TonClient({ endpoint, apiKey });

    await enrichTokens(client, base);
    await maybeExportPool(client, base);

    fs.writeFileSync(outPath, JSON.stringify(base, null, 2));
    const webPath = path.resolve(__dirname, '../../web/public/testnet.json');
    fs.mkdirSync(path.dirname(webPath), { recursive: true });
    fs.writeFileSync(webPath, JSON.stringify(base, null, 2));

    console.log('Exported testnet config:');
    console.log(`  ${outPath}`);
    console.log(`  ${webPath}`);
    if (base.pools?.length) {
        console.log(`  pools: ${JSON.stringify(base.pools[0])}`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
