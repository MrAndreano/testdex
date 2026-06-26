/**
 * List jettons on testnet wallet (from contracts/.env).
 * Usage: cd contracts && npx tsx scripts/listWalletJettons.ts
 */
import 'dotenv/config';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { Address, TonClient, WalletContractV5R1 } from '@ton/ton';

const cfg = {
  tta: 'EQCFlOGfOpNARgwg2xYGkWbycXQXmyYsROrdfvhFoi0BR-XN',
  ttb: 'EQDhouSO869-fpLI99a-Y2ElljqlaUlFnxcSWq5y-BCxtf1I',
};

async function getJettonMeta(client: TonClient, minter: Address) {
  try {
    const res = await client.runMethod(minter, 'get_jetton_data');
    const totalSupply = res.stack.readBigNumber();
    const mintable = res.stack.readBoolean();
    const admin = res.stack.readAddressOpt();
    const content = res.stack.readCell();
    return { totalSupply, mintable, admin, content: content.toString() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function getWalletBalance(client: TonClient, minter: Address, owner: Address) {
  try {
    const res = await client.runMethod(minter, 'get_wallet_address', [
      { type: 'slice', cell: (await import('@ton/core')).beginCell().storeAddress(owner).endCell() },
    ]);
    const walletAddr = res.stack.readAddress();
    const state = await client.getContractState(walletAddr);
    if (state.state !== 'active') return { wallet: walletAddr.toString(), balance: 0n };
    const data = await client.runMethod(walletAddr, 'get_wallet_data');
    data.stack.skip(2); // balance, owner
    const balance = data.stack.readBigNumber();
    return { wallet: walletAddr.toString(), balance };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchTonApiJettons(address: string) {
  const url = `https://testnet.tonapi.io/v2/accounts/${address}/jettons`;
  const res = await fetch(url);
  if (!res.ok) return { error: `${res.status} ${res.statusText}` };
  return res.json();
}

async function main() {
  const mnemonic = process.env.WALLET_MNEMONIC ?? '';
  if (!mnemonic) throw new Error('WALLET_MNEMONIC missing');
  const kp = await mnemonicToPrivateKey(mnemonic.split(' '));
  const wallet = WalletContractV5R1.create({
    publicKey: kp.publicKey,
    walletId: {
      networkGlobalId: -3,
      context: { workchain: 0, walletVersion: 'v5r1', subwalletNumber: 0 },
    },
  });
  const addr = wallet.address;
  console.log('Testnet wallet:', addr.toString());

  const client = new TonClient({
    endpoint: process.env.ENDPOINT_URL ?? 'https://testnet.toncenter.com/api/v2/jsonRPC',
    apiKey: process.env.ENDPOINT_KEY,
  });

  const tonState = await client.getContractState(addr);
  console.log('TON balance:', tonState.balance.toString(), 'nanoTON');

  console.log('\n--- Known TestDex tokens ---');
  for (const [sym, minterStr] of Object.entries(cfg)) {
    const minter = Address.parse(minterStr);
    const bal = await getWalletBalance(client, minter, addr);
    console.log(sym, minterStr, bal);
  }

  console.log('\n--- TonAPI: all jettons on wallet ---');
  const jettons = await fetchTonApiJettons(addr.toString({ urlSafe: true, bounceable: true, testOnly: true }));
  if (jettons.error) {
    console.log('TonAPI error:', jettons.error);
    return;
  }
  const list = jettons.balances ?? jettons.jettons ?? [];
  if (!Array.isArray(list) || list.length === 0) {
    console.log('No jettons found via TonAPI');
    return;
  }
  for (const j of list) {
    const info = j.jetton ?? j;
    const meta = info.metadata ?? j.metadata ?? {};
    const symbol = meta.symbol ?? info.symbol ?? '?';
    const name = meta.name ?? info.name ?? '?';
    const balance = j.balance ?? j.quantity ?? '0';
    const minter = (info.address ?? j.jetton?.address ?? j.address ?? '?').toString();
    console.log({ symbol, name, balance, minter });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
