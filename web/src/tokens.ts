import { Address } from '@ton/core';
import type { TestDexConfig, TestDexToken } from './config';
import { findToken, normalizeAddressForSearch } from './config';

const CUSTOM_TOKENS_KEY = 'testdex:customTokens';
const CUSTOM_POOLS_KEY = 'testdex:customPools';

export function shortTokenSymbol(address: string): string {
  try {
    return Address.parse(address).toString({ bounceable: false }).slice(0, 6);
  } catch {
    return address.slice(0, 6);
  }
}

export function loadCustomTokens(): TestDexToken[] {
  try {
    const raw = localStorage.getItem(CUSTOM_TOKENS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TestDexToken[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomToken(token: TestDexToken): void {
  const existing = loadCustomTokens();
  const key = normalizeAddressForSearch(token.address);
  if (existing.some((t) => normalizeAddressForSearch(t.address) === key)) return;
  localStorage.setItem(CUSTOM_TOKENS_KEY, JSON.stringify([...existing, token]));
}

export function loadCustomPools(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_POOLS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomPool(address: string): void {
  const key = Address.parse(address).toString();
  const existing = loadCustomPools();
  if (existing.some((a) => Address.parse(a).equals(Address.parse(key)))) return;
  localStorage.setItem(CUSTOM_POOLS_KEY, JSON.stringify([...existing, key]));
}

export function mergeConfig(cfg: TestDexConfig, customTokens: TestDexToken[]): TestDexConfig {
  const byAddr = new Map<string, TestDexToken>();
  for (const t of [...cfg.tokens, ...customTokens]) {
    byAddr.set(normalizeAddressForSearch(t.address), t);
  }

  const poolKeys = new Set<string>();
  const pools = [...cfg.pools];
  for (const entry of pools) {
    poolKeys.add(typeof entry === 'string' ? entry : entry.address);
  }
  for (const addr of loadCustomPools()) {
    if (!poolKeys.has(addr)) {
      pools.push({ address: addr });
      poolKeys.add(addr);
    }
  }

  return { ...cfg, tokens: [...byAddr.values()], pools };
}

export function parseJettonAddress(raw: string): Address | null {
  const q = raw.trim();
  if (!q) return null;
  try {
    return Address.parse(q);
  } catch {
    return null;
  }
}

export function resolveToken(cfg: TestDexConfig, key: string): TestDexToken | undefined {
  const found = findToken(cfg, key);
  if (found) return found;

  const addr = parseJettonAddress(key);
  if (!addr) return undefined;

  return {
    symbol: shortTokenSymbol(addr.toString()),
    name: 'Jetton',
    address: addr.toString(),
    decimals: 9,
  };
}

export function isSameToken(a: TestDexToken, b: TestDexToken): boolean {
  return normalizeAddressForSearch(a.address) === normalizeAddressForSearch(b.address);
}
