import { Address } from '@ton/core';

export type TestDexToken = {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  /** Jetton wallet of router for this token — ускоряет вкладку «Пулы» */
  routerWallet?: string;
};

export type TestDexPoolRef =
  | string
  | {
      address: string;
      token0?: string;
      token1?: string;
    };

export type TestDexConfig = {
  name: string;
  network: string;
  tonApiEndpoint: string;
  /** Необязательно: ключ Toncenter для локальной разработки */
  tonApiKey?: string;
  tonConnectManifestUrl: string;
  routerAddress: string;
  ptonMasterAddress: string;
  adminAddress: string;
  protocolFeeAddress: string;
  /** NFT collection — держатели могут менять получателя комиссий (с FeeGovernor). */
  governanceNftCollectionAddress?: string;
  /** Контракт-прокси set_fees для key holders (должен быть admin router). */
  feeGovernorAddress?: string;
  dexVersion: string;
  routerType: string;
  tokens: TestDexToken[];
  pools: TestDexPoolRef[];
};

let cached: TestDexConfig | null = null;

/** Absolute URL for static assets (works on GitHub Pages subpaths). */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL;
  const clean = path.replace(/^\//, '');
  return `${base}${clean}`;
}

export async function loadConfig(): Promise<TestDexConfig> {
  if (cached) return cached;
  const res = await fetch(assetUrl('testnet.json'));
  if (!res.ok) throw new Error(`Не удалось загрузить testnet.json (${res.status})`);
  const json = (await res.json()) as TestDexConfig;
  const envKey = import.meta.env.VITE_TON_API_KEY as string | undefined;
  if (envKey && !json.tonApiKey) {
    json.tonApiKey = envKey;
  }
  cached = json;
  return cached;
}

export function parseAmount(raw: string, decimals: number): bigint {
  const trimmed = raw.trim();
  if (!trimmed) return 0n;
  const [whole, frac = ''] = trimmed.split('.');
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(padded || '0');
}

export function formatAmount(value: bigint, decimals: number, maxFrac = 6): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  let frac = (value % base).toString().padStart(decimals, '0');
  frac = frac.slice(0, maxFrac).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function normalizeAddressForSearch(addr: string): string {
  try {
    return Address.parse(addr.trim()).toRawString().toLowerCase();
  } catch {
    return addr.replace(/\s/g, '').toLowerCase();
  }
}

export function tokenMatchesQuery(token: TestDexToken, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (token.symbol.toLowerCase().includes(q)) return true;
  if (token.name.toLowerCase().includes(q)) return true;
  if (token.address.toLowerCase().includes(q)) return true;

  const qNorm = normalizeAddressForSearch(query);
  const addrNorm = normalizeAddressForSearch(token.address);
  if (addrNorm.includes(qNorm) || qNorm.includes(addrNorm)) return true;

  try {
    const friendly = Address.parse(token.address).toString({ bounceable: true }).toLowerCase();
    const friendlyNb = Address.parse(token.address).toString({ bounceable: false }).toLowerCase();
    if (friendly.includes(q) || friendlyNb.includes(q)) return true;
  } catch {
    /* ignore */
  }

  return false;
}

export function findToken(cfg: TestDexConfig, key: string): TestDexToken | undefined {
  const bySymbol = cfg.tokens.find((t) => t.symbol === key);
  if (bySymbol) return bySymbol;

  try {
    const needle = normalizeAddressForSearch(key);
    return cfg.tokens.find((t) => normalizeAddressForSearch(t.address) === needle);
  } catch {
    return undefined;
  }
}
