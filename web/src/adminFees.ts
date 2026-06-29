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
const ROUTER_SET_FEES_OP = 0x58274069;
const FEE_DIVIDER = 10_000n;
const COLLECT_GAS = toNano('1.1');
const SET_FEES_GAS = toNano('0.5');

export type ProtocolFeePoolStatus = {
  poolAddress: string;
  pairLabel: string;
  token0: { symbol: string; name: string; collected: bigint; decimals: number };
  token1: { symbol: string; name: string; collected: bigint; decimals: number };
  token0Wallet: string;
  token1Wallet: string;
  lpFee: bigint;
  protocolFee: bigint;
  protocolFeePercent: string;
  poolProtocolFeeAddress: string | null;
  /** On-chain recipient matches the desired address from admin UI / config. */
  feeRecipientConfigured: boolean;
  /** Any protocol fee address is set in the pool. */
  hasFeeRecipient: boolean;
  /** Both fee counters > 0 — enough to call collect_fees after recipient is set. */
  canWithdraw: boolean;
  /** Recipient already on-chain; collect_fees works in one tx. */
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

function readPoolProtocolFeeAddress(stack: {
  readBoolean: () => boolean;
  readAddress: () => Address;
  readBigNumber: () => bigint;
  readAddressOpt?: () => Address | null;
}): Address | null {
  stack.readBoolean();
  stack.readAddress();
  stack.readBigNumber();
  stack.readBigNumber();
  stack.readBigNumber();
  stack.readAddress();
  stack.readAddress();
  stack.readBigNumber();
  stack.readBigNumber();
  if (stack.readAddressOpt) {
    return stack.readAddressOpt();
  }
  try {
    return stack.readAddress();
  } catch {
    return null;
  }
}

export async function loadProtocolFeeStatuses(
  cfg: TestDexConfig,
  desiredRecipientAddress?: string,
): Promise<ProtocolFeePoolStatus[]> {
  const ctx = createDexContext(cfg);
  const results: ProtocolFeePoolStatus[] = [];
  const expectedRecipient = Address.parse(
    desiredRecipientAddress || cfg.protocolFeeAddress || cfg.adminAddress,
  );

  for (const poolRef of cfg.pools) {
    const poolAddress = Address.parse(poolRefAddress(poolRef));
    const pool = ctx.client.open(DEX.Pool.CPI.create(poolAddress));
    const data = await pool.getPoolData();
    const raw = await ctx.client.runMethod(poolAddress, 'get_pool_data');
    const poolProtocolFeeAddress = readPoolProtocolFeeAddress(raw.stack);
    const walletIndex = await buildRouterWalletIndex(cfg, ctx, data.routerAddress);

    const t0 = tokenMeta(data.token0WalletAddress, walletIndex, cfg, 'token0', poolRef);
    const t1 = tokenMeta(data.token1WalletAddress, walletIndex, cfg, 'token1', poolRef);

    const hasFeeRecipient = poolProtocolFeeAddress != null;
    const feeRecipientConfigured =
      hasFeeRecipient && poolProtocolFeeAddress!.equals(expectedRecipient);

    const blockers: string[] = [];
    if (!hasFeeRecipient) {
      blockers.push('В пуле не задан получатель — будет настроен автоматически перед выводом.');
    } else if (!feeRecipientConfigured) {
      blockers.push(
        `Получатель в пуле (${shortAddr(poolProtocolFeeAddress!.toString())}) отличается от выбранного.`,
      );
    }
    if (data.collectedToken0ProtocolFee <= 0n) {
      blockers.push(`Нет комиссии по ${t0.symbol} — нужны swap, где ${t0.symbol} уходит из пула`);
    }
    if (data.collectedToken1ProtocolFee <= 0n) {
      blockers.push(`Нет комиссии по ${t1.symbol} — нужны swap, где ${t1.symbol} уходит из пула`);
    }

    const canWithdraw =
      data.collectedToken0ProtocolFee > 0n && data.collectedToken1ProtocolFee > 0n;
    const canCollect = canWithdraw && feeRecipientConfigured;

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
      token0Wallet: data.token0WalletAddress.toString(),
      token1Wallet: data.token1WalletAddress.toString(),
      lpFee: data.lpFee,
      protocolFee: data.protocolFee,
      protocolFeePercent: feePercent(data.protocolFee),
      poolProtocolFeeAddress: poolProtocolFeeAddress?.toString() ?? null,
      feeRecipientConfigured,
      hasFeeRecipient,
      canWithdraw,
      canCollect,
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

export function buildSetPoolFeesTx(
  cfg: TestDexConfig,
  pool: ProtocolFeePoolStatus,
  recipientAddress: string,
  value = SET_FEES_GAS,
  target: 'router' | 'governor' = 'router',
) {
  const recipient = Address.parse(recipientAddress);
  const to =
    target === 'governor' && cfg.feeGovernorAddress
      ? Address.parse(cfg.feeGovernorAddress)
      : Address.parse(cfg.routerAddress);
  const body = beginCell()
    .storeUint(ROUTER_SET_FEES_OP, 32)
    .storeUint(0, 64)
    .storeUint(pool.lpFee, 16)
    .storeUint(pool.protocolFee, 16)
    .storeAddress(recipient)
    .storeRef(
      beginCell()
        .storeAddress(Address.parse(pool.token0Wallet))
        .storeAddress(Address.parse(pool.token1Wallet))
        .storeAddress(recipient)
        .endCell(),
    )
    .endCell();

  return {
    to,
    value,
    body,
  };
}

export async function isGovernorKeyHolder(cfg: TestDexConfig, walletAddress: string): Promise<boolean> {
  if (!cfg.feeGovernorAddress) return false;
  try {
    const ctx = createDexContext(cfg);
    const wallet = Address.parse(walletAddress);
    const res = await ctx.client.runMethod(Address.parse(cfg.feeGovernorAddress), 'is_holder', [
      { type: 'slice', cell: beginCell().storeAddress(wallet).endCell() },
    ]);
    return res.stack.readNumber() !== 0;
  } catch {
    return false;
  }
}

export async function isFeeGovernorRouterAdmin(cfg: TestDexConfig): Promise<boolean> {
  if (!cfg.feeGovernorAddress) return false;
  try {
    const ctx = createDexContext(cfg);
    const data = await ctx.router.getRouterData();
    return data.adminAddress.equals(Address.parse(cfg.feeGovernorAddress));
  } catch {
    return false;
  }
}

export function setFeesTarget(
  cfg: TestDexConfig,
  opts: { isRouterAdmin: boolean; hasGovernanceKey: boolean },
): 'router' | 'governor' {
  if (opts.hasGovernanceKey && cfg.feeGovernorAddress) {
    return 'governor';
  }
  if (opts.isRouterAdmin) {
    return 'router';
  }
  return cfg.feeGovernorAddress ? 'governor' : 'router';
}

export function formatCollected(amount: bigint, decimals: number): string {
  if (amount <= 0n) return '0';
  return formatAmount(amount, decimals, 6);
}

export function totalCollectableHint(status: ProtocolFeePoolStatus): string {
  return `${formatCollected(status.token0.collected, status.token0.decimals)} ${status.token0.symbol} + ${formatCollected(status.token1.collected, status.token1.decimals)} ${status.token1.symbol}`;
}

export async function waitForFeeRecipientConfigured(
  cfg: TestDexConfig,
  poolAddress: string,
  expectedRecipientAddress: string,
  timeoutMs = 45_000,
  intervalMs = 3_000,
): Promise<boolean> {
  const expected = Address.parse(expectedRecipientAddress);
  const deadline = Date.now() + timeoutMs;
  const addr = Address.parse(poolAddress);

  while (Date.now() < deadline) {
    const ctx = createDexContext(cfg);
    const raw = await ctx.client.runMethod(addr, 'get_pool_data');
    const recipient = readPoolProtocolFeeAddress(raw.stack);
    if (recipient != null && recipient.equals(expected)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export function isRouterAdmin(cfg: TestDexConfig, walletAddress: string): boolean {
  try {
    return Address.parse(walletAddress).equals(Address.parse(cfg.adminAddress));
  } catch {
    return false;
  }
}

export function isFeeRecipientWallet(
  pool: ProtocolFeePoolStatus,
  walletAddress: string,
  desiredRecipientAddress?: string,
): boolean {
  try {
    const wallet = Address.parse(walletAddress);
    if (pool.poolProtocolFeeAddress) {
      return wallet.equals(Address.parse(pool.poolProtocolFeeAddress));
    }
    if (desiredRecipientAddress) {
      return wallet.equals(Address.parse(desiredRecipientAddress));
    }
    return false;
  } catch {
    return false;
  }
}

/** @deprecated use isRouterAdmin / isFeeRecipientWallet */
export function isCreatorWallet(cfg: TestDexConfig, walletAddress: string): boolean {
  try {
    const wallet = Address.parse(walletAddress);
    const protocol = Address.parse(cfg.protocolFeeAddress || cfg.adminAddress);
    const admin = Address.parse(cfg.adminAddress);
    return wallet.equals(protocol) || wallet.equals(admin);
  } catch {
    return false;
  }
}

function shortAddr(addr: string): string {
  if (addr.length <= 13) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const FEE_RECIPIENT_STORAGE_KEY = 'testdex:feeRecipient';

export function loadStoredFeeRecipient(cfg: TestDexConfig): string {
  try {
    const stored = localStorage.getItem(FEE_RECIPIENT_STORAGE_KEY);
    if (stored) return Address.parse(stored).toString();
  } catch {
    /* use default */
  }
  return cfg.protocolFeeAddress || cfg.adminAddress;
}

export function saveStoredFeeRecipient(address: string): void {
  localStorage.setItem(FEE_RECIPIENT_STORAGE_KEY, Address.parse(address).toString());
}

export function parseFeeRecipientInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Укажите адрес получателя комиссий');
  }
  return Address.parse(trimmed).toString();
}
