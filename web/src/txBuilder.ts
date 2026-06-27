import { Address, beginCell, toNano, type Cell } from '@ton/core';
import type { DexContext } from './dex';
import type { TestDexConfig, TestDexToken } from './config';
import { getJettonWalletAddress, getRouterJettonWallet } from './jettonWallets';

const GAS = {
  provideLpJetton: { gas: toNano('0.3'), forward: toNano('0.235') },
  singleSideProvideLpJetton: { gas: toNano('1'), forward: toNano('0.8') },
};

function createJettonTransferMessage(params: {
  queryId: number | bigint;
  amount: bigint;
  destination: Address;
  responseDestination?: Address;
  customPayload?: Cell;
  forwardTonAmount: bigint;
  forwardPayload?: Cell;
}): Cell {
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

export async function buildProvideLiquidityJettonTx(
  dex: DexContext,
  cfg: TestDexConfig,
  params: {
    userWalletAddress: string;
    sendToken: TestDexToken;
    otherToken: TestDexToken;
    sendAmount: bigint;
    minLpOut: string;
    singleSide: boolean;
  },
): Promise<{ to: Address; value: bigint; body: Cell }> {
  const user = Address.parse(params.userWalletAddress);
  const router = Address.parse(cfg.routerAddress);

  const userJettonWallet = await getJettonWalletAddress(
    dex,
    Address.parse(params.sendToken.address),
    user,
  );
  const otherRouterWallet = await getRouterJettonWallet(
    dex,
    params.otherToken,
    router,
  );
  const gas = params.singleSide ? GAS.singleSideProvideLpJetton : GAS.provideLpJetton;

  const forwardPayload = await dex.router.createProvideLiquidityBody({
    routerWalletAddress: otherRouterWallet,
    receiverAddress: user,
    minLpOut: params.minLpOut,
    refundAddress: user,
    bothPositive: !params.singleSide,
  });

  const body = createJettonTransferMessage({
    queryId: 0,
    amount: params.sendAmount,
    destination: router,
    responseDestination: user,
    forwardTonAmount: gas.forward,
    forwardPayload,
  });

  return { to: userJettonWallet, value: gas.gas, body };
}

export function formatTxError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/429|rate limit/i.test(msg)) {
    return 'Toncenter ограничил запросы (429). Подождите 30–60 с и попробуйте снова.';
  }
  if (/reject|cancel|declined|user rejects/i.test(msg)) {
    return 'Транзакция отменена в кошельке.';
  }
  if (/network|chain|testnet/i.test(msg)) {
    return `${msg}. Убедитесь, что кошелёк в режиме Testnet.`;
  }
  return msg;
}
