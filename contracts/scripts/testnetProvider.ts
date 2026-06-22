import {
    Address,
    Cell,
    Contract,
    ContractProvider,
    openContract,
    OpenedContract,
    Sender,
    SendMode,
    toNano,
    comment,
} from '@ton/core';
import { TonClient } from '@ton/ton';
import { NetworkProvider } from '@ton/blueprint';
import { getConfig } from '@ton/blueprint/dist/config/utils';
import { ConsoleUIProvider } from './consoleUi';
import type { UIProvider } from '@ton/blueprint';
import { createTestnetW5Sender } from './testnetW5Sender';

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

class SimpleProvider implements NetworkProvider {
    constructor(
        private client: TonClient,
        private _sender: Sender,
        private _uiProvider: UIProvider,
    ) {}

    network() {
        return 'testnet' as const;
    }

    sender() {
        return this._sender;
    }

    api() {
        return this.client;
    }

    provider(address: Address, init?: { code?: Cell; data?: Cell }): ContractProvider {
        const base = this.client.provider(address, init);
        const client = this.client;
        return {
            ...base,
            async internal(via, args) {
                const state = await base.getState();
                const deployInit =
                    init && state.state.type !== 'active'
                        ? { code: init.code!, data: init.data! }
                        : undefined;
                return via.send({
                    to: address,
                    value: typeof args.value === 'string' ? toNano(args.value) : args.value,
                    sendMode: args.sendMode ?? SendMode.PAY_GAS_SEPARATELY,
                    bounce: args.bounce,
                    init: deployInit,
                    body: typeof args.body === 'string' ? comment(args.body) : args.body,
                });
            },
            open<T extends Contract>(contract: T): OpenedContract<T> {
                return openContract(contract, (params) =>
                    client.provider(params.address, params.init ?? undefined),
                );
            },
        } as ContractProvider;
    }

    async isContractDeployed(address: Address) {
        return (await this.client.getContractState(address)).state === 'active';
    }

    async waitForDeploy(address: Address, attempts = 20, sleepDuration = 2000) {
        for (let i = 1; i <= attempts; i++) {
            if (await this.isContractDeployed(address)) {
                this._uiProvider.write(`Contract deployed: ${address.toString()}\n`);
                return;
            }
            await sleep(sleepDuration);
        }
        throw new Error(`Contract not deployed: ${address.toString()}`);
    }

    async deploy(contract: Contract, value: bigint, body?: Cell, waitAttempts = 10) {
        if (!contract.init) throw new Error('Contract has no init');
        await this._sender.send({
            to: contract.address,
            value,
            body,
            init: contract.init,
        });
        if (waitAttempts > 0) await this.waitForDeploy(contract.address, waitAttempts);
    }

    open<T extends Contract>(contract: T) {
        const init = contract.init ?? undefined;
        return openContract(contract, (params) =>
            this.provider(
                params.address,
                init
                    ? { code: init.code ?? undefined, data: init.data ?? undefined }
                    : undefined,
            ),
        );
    }

    ui() {
        return this._uiProvider;
    }
}

export async function createTestDexProvider(): Promise<NetworkProvider> {
    const config = await getConfig();
    const net = config?.network;
    if (!net || typeof net === 'string') {
        throw new Error('Настройте ENDPOINT_URL / ENDPOINT_KEY в .env');
    }

    const ui = new ConsoleUIProvider();
    const client = new TonClient({ endpoint: net.endpoint, apiKey: net.key, timeout: 120000 });
    const sender = await createTestnetW5Sender(client, ui);
    return new SimpleProvider(client, sender, ui);
}
