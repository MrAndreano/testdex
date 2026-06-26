import { readFileSync } from 'node:fs';
import { TonClient, Address, beginCell } from '@ton/ton';

const cfg = JSON.parse(readFileSync(new URL('../public/testnet.json', import.meta.url), 'utf8'));
const client = new TonClient({ endpoint: cfg.tonApiEndpoint });
const router = Address.parse(cfg.routerAddress);

const res = await client.runMethod(Address.parse(cfg.ptonMasterAddress), 'get_wallet_address', [
  { type: 'slice', cell: beginCell().storeAddress(router).endCell() },
]);
console.log('ptonRouterWallet:', res.stack.readAddress().toString());
