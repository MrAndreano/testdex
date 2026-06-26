import { readFileSync } from 'node:fs';
import { TonClient } from '@ton/ton';
import { DEX } from '@ston-fi/sdk/dex/v2_1';

const cfg = JSON.parse(readFileSync(new URL('../public/testnet.json', import.meta.url), 'utf8'));
const client = new TonClient({ endpoint: cfg.tonApiEndpoint });
const router = client.open(DEX.Router.CPI.create(cfg.routerAddress));
const proxyTon = DEX.pTON.create(cfg.ptonMasterAddress);

const user = '0:0000000000000000000000000000000000000000000000000000000000000001';

async function tryTx(name, fn) {
  try {
    const tx = await fn();
    console.log(name, 'OK', {
      to: tx.to?.toString?.() ?? tx.to,
      value: tx.value?.toString?.() ?? tx.value,
      hasBody: Boolean(tx.body),
    });
  } catch (e) {
    console.error(name, 'FAIL', e.message);
  }
}

await tryTx('swap TON->TTA', () =>
  router.getSwapTonToJettonTxParams({
    userWalletAddress: user,
    proxyTon,
    offerAmount: 1000000000n,
    askJettonAddress: cfg.tokens[0].address,
    minAskAmount: '1',
  }),
);

await tryTx('singleSide TTA', () =>
  router.getSingleSideProvideLiquidityJettonTxParams({
    userWalletAddress: user,
    sendTokenAddress: cfg.tokens[0].address,
    otherTokenAddress: cfg.tokens[1].address,
    sendAmount: 1000000000n,
    minLpOut: '1',
    offerJettonWalletAddress: cfg.tokens[0].routerWallet,
  }),
);
