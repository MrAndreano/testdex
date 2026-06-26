/**
 * Automated checks for TestDex (no wallet signing).
 * Usage: set ENDPOINT_KEY=... && node scripts/verify-all.mjs
 */
import { readFileSync } from 'node:fs';
import { TonClient } from '@ton/ton';
import { Address, beginCell, toNano } from '@ton/core';
import { DEX } from '@ston-fi/sdk/dex/v2_1';

const cfg = JSON.parse(readFileSync(new URL('../public/testnet.json', import.meta.url), 'utf8'));
const apiKey = process.env.ENDPOINT_KEY || process.env.VITE_TON_API_KEY || cfg.tonApiKey;
const client = new TonClient({ endpoint: cfg.tonApiEndpoint, apiKey });
const router = client.open(DEX.Router.CPI.create(cfg.routerAddress));
const proxyTon = DEX.pTON.create(cfg.ptonMasterAddress);

const user = '0:0000000000000000000000000000000000000000000000000000000000000001';
const results = [];

function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log('PASS', name, detail ?? '');
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error('FAIL', name, detail ?? '');
}

async function getJettonWallet(minter, owner) {
  const res = await client.runMethod(Address.parse(minter), 'get_wallet_address', [
    { type: 'slice', cell: beginCell().storeAddress(Address.parse(owner)).endCell() },
  ]);
  return res.stack.readAddress();
}

function createJettonTransferMessage(params) {
  const builder = beginCell();
  builder.storeUint(0x0f8a7ea5, 32);
  builder.storeUint(params.queryId, 64);
  builder.storeCoins(params.amount);
  builder.storeAddress(params.destination);
  builder.storeAddress(params.responseDestination);
  builder.storeBit(Boolean(params.customPayload));
  if (params.customPayload) builder.storeRef(params.customPayload);
  builder.storeCoins(params.forwardTonAmount);
  builder.storeBit(Boolean(params.forwardPayload));
  if (params.forwardPayload) builder.storeRef(params.forwardPayload);
  return builder.endCell();
}

async function buildProvideLiquidityJettonTx(params) {
  const userAddr = Address.parse(params.userWalletAddress);
  const routerAddr = Address.parse(cfg.routerAddress);
  const userJettonWallet = await getJettonWallet(params.sendToken.address, userAddr);
  const otherRouterWallet = Address.parse(params.otherToken.routerWallet);
  const gas = params.singleSide
    ? { gas: toNano('1'), forward: toNano('0.8') }
    : { gas: toNano('0.3'), forward: toNano('0.235') };

  const forwardPayload = await router.createProvideLiquidityBody({
    routerWalletAddress: otherRouterWallet,
    receiverAddress: userAddr,
    minLpOut: params.minLpOut,
    refundAddress: userAddr,
    bothPositive: !params.singleSide,
  });

  const body = createJettonTransferMessage({
    queryId: 0,
    amount: params.sendAmount,
    destination: routerAddr,
    responseDestination: userAddr,
    forwardTonAmount: gas.forward,
    forwardPayload,
  });

  return { to: userJettonWallet, value: gas.gas, body };
}

// --- checks ---

if (!apiKey) {
  fail('apiKey', 'ENDPOINT_KEY not set — rate limits likely');
} else {
  pass('apiKey', 'present');
}

const poolRef = cfg.pools[0];
const poolAddr = Address.parse(typeof poolRef === 'string' ? poolRef : poolRef.address);

try {
  const state = await client.getContractState(poolAddr);
  if (state.state === 'active' && state.code) {
    pass('poolContract', `${poolAddr.toString()} active`);
  } else {
    fail('poolContract', `state=${state.state} code=${Boolean(state.code)}`);
  }
} catch (e) {
  fail('poolContract', e.message);
}

try {
  const pool = client.open(DEX.Pool.CPI.create(poolAddr));
  const data = await pool.getPoolData();
  pass('poolData', `reserve0=${data.reserve0} reserve1=${data.reserve1}`);
} catch (e) {
  fail('poolData', e.message);
}

for (const token of cfg.tokens) {
  if (!token.routerWallet) {
    fail(`routerWallet.${token.symbol}`, 'missing in testnet.json');
    continue;
  }
  try {
    const onChain = await getJettonWallet(token.address, cfg.routerAddress);
    const match = onChain.equals(Address.parse(token.routerWallet));
    if (match) pass(`routerWallet.${token.symbol}`, onChain.toString());
    else fail(`routerWallet.${token.symbol}`, `config=${token.routerWallet} chain=${onChain}`);
  } catch (e) {
    fail(`routerWallet.${token.symbol}`, e.message);
  }
}

try {
  const computed = await router.getPoolAddressByJettonMinters({
    token0: cfg.tokens.find((t) => t.symbol === poolRef.token0).address,
    token1: cfg.tokens.find((t) => t.symbol === poolRef.token1).address,
  });
  if (computed.equals(poolAddr)) pass('poolAddressMatch', computed.toString());
  else fail('poolAddressMatch', `computed=${computed} config=${poolAddr}`);
} catch (e) {
  fail('poolAddressMatch', e.message);
}

const tta = cfg.tokens.find((t) => t.symbol === 'TTA');
const ttb = cfg.tokens.find((t) => t.symbol === 'TTB');

for (const [name, fn] of [
  ['swap TON→TTA', () =>
    router.getSwapTonToJettonTxParams({
      userWalletAddress: user,
      proxyTon,
      offerAmount: toNano('1'),
      askJettonAddress: tta.address,
      askJettonWalletAddress: tta.routerWallet,
      minAskAmount: '1',
    })],
  ['swap TTA→TON', async () => {
    const offerWallet = await getJettonWallet(tta.address, user);
    return router.getSwapJettonToTonTxParams({
      userWalletAddress: user,
      offerJettonAddress: tta.address,
      offerJettonWalletAddress: offerWallet,
      offerAmount: toNano('100'),
      minAskAmount: '1',
      proxyTon,
    });
  }],
  ['swap TTA→TTB', async () => {
    const offerWallet = await getJettonWallet(tta.address, user);
    return router.getSwapJettonToJettonTxParams({
      userWalletAddress: user,
      offerJettonAddress: tta.address,
      offerJettonWalletAddress: offerWallet,
      askJettonAddress: ttb.address,
      askJettonWalletAddress: ttb.routerWallet,
      offerAmount: toNano('100'),
      minAskAmount: '1',
    });
  }],
  ['liquidity step1 TTA singleSide', () =>
    buildProvideLiquidityJettonTx({
      userWalletAddress: user,
      sendToken: tta,
      otherToken: ttb,
      sendAmount: toNano('1000'),
      minLpOut: '1',
      singleSide: true,
    })],
  ['liquidity step2 TTB bothPositive', () =>
    buildProvideLiquidityJettonTx({
      userWalletAddress: user,
      sendToken: ttb,
      otherToken: tta,
      sendAmount: toNano('1000'),
      minLpOut: '1',
      singleSide: false,
    })],
]) {
  try {
    const tx = await fn();
    const ok = tx && (tx.to || tx.to?.toString) && tx.value != null && tx.body;
    if (ok) pass(name, `to=${tx.to?.toString?.() ?? tx.to} value=${tx.value?.toString?.() ?? tx.value}`);
    else fail(name, 'incomplete tx object');
  } catch (e) {
    fail(name, e.message);
  }
}

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
console.log('\n--- SUMMARY ---');
console.log(`Passed: ${passed}, Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
