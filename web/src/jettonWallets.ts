import { Address, beginCell } from '@ton/core';
import type { DexContext } from './dex';
import type { TestDexConfig, TestDexToken } from './config';

const walletCache = new Map<string, Address>();

function cacheKey(minter: string, owner: string): string {
  return `${Address.parse(minter).toRawString()}:${Address.parse(owner).toRawString()}`;
}

export async function getJettonWalletAddress(
  ctx: DexContext,
  jettonMaster: Address,
  owner: Address,
): Promise<Address> {
  const key = cacheKey(jettonMaster.toString(), owner.toString());
  const cached = walletCache.get(key);
  if (cached) return cached;

  const res = await ctx.client.runMethod(jettonMaster, 'get_wallet_address', [
    {
      type: 'slice',
      cell: beginCell().storeAddress(owner).endCell(),
    },
  ]);
  const wallet = res.stack.readAddress();
  walletCache.set(key, wallet);
  return wallet;
}

/** Maps router jetton wallet address → token metadata from testnet.json. */
export async function buildRouterWalletIndex(
  cfg: TestDexConfig,
  ctx: DexContext,
  routerAddress: Address,
): Promise<Map<string, TestDexToken>> {
  const index = new Map<string, TestDexToken>();

  for (const token of cfg.tokens) {
    if (token.routerWallet) {
      index.set(Address.parse(token.routerWallet).toRawString(), token);
      continue;
    }
    const wallet = await getJettonWalletAddress(ctx, Address.parse(token.address), routerAddress);
    index.set(wallet.toRawString(), token);
  }

  return index;
}
