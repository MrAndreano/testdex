import { Address, beginCell, storeStateInit, type Cell, type StateInit } from '@ton/core';
import type { TestDexConfig } from './config';

export type TonConnectOutgoingMessage = {
  address: string;
  amount: string;
  payload?: string;
  stateInit?: string;
};

type TxLike = {
  to: Address;
  value: bigint;
  body?: Cell | null;
  init?: StateInit | null;
};

export function buildTonConnectMessage(tx: TxLike, testnet: boolean): TonConnectOutgoingMessage {
  const msg: TonConnectOutgoingMessage = {
    address: tx.to.toString({ bounceable: true, testOnly: testnet }),
    amount: tx.value.toString(),
  };

  if (tx.init) {
    msg.stateInit = beginCell().store(storeStateInit(tx.init)).endCell().toBoc().toString('base64');
  }

  if (tx.body) {
    msg.payload = tx.body.toBoc().toString('base64');
  }

  return msg;
}

export function buildTonConnectRequest(cfg: TestDexConfig, messages: TonConnectOutgoingMessage[]) {
  return {
    validUntil: Math.floor(Date.now() / 1000) + 600,
    network: cfg.network === 'testnet' ? '-3' : '-239',
    messages,
  };
}
