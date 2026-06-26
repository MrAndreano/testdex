import { TonClient } from '@ton/ton';

import { DEX } from '@ston-fi/sdk/dex/v2_1';

import type { OpenedContract } from '@ton/core';

import type { TestDexConfig } from './config';



export type DexContext = {

  client: TonClient;

  router: OpenedContract<InstanceType<typeof DEX.Router.CPI>>;

  proxyTon: InstanceType<typeof DEX.pTON>;

};



export function createDexContext(cfg: TestDexConfig): DexContext {

  if (!cfg.routerAddress) {

    throw new Error('routerAddress пуст — обновите public/testnet.json после деплоя в TestDex');

  }

  if (!cfg.ptonMasterAddress) {

    throw new Error('ptonMasterAddress пуст — задеплойте pTON и обновите testnet.json');

  }



  const client = new TonClient({
    endpoint: cfg.tonApiEndpoint,
    apiKey: cfg.tonApiKey,
  });

  const router = client.open(DEX.Router.CPI.create(cfg.routerAddress));

  const proxyTon = DEX.pTON.create(cfg.ptonMasterAddress);



  return { client, router, proxyTon };

}



export const TON_ASSET = 'TON';

