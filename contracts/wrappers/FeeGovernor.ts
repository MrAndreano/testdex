import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
} from '@ton/core';

export type FeeGovernorConfig = {
    routerAddress: Address;
    ownerAddress: Address;
};

export const feeGovernorOpcodes = {
    addHolder: 0x881a7f01,
    removeHolder: 0x881a7f02,
    setFees: 0x58274069,
} as const;

export function feeGovernorConfigToCell(config: FeeGovernorConfig): Cell {
    return beginCell()
        .storeAddress(config.routerAddress)
        .storeAddress(config.ownerAddress)
        .storeDict(null)
        .endCell();
}

export class FeeGovernor implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new FeeGovernor(address);
    }

    static createFromConfig(config: FeeGovernorConfig, code: Cell, workchain = 0) {
        const data = feeGovernorConfigToCell(config);
        const init = { code, data };
        return new FeeGovernor(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: new Cell(),
            bounce: false,
        });
    }

    async sendAddHolder(provider: ContractProvider, via: Sender, opts: { holder: Address }, value = 50_000_000n) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(feeGovernorOpcodes.addHolder, 32)
                .storeUint(0, 64)
                .storeAddress(opts.holder)
                .endCell(),
        });
    }

    async sendRemoveHolder(provider: ContractProvider, via: Sender, opts: { holder: Address }, value = 50_000_000n) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(feeGovernorOpcodes.removeHolder, 32)
                .storeUint(0, 64)
                .storeAddress(opts.holder)
                .endCell(),
        });
    }

    async getRouterAddress(provider: ContractProvider) {
        const result = await provider.get('get_router_address', []);
        return result.stack.readAddress();
    }

    async getOwnerAddress(provider: ContractProvider) {
        const result = await provider.get('get_owner_address', []);
        return result.stack.readAddress();
    }

    async isHolder(provider: ContractProvider, holder: Address) {
        const result = await provider.get('is_holder', [
            { type: 'slice', cell: beginCell().storeAddress(holder).endCell() },
        ]);
        return result.stack.readNumber() !== 0;
    }
}
