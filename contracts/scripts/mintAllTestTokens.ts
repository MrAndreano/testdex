import 'dotenv/config';
import { Address, toNano } from '@ton/core';
import { JettonMinterContract, color } from '../libs';
import { cliConfig } from '../helpers/helpers';
import { createTestDexProvider } from './testnetProvider';
import { TonClient, WalletContractV5R1, openContract } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';

const MINT_TARGETS = [
    { symbol: 'TTA', configKey: 'tokenAlphaAddress' as const },
    { symbol: 'TTB', configKey: 'tokenBetaAddress' as const },
];

function parseOnlySymbol(): string | null {
    const arg = process.argv.find((a) => a.startsWith('--only='));
    return arg?.split('=')[1]?.toUpperCase() ?? null;
}

async function waitForSeqno(client: TonClient, wallet: ReturnType<typeof WalletContractV5R1.create>, prev: number) {
    for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const opened = openContract(wallet, (p) => client.provider(p.address, p.init ?? undefined));
        const seqno = await opened.getSeqno();
        if (seqno > prev) return seqno;
    }
    throw new Error('Timeout waiting for wallet seqno increment');
}

export async function run() {
    cliConfig.readConfig();
    const config = cliConfig.values;
    const provider = await createTestDexProvider();
    const sender = provider.sender();
    const admin = (config.adminAddress as Address | null) ?? (sender.address as Address);
    const mintAmount = config.tokenAmount ?? toNano('1000000');
    const client = provider.api() as TonClient;

    const kp = await mnemonicToPrivateKey((process.env.WALLET_MNEMONIC ?? '').split(' '));
    const w5 = WalletContractV5R1.create({
        publicKey: kp.publicKey,
        walletId: {
            networkGlobalId: -3,
            context: { workchain: 0, walletVersion: 'v5r1', subwalletNumber: 0 },
        },
    });
    const wallet = openContract(w5, (p) => client.provider(p.address, p.init ?? undefined));
    let seqno = await wallet.getSeqno();

    color.log(` - <y>TestDex: mint test jettons to admin`);
    color.log(` - <y>Admin: <b>${admin.toString()}`);

    const only = parseOnlySymbol();
    const targets = only ? MINT_TARGETS.filter((t) => t.symbol === only) : MINT_TARGETS;
    if (targets.length === 0) {
        throw new Error(`Unknown token: ${only}`);
    }

    for (const spec of targets) {
        const addr = config[spec.configKey] as Address | null;
        if (!addr) {
            throw new Error(`${spec.configKey} missing in deploy.config.json`);
        }

        const minter = provider.open(JettonMinterContract.createFromAddress(addr));
        color.log(` - <y>Minting ${mintAmount.toString()} nano-${spec.symbol} (${addr.toString()})...`);

        await minter.sendMint(sender, {
            value: toNano('0.15'),
            toAddress: admin,
            fwdAmount: toNano('0.05'),
            masterMsg: {
                jettonAmount: mintAmount,
                jettonMinterAddress: addr,
                responseAddress: admin,
            },
        });

        color.log(` - <g>${spec.symbol} mint tx sent, waiting for confirmation...`);
        seqno = await waitForSeqno(client, w5, seqno);
    }

    color.log(` - <g>Done. Wait ~30s for jetton wallets to deploy.`);
}
