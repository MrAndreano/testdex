/**
 * Check protocol fees accumulated in pool and whether collect_fees is possible.
 * Usage: ENDPOINT_KEY=... node scripts/check-protocol-fees.mjs
 */
import { readFileSync } from 'node:fs';
import { TonClient } from '@ton/ton';
import { Address, beginCell, toNano } from '@ton/core';
import { DEX } from '@ston-fi/sdk/dex/v2_1';

const cfg = JSON.parse(readFileSync(new URL('../public/testnet.json', import.meta.url), 'utf8'));
const apiKey = process.env.ENDPOINT_KEY || process.env.VITE_TON_API_KEY || cfg.tonApiKey;
const client = new TonClient({ endpoint: cfg.tonApiEndpoint, apiKey });
const poolAddr = Address.parse(cfg.pools[0].address);
const pool = client.open(DEX.Pool.CPI.create(poolAddr));
const data = await pool.getPoolData();

const fmt = (n, d = 9) => (Number(n) / 10 ** d).toLocaleString(undefined, { maximumFractionDigits: 6 });

console.log('Pool:', poolAddr.toString());
console.log('Protocol fee address:', data.protocolFeeAddress.toString());
console.log('Config protocolFeeAddress:', cfg.protocolFeeAddress);
console.log('Match:', data.protocolFeeAddress.equals(Address.parse(cfg.protocolFeeAddress)));
console.log('');
console.log('Protocol fee rate:', `${Number(data.protocolFee) / 100}% (bps ${data.protocolFee})`);
console.log('Reserve0 (TTB side):', fmt(data.reserve0));
console.log('Reserve1 (TTA side):', fmt(data.reserve1));
console.log('');
console.log('Collected protocol fee token0:', data.collectedToken0ProtocolFee.toString(), `(${fmt(data.collectedToken0ProtocolFee)})`);
console.log('Collected protocol fee token1:', data.collectedToken1ProtocolFee.toString(), `(${fmt(data.collectedToken1ProtocolFee)})`);

const canCollect =
  data.collectedToken0ProtocolFee > 0n && data.collectedToken1ProtocolFee > 0n;
console.log('');
if (canCollect) {
  console.log('collect_fees: READY — оба счётчика > 0, можно вызывать collect_fees');
  console.log('Отправитель: любой кошелёк с ~0.5–1.1 TON на газ');
  console.log('Получатель jetton: protocolFeeAddress выше');
} else {
  console.log('collect_fees: NOT READY — нужны swap в обе стороны (TTA→TTB и TTB→TTA)');
  if (data.collectedToken0ProtocolFee === 0n) console.log('  - collected token0 = 0');
  if (data.collectedToken1ProtocolFee === 0n) console.log('  - collected token1 = 0');
}

async function jettonBalance(minterStr, ownerStr) {
  const minter = Address.parse(minterStr);
  const owner = Address.parse(ownerStr);
  const res = await client.runMethod(minter, 'get_wallet_address', [
    { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
  ]);
  const wallet = res.stack.readAddress();
  const state = await client.getContractState(wallet);
  if (state.state !== 'active') return { wallet: wallet.toString(), balance: 0n };
  const wd = await client.runMethod(wallet, 'get_wallet_data');
  return { wallet: wallet.toString(), balance: wd.stack.readBigNumber() };
}

const admin = cfg.protocolFeeAddress;
const ttb = cfg.tokens.find((t) => t.symbol === 'TTB');
const tta = cfg.tokens.find((t) => t.symbol === 'TTA');
console.log('\n--- Jetton balances on protocolFeeAddress ---');
for (const t of [ttb, tta]) {
  const b = await jettonBalance(t.address, admin);
  console.log(`${t.symbol}: ${fmt(b.balance)} (wallet ${b.wallet})`);
}
