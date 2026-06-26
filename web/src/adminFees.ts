import { Address, beginCell, toNano } from '@ton/core';
import { DEX } from '@ston-fi/sdk/dex/v2_1';
import { createDexContext } from './dex';
import { buildRouterWalletIndex } from './jettonWallets';
import {
  formatAmount,
  type TestDexConfig,
  type TestDexPoolRef,
  type TestDexToken,
} from './config';

const COLLECT_FEES_OP = 0x1ee4911e;
const FEE_DIVIDER = 10_000n;
const COLLECT_GAS = toNano('1.1');

export type ProtocolFeePoolStatus = {
  poolAddress: string;
  pairLabel: string;
  token0: { symbol: string; name: string; collected: bigint; decimals: number };
  token1: { symbol: string; name: string; collected: bigint; decimals: number };
  protocolFeePercent: string;
  canCollect: boolean;
  blockers: string[];
};

function poolRefAddress(entry: TestDexPoolRef): string {
  return typeof entry === 'string' ? entry : entry.address;
}

function feePercent(fee: bigint): string {
  return `${((Number(fee) / Number(FEE_DIVIDER)) * 100).toFixed(2)}%`;
}

function tokenMeta(
  wallet: Address,
  index: Map<string, TestDexToken>,
  cfg: TestDexConfig,
  slot: 'token0' | 'token1',
  poolRef: TestDexPoolRef,
): TestDexToken {
  const fromIndex = index.get(wallet.toRawString());
  if (fromIndex) return fromIndex;
  if (typeof poolRef !== 'string') {
    const sym = poolRef[slot];
    const found = sym ? cfg.tokens.find((t) => t.symbol === sym) : undefined;
    if (found) return found;
  }
  return { symbol: wallet.toString().slice(0, 6), name: 'Jetton', address: wallet.toString(), decimals: 9 };
}

export async function loadProtocolFeeStatuses(cfg: TestDexConfig): Promise<ProtocolFeePoolStatus[]> {
  const ctx = createDexContext(cfg);
  const results: ProtocolFeePoolStatus[] = [];

  for (const poolRef of cfg.pools) {
    const poolAddress = Address.parse(poolRefAddress(poolRef));
    const pool = ctx.client.open(DEX.Pool.CPI.create(poolAddress));
    const data = await pool.getPoolData();
    const walletIndex = await buildRouterWalletIndex(cfg, ctx, data.routerAddress);

    const t0 = tokenMeta(data.token0WalletAddress, walletIndex, cfg, 'token0', poolRef);
    const t1 = tokenMeta(data.token1WalletAddress, walletIndex, cfg, 'token1', poolRef);

    const blockers: string[] = [];
    if (data.collectedToken0ProtocolFee <= 0n) {
      blockers.push(`Нет комиссии по ${t0.symbol} — нужны swap, где ${t0.symbol} уходит из пула`);
    }
    if (data.collectedToken1ProtocolFee <= 0n) {
      blockers.push(`Нет комиссии по ${t1.symbol} — нужны swap, где ${t1.symbol} уходит из пула`);
    }

    results.push({
      poolAddress: poolAddress.toString(),
      pairLabel: `${t0.symbol} / ${t1.symbol}`,
      token0: {
        symbol: t0.symbol,
        name: t0.name,
        collected: data.collectedToken0ProtocolFee,
        decimals: t0.decimals,
      },
      token1: {
        symbol: t1.symbol,
        name: t1.name,
        collected: data.collectedToken1ProtocolFee,
        decimals: t1.decimals,
      },
      protocolFeePercent: feePercent(data.protocolFee),
      canCollect: data.collectedToken0ProtocolFee > 0n && data.collectedToken1ProtocolFee > 0n,
      blockers,
    });
  }

  return results;
}

export function buildCollectFeesTx(poolAddress: string, value = COLLECT_GAS) {
  const body = beginCell()
    .storeUint(COLLECT_FEES_OP, 32)
    .storeUint(0, 64)
    .storeBit(false)
    .storeBit(false)
    .endCell();

  return {
    to: Address.parse(poolAddress),
    value,
    body,
  };
}

export function formatCollected(amount: bigint, decimals: number): string {
  if (amount <= 0n) return '0';
  return formatAmount(amount, decimals, 6);
}

export function totalCollectableHint(status: ProtocolFeePoolStatus): string {
  return `${formatCollected(status.token0.collected, status.token0.decimals)} ${status.token0.symbol} + ${formatCollected(status.token1.collected, status.token1.decimals)} ${status.token1.symbol}`;
}

export function isCreatorWallet(cfg: TestDexConfig, walletAddress: string): boolean {
  try {
    const wallet = Address.parse(walletAddress);
    const protocol = Address.parse(cfg.protocolFeeAddress);
    const admin = Address.parse(cfg.adminAddress);
    return wallet.equals(protocol) || wallet.equals(admin);
  } catch {
    return false;
  }
}
