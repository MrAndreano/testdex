import { openContract, Sender, Address, Cell, StateInit, SendMode } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, WalletContractV5R1 } from '@ton/ton';
import type { UIProvider } from '@ton/blueprint';

const TESTNET_GLOBAL_ID = -3;
const SEND_RETRIES = 5;

async function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= SEND_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            const msg = error instanceof Error ? error.message : String(error);
            if (attempt < SEND_RETRIES && /ECONNRESET|ETIMEDOUT|socket hang up|429|500|503|Request failed/i.test(msg)) {
                await sleep(3000 * attempt);
                continue;
            }
            throw error;
        }
    }
    throw lastError;
}

export async function createTestnetW5Sender(client: TonClient, ui: UIProvider): Promise<Sender & { address: Address }> {
    const mnemonic = process.env.WALLET_MNEMONIC ?? '';
    if (!mnemonic || mnemonic.includes('word1 word2')) {
        throw new Error('WALLET_MNEMONIC не заполнен в .env');
    }

    const keyPair = await mnemonicToPrivateKey(mnemonic.split(' '));
    const wallet = openContract(
        WalletContractV5R1.create({
            publicKey: keyPair.publicKey,
            walletId: {
                networkGlobalId: TESTNET_GLOBAL_ID,
                context: {
                    workchain: 0,
                    walletVersion: 'v5r1',
                    subwalletNumber: 0,
                },
            },
        }),
        (params) => client.provider(params.address, params.init),
    );

    const state = await client.getContractState(wallet.address);
    ui.write(`Deploy wallet (W5 testnet): ${wallet.address.toString()}\n`);
    ui.write(`Wallet state: ${state.state}, balance: ${state.balance} nanoTON\n`);

    if (state.state === 'uninitialized' || state.balance < 500_000_000n) {
        throw new Error(
            `Кошелёк W5 не активирован или мало TON.\n` +
                `1. Отправьте 3–5 testnet TON на адрес выше (@testgiver_ton_bot)\n` +
                `2. Откройте этот кошелёк в Tonkeeper (testnet) — один раз отправьте любую транзакцию для активации W5\n` +
                `3. Повторите деплой: scripts\\user-deploy.cmd`,
        );
    }

    return {
        address: wallet.address,
        async send(args: {
            to: Address;
            value: bigint;
            body?: Cell;
            init?: StateInit | null;
            bounce?: boolean;
            sendMode?: SendMode;
        }) {
            await withRetry(async () => {
                await wallet.sendTransfer({
                    seqno: await wallet.getSeqno(),
                    secretKey: keyPair.secretKey,
                    messages: [
                        {
                            init: args.init ?? undefined,
                            body: args.body ?? new Cell(),
                            info: {
                                type: 'internal',
                                ihrDisabled: true,
                                ihrFee: 0n,
                                bounce: args.bounce ?? false,
                                bounced: false,
                                dest: args.to,
                                value: { coins: args.value },
                                forwardFee: 0n,
                                createdAt: 0,
                                createdLt: 0n,
                            },
                        },
                    ],
                    sendMode: args.sendMode ?? SendMode.PAY_GAS_SEPARATELY,
                });
            }, 'sendTransfer');
        },
    };
}
