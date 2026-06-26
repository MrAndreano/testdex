import { readFileSync } from 'node:fs';
import { TonClient } from '@ton/ton';
import { Address, beginCell } from '@ton/core';
import { DEX } from '@ston-fi/sdk/dex/v2_1';

const cfg = JSON.parse(readFileSync(new URL('../public/testnet.json', import.meta.url), 'utf8'));
const poolRef = cfg.pools[0];
const poolAddr = Address.parse(typeof poolRef === 'string' ? poolRef : poolRef.address);
const client = new TonClient({ endpoint: cfg.tonApiEndpoint });

const state = await client.getContractState(poolAddr);
console.log('contract state:', state.state, 'code:', state.code ? 'present' : 'null');

let routerFromPool;
try {
  const pool = client.open(DEX.Pool.CPI.create(poolAddr));
  const data = await pool.getPoolData();
  routerFromPool = data.routerAddress;
  console.log('getPoolData OK');
  console.log('  reserve0:', data.reserve0.toString());
  console.log('  reserve1:', data.reserve1.toString());
  console.log('  router:', data.routerAddress.toString());
} catch (e) {
  console.error('getPoolData FAILED:', e.message);
}

const router = client.open(DEX.Router.CPI.create(cfg.routerAddress));
try {
  const computed = await router.getPoolAddressByJettonMinters({
    token0: cfg.tokens[0].address,
    token1: cfg.tokens[1].address,
  });
  console.log('computed pool:', computed.toString());
  console.log('matches config:', computed.equals(poolAddr));
} catch (e) {
  console.error('getPoolAddressByJettonMinters FAILED:', e.message);
}

if (routerFromPool) {
  try {
    await client.runMethod(Address.parse(cfg.tokens[0].address), 'get_wallet_address', [
      { type: 'slice', cell: beginCell().storeAddress(routerFromPool).endCell() },
    ]);
    console.log('get_wallet_address OK');
  } catch (e) {
    console.error('get_wallet_address FAILED:', e.message);
  }
}
