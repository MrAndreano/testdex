import { TonClient } from '@ton/ton';
import { DEX } from '@ston-fi/sdk/dex/v2_1';
import type { TestDexConfig } from './config';

export function createDexContext(cfg: TestDexConfig) {
  if (!cfg.routerAddress) {
    throw new Error('routerAddress пуст — выполните деплой и npm run export:config');
  }
  if (!cfg.ptonMasterAddress) {
    throw new Error('ptonMasterAddress пуст — выполните deploy:pton');
  }

  const client = new TonClient({
    endpoint: cfg.tonApiEndpoint,
    apiKey: cfg.tonApiKey,
  });
  const router = client.open(DEX.Router.CPI.create(cfg.routerAddress));
  const proxyTon = DEX.pTON.create(cfg.ptonMasterAddress);

  return { client, router, proxyTon };
}

export type DexContext = ReturnType<typeof createDexContext>;

export const TON_ASSET = 'TON';
