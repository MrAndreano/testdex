import { Address } from '@ton/core';
import { DEX } from '@ston-fi/sdk/dex/v2_1';
import { createDexContext, type DexContext } from './dex';
import { buildRouterWalletIndex } from './jettonWallets';
import { formatAmount, type TestDexConfig, type TestDexPoolRef, type TestDexToken } from './config';

const FEE_DIVIDER = 10_000n;

export type PoolTokenSide = {
  symbol: string;
  name: string;
  address?: string;
  reserve: bigint;
  decimals: number;
  collectedProtocolFee: bigint;
};

export type LiquidityPoolInfo = {
  address: string;
  pairLabel: string;
  token0: PoolTokenSide;
  token1: PoolTokenSide;
  totalSupplyLp: bigint;
  lpFeePercent: string;
  protocolFeePercent: string;
  isLocked: boolean;
  priceLabel: string;
  emptyLiquidity: boolean;
};

function feePercent(fee: bigint): string {
  const pct = (Number(fee) / Number(FEE_DIVIDER)) * 100;
  return `${pct.toFixed(2)}%`;
}

function poolRefAddress(entry: TestDexPoolRef): string {
  return typeof entry === 'string' ? entry : entry.address;
}

function makeSide(token: TestDexToken, reserve: bigint, collectedProtocolFee: bigint): PoolTokenSide {
  return {
    symbol: token.symbol,
    name: token.name,
    address: token.address,
    reserve,
    decimals: token.decimals,
    collectedProtocolFee,
  };
}

function unknownSide(addr: Address, reserve: bigint, collectedProtocolFee: bigint): PoolTokenSide {
  const short = addr.toString({ bounceable: false });
  return {
    symbol: short.slice(0, 6),
    name: 'Jetton',
    reserve,
    decimals: 9,
    collectedProtocolFee,
  };
}

async function resolveSides(
  cfg: TestDexConfig,
  ctx: DexContext,
  routerAddress: Address,
  token0Wallet: Address,
  token1Wallet: Address,
  reserve0: bigint,
  reserve1: bigint,
  fee0: bigint,
  fee1: bigint,
): Promise<{ token0: PoolTokenSide; token1: PoolTokenSide }> {
  const walletToToken = await buildRouterWalletIndex(cfg, ctx, routerAddress);

  const meta0 = walletToToken.get(token0Wallet.toRawString());
  const meta1 = walletToToken.get(token1Wallet.toRawString());

  return {
    token0: meta0 ? makeSide(meta0, reserve0, fee0) : unknownSide(token0Wallet, reserve0, fee0),
    token1: meta1 ? makeSide(meta1, reserve1, fee1) : unknownSide(token1Wallet, reserve1, fee1),
  };
}

async function loadPoolAtAddress(
  cfg: TestDexConfig,
  ctx: DexContext,
  poolAddress: Address,
): Promise<LiquidityPoolInfo> {
  const pool = ctx.client.open(DEX.Pool.CPI.create(poolAddress));
  const data = await pool.getPoolData();
  const { token0, token1 } = await resolveSides(
    cfg,
    ctx,
    data.routerAddress,
    data.token0WalletAddress,
    data.token1WalletAddress,
    data.reserve0,
    data.reserve1,
    data.collectedToken0ProtocolFee,
    data.collectedToken1ProtocolFee,
  );

  const r0 = Number(formatAmount(data.reserve0, token0.decimals, 12));
  const r1 = Number(formatAmount(data.reserve1, token1.decimals, 12));
  const priceLabel =
    r0 > 0 ? `1 ${token0.symbol} ≈ ${(r1 / r0).toPrecision(6)} ${token1.symbol}` : 'Ликвидность пока не внесена';

  return {
    address: poolAddress.toString(),
    pairLabel: `${token0.symbol} / ${token1.symbol}`,
    token0,
    token1,
    totalSupplyLp: data.totalSupplyLP,
    lpFeePercent: feePercent(data.lpFee),
    protocolFeePercent: feePercent(data.protocolFee),
    isLocked: data.isLocked,
    priceLabel,
    emptyLiquidity: data.reserve0 === 0n && data.reserve1 === 0n,
  };
}

export async function discoverPoolAddresses(cfg: TestDexConfig): Promise<Address[]> {
  return cfg.pools.map((entry) => Address.parse(poolRefAddress(entry)));
}

export async function loadLiquidityPools(cfg: TestDexConfig): Promise<LiquidityPoolInfo[]> {
  const ctx = createDexContext(cfg);
  const addresses = await discoverPoolAddresses(cfg);
  const pools: LiquidityPoolInfo[] = [];
  const errors: string[] = [];

  for (const address of addresses) {
    try {
      pools.push(await loadPoolAtAddress(cfg, ctx, address));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${address.toString({ bounceable: false }).slice(0, 8)}…: ${msg}`);
    }
  }

  if (pools.length === 0 && errors.length > 0) {
    const rateLimited = errors.some((e) => /429|rate limit/i.test(e));
    if (rateLimited) {
      throw new Error(
        'Toncenter ограничил запросы (429). Подождите минуту и нажмите ↻ или добавьте tonApiKey в testnet.json для локальной разработки.',
      );
    }
    throw new Error(errors.join('; '));
  }

  pools.sort((a, b) => a.pairLabel.localeCompare(b.pairLabel));
  return pools;
}
