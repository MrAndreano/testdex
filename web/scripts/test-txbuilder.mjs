import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// dynamic import of compiled TS via tsx
const { createDexContext } = await import('../src/dex.ts');
const { buildProvideLiquidityJettonTx } = await import('../src/txBuilder.ts');

const cfg = JSON.parse(readFileSync(new URL('../public/testnet.json', import.meta.url), 'utf8'));
cfg.tonApiKey = process.env.ENDPOINT_KEY;
const dex = createDexContext(cfg);
const tta = cfg.tokens.find((t) => t.symbol === 'TTA');
const ttb = cfg.tokens.find((t) => t.symbol === 'TTB');
const user = '0:0000000000000000000000000000000000000000000000000000000000000001';

for (const [name, params] of [
  ['step1', { sendToken: tta, otherToken: ttb, singleSide: true }],
  ['step2', { sendToken: ttb, otherToken: tta, singleSide: false }],
]) {
  try {
    const tx = await buildProvideLiquidityJettonTx(dex, cfg, {
      userWalletAddress: user,
      sendAmount: 1000000000000n,
      minLpOut: '1',
      ...params,
    });
    console.log(name, 'OK', tx.to.toString(), tx.value.toString(), Boolean(tx.body));
  } catch (e) {
    console.error(name, 'FAIL', e.message);
    process.exitCode = 1;
  }
}
