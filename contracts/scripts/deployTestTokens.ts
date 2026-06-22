import { NetworkProvider } from '@ton/blueprint';
import { Address, toNano } from '@ton/core';
import fs from 'fs';
import path from 'path';
import {
    DEFAULT_JETTON_MINTER_CODE,
    DEFAULT_JETTON_WALLET_CODE,
    JettonMinterContract,
    color,
    getExpLink,
    metadataCell,
    onchainMetadata,
} from '../libs';
import { cliConfig } from '../helpers/helpers';

type TokenSpec = {
    symbol: string;
    name: string;
    configKey: string;
};

const TEST_TOKENS: TokenSpec[] = [
    { symbol: 'TTA', name: 'TestToken Alpha', configKey: 'tokenAlphaAddress' },
    { symbol: 'TTB', name: 'TestToken Beta', configKey: 'tokenBetaAddress' },
];

export async function run(provider: NetworkProvider) {
    cliConfig.readConfig();
    const config = cliConfig.values;
    const sender = provider.sender();
    const admin = (config.adminAddress as Address | null) ?? (sender.address as Address);
    const mintAmount = config.tokenAmount ?? toNano('1000000');

    color.log(` - <y>TestDex: deploy test jettons on testnet`);
    color.log(` - <y>Admin / mint recipient: <b>${admin.toString()}`);

    const deployed: Record<string, string> = {};

    for (const spec of TEST_TOKENS) {
        const minter = provider.open(
            JettonMinterContract.createFromConfig(
                {
                    totalSupply: 0n,
                    adminAddress: admin,
                    content: metadataCell(
                        onchainMetadata({
                            name: `TestDex ${spec.symbol}`,
                            symbol: spec.symbol,
                            decimals: '9',
                            description: `TestDex liquidity token ${spec.symbol}`,
                        }),
                    ),
                    jettonWalletCode: DEFAULT_JETTON_WALLET_CODE,
                },
                DEFAULT_JETTON_MINTER_CODE,
            ),
        );

        if (!(await provider.isContractDeployed(minter.address))) {
            color.log(` - <y>Deploying <b>${spec.symbol}<y> minter at ${getExpLink(provider, minter.address)}`);
            await minter.sendDeploy(sender, toNano('0.1'));
            await provider.waitForDeploy(minter.address, 120);
        } else {
            color.log(` - <g>${spec.symbol} already deployed at ${minter.address.toString()}`);
        }

        color.log(` - <y>Minting ${mintAmount.toString()} nano-${spec.symbol} to admin...`);
        await minter.sendMint(sender, {
            value: toNano('0.15'),
            toAddress: admin,
            fwdAmount: toNano('0.05'),
            masterMsg: {
                jettonAmount: mintAmount,
                jettonMinterAddress: minter.address,
                responseAddress: admin,
            },
        });

        deployed[spec.configKey] = minter.address.toString();
        color.log(` - <g>${spec.symbol}: ${minter.address.toString()}`);
    }

    (config as Record<string, unknown>).tokenAlphaAddress = deployed.tokenAlphaAddress;
    (config as Record<string, unknown>).tokenBetaAddress = deployed.tokenBetaAddress;
    cliConfig.updateConfig();

    const rootConfigPath = path.resolve(__dirname, '../../config/testnet.json');
    if (fs.existsSync(rootConfigPath)) {
        const rootCfg = JSON.parse(fs.readFileSync(rootConfigPath, 'utf8'));
        rootCfg.tokens = [
            {
                symbol: 'TTA',
                name: 'TestDex TTA',
                address: deployed.tokenAlphaAddress,
                decimals: 9,
            },
            {
                symbol: 'TTB',
                name: 'TestDex TTB',
                address: deployed.tokenBetaAddress,
                decimals: 9,
            },
        ];
        fs.writeFileSync(rootConfigPath, JSON.stringify(rootCfg, null, 2));
        color.log(` - <g>Updated ${rootConfigPath}`);
    }

    color.log(` - <g>Done. Tokens minted to ${admin.toString()}`);
    color.log(` - <y>Wait ~30s before providing liquidity (jetton wallets deploy async).`);
}
