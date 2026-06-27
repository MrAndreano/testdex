import { Address, beginCell, contractAddress, toNano, type Cell, type StateInit } from '@ton/core';
import type { DexContext } from './dex';
import type { TestDexConfig, TestDexToken } from './config';
import { getJettonWalletAddress } from './jettonWallets';
import { isSameToken } from './tokens';

const DEFAULT_LP_FEE = 20n;
const DEFAULT_PROTOCOL_FEE = 10n;
const DEPLOY_GAS = toNano('0.5');

type PoolConfigCell = {
  leftReserve: bigint;
  rightReserve: bigint;
  totalSupplyLP: bigint;
  collectedLeftJettonProtocolFees: bigint;
  collectedRightJettonProtocolFees: bigint;
  protocolFeeAddress: Address | null;
  lpFee: bigint;
  protocolFee: bigint;
  routerAddress: Address;
  leftWalletAddress: Address;
  rightWalletAddress: Address;
  LPWalletCode: Cell;
  LPAccountCode: Cell;
};

function poolConfigToCell(config: PoolConfigCell): Cell {
  return beginCell()
    .storeUint(0, 1)
    .storeCoins(config.leftReserve)
    .storeCoins(config.rightReserve)
    .storeCoins(config.totalSupplyLP)
    .storeCoins(config.collectedLeftJettonProtocolFees)
    .storeCoins(config.collectedRightJettonProtocolFees)
    .storeAddress(config.protocolFeeAddress)
    .storeUint(config.lpFee, 16)
    .storeUint(config.protocolFee, 16)
    .storeRef(
      beginCell()
        .storeAddress(config.routerAddress)
        .storeAddress(config.leftWalletAddress)
        .storeAddress(config.rightWalletAddress)
        .storeRef(config.LPWalletCode)
        .storeRef(config.LPAccountCode)
        .endCell(),
    )
    .endCell();
}

function sortPoolWallets(a: Address, b: Address): [Address, Address] {
  const ha = Buffer.from(a.hash);
  const hb = Buffer.from(b.hash);
  return ha.compare(hb) > 0 ? [a, b] : [b, a];
}

export async function getPoolAddressForTokens(
  dex: DexContext,
  tokenA: TestDexToken,
  tokenB: TestDexToken,
): Promise<Address> {
  if (isSameToken(tokenA, tokenB)) {
    throw new Error('Выберите два разных jetton');
  }
  return dex.router.getPoolAddressByJettonMinters({
    token0: tokenA.address,
    token1: tokenB.address,
  });
}

export async function isPoolDeployed(dex: DexContext, poolAddress: Address): Promise<boolean> {
  return dex.client.isContractDeployed(poolAddress);
}

async function buildPoolStateInit(
  dex: DexContext,
  cfg: TestDexConfig,
  tokenA: TestDexToken,
  tokenB: TestDexToken,
): Promise<{ address: Address; init: StateInit }> {
  const routerAddress = Address.parse(cfg.routerAddress);
  const [walletA, walletB, routerData] = await Promise.all([
    getJettonWalletAddress(dex, Address.parse(tokenA.address), routerAddress),
    getJettonWalletAddress(dex, Address.parse(tokenB.address), routerAddress),
    dex.router.getRouterData(),
  ]);

  const [token0Wallet, token1Wallet] = sortPoolWallets(walletA, walletB);
  const data = poolConfigToCell({
    leftReserve: 0n,
    rightReserve: 0n,
    totalSupplyLP: 0n,
    collectedLeftJettonProtocolFees: 0n,
    collectedRightJettonProtocolFees: 0n,
    protocolFeeAddress: null,
    lpFee: DEFAULT_LP_FEE,
    protocolFee: DEFAULT_PROTOCOL_FEE,
    routerAddress,
    leftWalletAddress: token0Wallet,
    rightWalletAddress: token1Wallet,
    LPWalletCode: routerData.jettonLpWalletCode,
    LPAccountCode: routerData.lpAccountCode,
  });

  const init: StateInit = { code: routerData.poolCode, data };
  const address = contractAddress(0, init);
  const expected = await getPoolAddressForTokens(dex, tokenA, tokenB);
  if (!address.equals(expected)) {
    throw new Error('Не удалось вычислить адрес пула — проверьте router и jetton');
  }

  return { address, init };
}

export async function buildDeployPoolTx(
  dex: DexContext,
  cfg: TestDexConfig,
  tokenA: TestDexToken,
  tokenB: TestDexToken,
  value = DEPLOY_GAS,
) {
  const { address, init } = await buildPoolStateInit(dex, cfg, tokenA, tokenB);
  return { to: address, value, init, body: null, bounce: false as const };
}
