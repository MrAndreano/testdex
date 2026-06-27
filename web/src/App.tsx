import { useEffect, useMemo, useState } from 'react';
import { CHAIN, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { Address, toNano } from '@ton/core';
import type { TestDexConfig, TestDexToken } from './config';
import { loadConfig, parseAmount, formatAmount, tokenMatchesQuery } from './config';
import { createDexContext, TON_ASSET } from './dex';
import { loadLiquidityPools, type LiquidityPoolInfo } from './pools';
import { buildTonConnectMessage, buildTonConnectRequest } from './tonConnectTx';
import { getJettonWalletAddress } from './jettonWallets';
import { buildProvideLiquidityJettonTx, formatTxError } from './txBuilder';
import { buildDeployPoolTx, getPoolAddressForTokens, isPoolDeployed } from './poolDeploy';
import {
  loadCustomTokens,
  mergeConfig,
  parseJettonAddress,
  resolveToken,
  saveCustomPool,
  saveCustomToken,
  shortTokenSymbol,
  isSameToken,
} from './tokens';
import {
  buildCollectFeesTx,
  buildSetPoolFeesTx,
  formatCollected,
  isCreatorWallet,
  loadProtocolFeeStatuses,
  totalCollectableHint,
  waitForFeeRecipientConfigured,
  type ProtocolFeePoolStatus,
} from './adminFees';

type Tab = 'swap' | 'liquidity' | 'admin';
type LiquidityView = 'pools' | 'add';
type LiquidityStep = 'first' | 'deploy' | 'second';

export default function App() {
  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();
  const [cfg, setCfg] = useState<TestDexConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('swap');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusError, setStatusError] = useState(false);

  useEffect(() => {
    loadConfig()
      .then(setCfg)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const showStatus = (message: string | null, isError = false) => {
    setStatus(message);
    setStatusError(isError);
  };

  const [customTokens, setCustomTokens] = useState<TestDexToken[]>(() => loadCustomTokens());
  const [poolsEpoch, setPoolsEpoch] = useState(0);

  const effectiveCfg = useMemo(
    () => (cfg ? mergeConfig(cfg, customTokens) : null),
    [cfg, customTokens, poolsEpoch],
  );

  const addCustomToken = (address: string) => {
    const token = {
      symbol: shortTokenSymbol(address),
      name: 'Jetton',
      address: Address.parse(address).toString(),
      decimals: 9,
    };
    saveCustomToken(token);
    setCustomTokens((prev) => {
      const key = token.address;
      if (prev.some((t) => t.address === key)) return prev;
      return [...prev, token];
    });
    return token;
  };

  const assets = useMemo(() => {
    if (!effectiveCfg) return [TON_ASSET];
    return [TON_ASSET, ...effectiveCfg.tokens.map((t) => t.symbol)];
  }, [effectiveCfg]);

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>TestDex</h1>
          <p className="subtitle">AMM на TON testnet · GitHub Pages</p>
        </div>
        <button type="button" className="wallet-btn" onClick={() => tonConnectUI.openModal()}>
          {wallet ? shortAddr(wallet.account.address) : 'Подключить кошелёк'}
        </button>
      </header>

      {error && <div className="banner error">{error}</div>}
      {wallet && cfg?.network === 'testnet' && wallet.account.chain !== CHAIN.TESTNET && (
        <div className="banner warn">
          Кошелёк подключён к <strong>mainnet</strong>, а TestDex работает на <strong>testnet</strong>.
          Переключите сеть в Tonkeeper: Настройки → Testnet.
        </div>
      )}
      {cfg && !cfg.routerAddress && (
        <div className="banner warn">
          Заполните <code>public/testnet.json</code> адресами контрактов (см. README). Деплой — в{' '}
          <code>C:\Project\TestDex</code>.
        </div>
      )}

      <nav className="tabs">
        <button type="button" className={tab === 'swap' ? 'active' : ''} onClick={() => setTab('swap')}>
          Обмен
        </button>
        <button type="button" className={tab === 'liquidity' ? 'active' : ''} onClick={() => setTab('liquidity')}>
          Ликвидность
        </button>
        <button type="button" className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>
          Админ
        </button>
      </nav>

      {effectiveCfg && tab === 'swap' && (
        <SwapPanel
          cfg={effectiveCfg}
          assets={assets}
          onAddCustomToken={addCustomToken}
          walletAddress={wallet?.account.address}
          busy={busy}
          setBusy={setBusy}
          setStatus={showStatus}
        />
      )}

      {effectiveCfg && tab === 'liquidity' && (
        <LiquidityPanel
          cfg={effectiveCfg}
          assets={assets.filter((a) => a !== TON_ASSET)}
          onAddCustomToken={addCustomToken}
          onPoolSaved={() => setPoolsEpoch((n) => n + 1)}
          walletAddress={wallet?.account.address}
          walletChain={wallet?.account.chain}
          busy={busy}
          setBusy={setBusy}
          setStatus={showStatus}
        />
      )}

      {effectiveCfg && tab === 'admin' && (
        <AdminPanel
          cfg={effectiveCfg}
          walletAddress={wallet?.account.address}
          walletChain={wallet?.account.chain}
          busy={busy}
          setBusy={setBusy}
          setStatus={showStatus}
        />
      )}

      {status && <div className={`banner ${statusError ? 'error' : 'ok'}`}>{status}</div>}

      <footer className="footer">
        <span>Network: testnet</span>
        {cfg?.routerAddress && <span>Router: {shortAddr(cfg.routerAddress)}</span>}
      </footer>
    </div>
  );
}

function AdminPanel(props: {
  cfg: TestDexConfig;
  walletAddress?: string;
  walletChain?: string;
  busy: boolean;
  setBusy: (v: boolean) => void;
  setStatus: (v: string | null, isError?: boolean) => void;
}) {
  const [tonConnectUI] = useTonConnectUI();
  const { cfg, walletAddress, walletChain, busy, setBusy, setStatus } = props;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pools, setPools] = useState<ProtocolFeePoolStatus[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const creatorAddr = cfg.protocolFeeAddress || cfg.adminAddress;
  const isCreator = walletAddress ? isCreatorWallet(cfg, walletAddress) : false;
  const testnet = cfg.network === 'testnet';

  const refresh = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setPools(await loadProtocolFeeStatuses(cfg));
      setUpdatedAt(new Date());
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setPools([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [cfg]);

  const withdrawFees = async (pool: ProtocolFeePoolStatus) => {
    if (!walletAddress) {
      tonConnectUI.openModal();
      return;
    }
    if (testnet && walletChain && walletChain !== CHAIN.TESTNET) {
      setStatus('Кошелёк на mainnet. Включите Testnet в Tonkeeper.', true);
      return;
    }
    if (!isCreator) {
      setStatus('Вывод доступен только с admin-кошелька создателя.', true);
      return;
    }
    if (!pool.canWithdraw) {
      setStatus('Вывод пока недоступен — см. условия ниже.', true);
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      if (!pool.feeRecipientConfigured) {
        setStatus('Шаг 1/2: настройка получателя комиссий (set_fees)…');
        const setupTx = buildSetPoolFeesTx(cfg, pool);
        await tonConnectUI.sendTransaction(
          buildTonConnectRequest(cfg, [buildTonConnectMessage(setupTx, testnet)]),
        );
        const ready = await waitForFeeRecipientConfigured(cfg, pool.poolAddress);
        if (!ready) {
          setStatus('set_fees отправлен, но пул ещё не обновился. Подождите и нажмите ↻.', true);
          return;
        }
      }

      setStatus(
        pool.feeRecipientConfigured
          ? 'Отправка collect_fees…'
          : 'Шаг 2/2: вывод комиссий (collect_fees)…',
      );
      const collectTx = buildCollectFeesTx(pool.poolAddress);
      await tonConnectUI.sendTransaction(
        buildTonConnectRequest(cfg, [buildTonConnectMessage(collectTx, testnet)]),
      );
      setStatus(
        `Комиссии выведены для ${pool.pairLabel}. Jetton на ${shortAddr(creatorAddr)} (~30 с).`,
      );
      setTimeout(() => void refresh(), 15000);
    } catch (e: unknown) {
      setStatus(formatTxError(e), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel admin-panel">
      <div className="panel-head">
        <h2>Protocol fees</h2>
        <button type="button" className="ghost-btn" disabled={loading} title="Обновить" onClick={() => void refresh()}>
          {loading ? '…' : '↻'}
        </button>
      </div>

      <p className="hint">
        Комиссия протокола ({pools[0]?.protocolFeePercent ?? '0.10%'} с swap) копится в пуле. Вывод — на admin-кошелёк ({shortAddr(creatorAddr)}).
      </p>

      <div className="admin-meta">
        <div className="admin-meta-row">
          <span className="admin-meta-label">Получатель jetton</span>
          <code className="admin-meta-value">{shortAddr(creatorAddr)}</code>
        </div>
        <div className="admin-meta-row">
          <span className="admin-meta-label">Ваш кошелёк</span>
          <span className="admin-meta-value">
            {walletAddress ? (
              <>
                {shortAddr(walletAddress)}{' '}
                {isCreator ? <span className="pool-badge ok">создатель</span> : <span className="pool-badge warn">не создатель</span>}
              </>
            ) : (
              'не подключён'
            )}
          </span>
        </div>
      </div>

      {!walletAddress && (
        <div className="banner warn inline">
          Подключите кошелёк создателя ({shortAddr(creatorAddr)}), чтобы подписать вывод.
        </div>
      )}

      {walletAddress && !isCreator && (
        <div className="banner warn inline">
          Вывод доступен только с admin-кошелька <strong>{shortAddr(creatorAddr)}</strong>.
        </div>
      )}

      {loadError && <div className="banner error inline">{loadError}</div>}

      {updatedAt && !loading && (
        <p className="hint pools-updated">Обновлено: {updatedAt.toLocaleTimeString()}</p>
      )}

      {loading && pools.length === 0 && !loadError && <p className="hint empty">Загрузка…</p>}

      <ul className="admin-pool-list">
        {pools.map((pool) => (
          <li key={pool.poolAddress}>
            <article className="admin-pool-card">
              <div className="pool-card-top">
                <span className="pool-pair-symbols">{pool.pairLabel}</span>
                {pool.canWithdraw ? (
                  <span className="pool-badge ok">можно вывести</span>
                ) : (
                  <span className="pool-badge warn">ожидание</span>
                )}
              </div>

              <div className="admin-fee-grid">
                <div className="admin-fee-chip">
                  <span className="pool-reserve-label">{pool.token0.symbol}</span>
                  <span className="pool-reserve-value">
                    {formatCollected(pool.token0.collected, pool.token0.decimals)}
                  </span>
                </div>
                <div className="admin-fee-chip">
                  <span className="pool-reserve-label">{pool.token1.symbol}</span>
                  <span className="pool-reserve-value">
                    {formatCollected(pool.token1.collected, pool.token1.decimals)}
                  </span>
                </div>
              </div>

              {pool.blockers.length > 0 && (
                <ul className="admin-blockers">
                  {pool.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}

              {pool.canWithdraw && (
                <p className="hint admin-ready-hint">
                  К выводу: {totalCollectableHint(pool)} → {shortAddr(creatorAddr)}
                  {!pool.feeRecipientConfigured && ' (при первом выводе — 2 подписи)'}
                </p>
              )}

              <button
                type="button"
                className="primary"
                disabled={busy || !pool.canWithdraw || !isCreator}
                onClick={() => void withdrawFees(pool)}
              >
                {busy ? 'Отправка…' : pool.canWithdraw ? 'Вывести комиссии' : 'Вывод недоступен'}
              </button>
            </article>
          </li>
        ))}
      </ul>

      {!loading && pools.length > 0 && !pools.some((p) => p.canWithdraw) && (
        <p className="hint">
          Сделайте swap в обе стороны, чтобы накопились комиссии по обоим токенам.
        </p>
      )}
    </section>
  );
}

function SwapPanel(props: {
  cfg: TestDexConfig;
  assets: string[];
  onAddCustomToken: (address: string) => TestDexToken;
  walletAddress?: string;
  busy: boolean;
  setBusy: (v: boolean) => void;
  setStatus: (v: string | null, isError?: boolean) => void;
}) {
  const [tonConnectUI] = useTonConnectUI();
  const { cfg, assets, onAddCustomToken, walletAddress, busy, setBusy, setStatus } = props;
  const [from, setFrom] = useState(assets[1] ?? assets[0] ?? TON_ASSET);
  const [to, setTo] = useState(assets[2] ?? assets[1] ?? TON_ASSET);
  const [amount, setAmount] = useState('1');
  const [slippage, setSlippage] = useState('5');

  const swap = async () => {
    if (!walletAddress) {
      tonConnectUI.openModal();
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const dex = createDexContext(cfg);
      const router = Address.parse(cfg.routerAddress);
      const offerToken = from === TON_ASSET ? undefined : resolveToken(cfg, from);
      const askToken = to === TON_ASSET ? undefined : resolveToken(cfg, to);
      const offerAmount =
        from === TON_ASSET ? toNano(amount) : parseAmount(amount, offerToken!.decimals);
      const minAsk = 1n;

      let tx;
      if (from === TON_ASSET && askToken) {
        const askWallet = await getJettonWalletAddress(
          dex,
          Address.parse(askToken.address),
          router,
        );
        tx = await dex.router.getSwapTonToJettonTxParams({
          userWalletAddress: walletAddress,
          proxyTon: dex.proxyTon,
          offerAmount,
          askJettonAddress: askToken.address,
          askJettonWalletAddress: askWallet.toString(),
          minAskAmount: minAsk.toString(),
        });
      } else if (to === TON_ASSET && offerToken) {
        const offerWallet = await getJettonWalletAddress(
          dex,
          Address.parse(offerToken.address),
          Address.parse(walletAddress),
        );
        tx = await dex.router.getSwapJettonToTonTxParams({
          userWalletAddress: walletAddress,
          offerJettonAddress: offerToken.address,
          offerJettonWalletAddress: offerWallet,
          offerAmount,
          minAskAmount: minAsk.toString(),
          proxyTon: dex.proxyTon,
        });
      } else if (offerToken && askToken) {
        const offerWallet = await getJettonWalletAddress(
          dex,
          Address.parse(offerToken.address),
          Address.parse(walletAddress),
        );
        const askWallet = await getJettonWalletAddress(
          dex,
          Address.parse(askToken.address),
          router,
        );
        tx = await dex.router.getSwapJettonToJettonTxParams({
          userWalletAddress: walletAddress,
          offerJettonAddress: offerToken.address,
          offerJettonWalletAddress: offerWallet,
          askJettonAddress: askToken.address,
          askJettonWalletAddress: askWallet.toString(),
          offerAmount,
          minAskAmount: minAsk.toString(),
        });
      } else {
        throw new Error('Неверная пара');
      }

      await tonConnectUI.sendTransaction(
        buildTonConnectRequest(cfg, [buildTonConnectMessage(tx, cfg.network === 'testnet')]),
      );
      setStatus(`Swap отправлен: ${amount} ${from} → ${to}`);
    } catch (e: unknown) {
      setStatus(formatTxError(e), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>Обмен</h2>
      <AssetPicker
        label="Отдаёте"
        cfg={cfg}
        onAddCustomToken={onAddCustomToken}
        value={from}
        onChange={setFrom}
      />
      <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Количество" />
      <AssetPicker
        label="Получаете"
        cfg={cfg}
        onAddCustomToken={onAddCustomToken}
        value={to}
        onChange={setTo}
      />
      <label className="field">
        Slippage %
        <input className="input small" value={slippage} onChange={(e) => setSlippage(e.target.value)} />
      </label>
      <button type="button" className="primary" disabled={busy || !amount} onClick={swap}>
        {busy ? 'Формируем…' : 'Обменять'}
      </button>
    </section>
  );
}

function LiquidityPanel(props: {
  cfg: TestDexConfig;
  assets: string[];
  onAddCustomToken: (address: string) => TestDexToken;
  onPoolSaved: () => void;
  walletAddress?: string;
  walletChain?: string;
  busy: boolean;
  setBusy: (v: boolean) => void;
  setStatus: (v: string | null, isError?: boolean) => void;
}) {
  const { cfg, assets, onAddCustomToken, onPoolSaved, walletAddress, walletChain, busy, setBusy, setStatus } = props;
  const [view, setView] = useState<LiquidityView>('pools');
  const [pools, setPools] = useState<LiquidityPoolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedPool, setSelectedPool] = useState<LiquidityPoolInfo | null>(null);
  const [tokenA, setTokenA] = useState(assets[0] ?? '');
  const [tokenB, setTokenB] = useState(assets[1] ?? assets[0] ?? '');
  const [amountA, setAmountA] = useState('1000');
  const [amountB, setAmountB] = useState('1000');
  const [lpStep, setLpStep] = useState<LiquidityStep>('first');
  const [poolPreview, setPoolPreview] = useState<string | null>(null);
  const [poolsUpdatedAt, setPoolsUpdatedAt] = useState<Date | null>(null);
  const [tonConnectUI] = useTonConnectUI();

  const testnet = cfg.network === 'testnet';

  const sendTonConnectTx = async (tx: {
    to: Address;
    value: bigint;
    body?: import('@ton/core').Cell | null;
    init?: import('@ton/core').StateInit | null;
  }) => {
    await tonConnectUI.sendTransaction(
      buildTonConnectRequest(cfg, [buildTonConnectMessage(tx, testnet)]),
    );
  };

  const resolvePair = () => {
    const jettonA = resolveToken(cfg, tokenA);
    const jettonB = resolveToken(cfg, tokenB);
    if (!jettonA || !jettonB) {
      throw new Error('Выберите оба jetton или вставьте адрес minter (EQ…)');
    }
    if (isSameToken(jettonA, jettonB)) {
      throw new Error('Токены A и B должны быть разными');
    }
    return { jettonA, jettonB };
  };

  const refreshPools = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setPools(await loadLiquidityPools(cfg));
      setPoolsUpdatedAt(new Date());
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setPools([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (view === 'pools') {
      void refreshPools();
    }
  }, [view, cfg]);

  useEffect(() => {
    if (view !== 'add') return;
    let cancelled = false;
    (async () => {
      try {
        const { jettonA, jettonB } = resolvePair();
        const dex = createDexContext(cfg);
        const addr = await getPoolAddressForTokens(dex, jettonA, jettonB);
        if (!cancelled) setPoolPreview(addr.toString());
      } catch {
        if (!cancelled) setPoolPreview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, tokenA, tokenB, cfg]);

  const openAddForPool = (pool: LiquidityPoolInfo) => {
    setSelectedPool(pool);
    setTokenA(pool.token0.address ?? pool.token0.symbol);
    setTokenB(pool.token1.address ?? pool.token1.symbol);
    setLpStep('first');
    setView('add');
  };

  const openCreatePool = () => {
    setSelectedPool(null);
    setLpStep('first');
    setView('add');
  };

  const provideFirst = async () => {
    if (!walletAddress) {
      tonConnectUI.openModal();
      return;
    }
    if (cfg.network === 'testnet' && walletChain && walletChain !== CHAIN.TESTNET) {
      setStatus('Кошелёк на mainnet. Включите Testnet в Tonkeeper.', true);
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const dex = createDexContext(cfg);
      const { jettonA, jettonB } = resolvePair();
      const amtA = parseAmount(amountA, jettonA.decimals);
      if (amtA <= 0n) throw new Error('Укажите количество первого токена');

      const txA = await buildProvideLiquidityJettonTx(dex, cfg, {
        userWalletAddress: walletAddress,
        sendToken: jettonA,
        otherToken: jettonB,
        sendAmount: amtA,
        minLpOut: '1',
        singleSide: true,
      });

      await sendTonConnectTx(txA);
      const poolAddr = await getPoolAddressForTokens(dex, jettonA, jettonB);
      const deployed = await isPoolDeployed(dex, poolAddr);
      setPoolPreview(poolAddr.toString());
      setLpStep(deployed ? 'second' : 'deploy');
      setStatus(
        deployed
          ? `Шаг 1/2: ${formatAmount(amtA, jettonA.decimals)} ${jettonA.symbol} отправлено. Подождите ~15 с и нажмите шаг 2.`
          : `Шаг 1/3: ${formatAmount(amtA, jettonA.decimals)} ${jettonA.symbol} отправлено. Далее — деплой пула (~0.5 TON).`,
      );
      void refreshPools();
    } catch (e: unknown) {
      setStatus(formatTxError(e), true);
    } finally {
      setBusy(false);
    }
  };

  const provideDeploy = async () => {
    if (!walletAddress) {
      tonConnectUI.openModal();
      return;
    }
    if (cfg.network === 'testnet' && walletChain && walletChain !== CHAIN.TESTNET) {
      setStatus('Кошелёк на mainnet. Включите Testnet в Tonkeeper.', true);
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const dex = createDexContext(cfg);
      const { jettonA, jettonB } = resolvePair();
      const tx = await buildDeployPoolTx(dex, cfg, jettonA, jettonB);
      await sendTonConnectTx(tx);
      saveCustomPool(tx.to.toString());
      onPoolSaved();
      setLpStep('second');
      setStatus('Шаг 2/3: пул задеплоен. Подождите ~15 с и отправьте второй токен.');
      void refreshPools();
    } catch (e: unknown) {
      setStatus(formatTxError(e), true);
    } finally {
      setBusy(false);
    }
  };

  const provideSecond = async () => {
    if (!walletAddress) {
      tonConnectUI.openModal();
      return;
    }
    if (cfg.network === 'testnet' && walletChain && walletChain !== CHAIN.TESTNET) {
      setStatus('Кошелёк на mainnet. Включите Testnet в Tonkeeper.', true);
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const dex = createDexContext(cfg);
      const { jettonA, jettonB } = resolvePair();
      const amtB = parseAmount(amountB, jettonB.decimals);
      if (amtB <= 0n) throw new Error('Укажите количество второго токена');

      const txB = await buildProvideLiquidityJettonTx(dex, cfg, {
        userWalletAddress: walletAddress,
        sendToken: jettonB,
        otherToken: jettonA,
        sendAmount: amtB,
        minLpOut: '1',
        singleSide: false,
      });

      await sendTonConnectTx(txB);
      const poolAddr = await getPoolAddressForTokens(dex, jettonA, jettonB);
      saveCustomPool(poolAddr.toString());
      onPoolSaved();
      setLpStep('first');
      setStatus(`Ликвидность добавлена: ${amountA} ${jettonA.symbol} + ${amountB} ${jettonB.symbol}`);
      void refreshPools();
      setView('pools');
    } catch (e: unknown) {
      setStatus(formatTxError(e), true);
    } finally {
      setBusy(false);
    }
  };

  const provide = async () => {
    if (lpStep === 'first') {
      await provideFirst();
    } else if (lpStep === 'deploy') {
      await provideDeploy();
    } else {
      await provideSecond();
    }
  };

  const stepLabel = () => {
    const a = resolveToken(cfg, tokenA)?.symbol ?? 'A';
    const b = resolveToken(cfg, tokenB)?.symbol ?? 'B';
    if (busy) return 'Отправка…';
    if (lpStep === 'first') return `Шаг 1: отправить ${a}`;
    if (lpStep === 'deploy') return 'Шаг 2: задеплоить пул (~0.5 TON)';
    return lpStep === 'second' && !selectedPool ? `Шаг 3: отправить ${b}` : `Шаг 2: отправить ${b}`;
  };

  return (
    <section className="panel liquidity-panel">
      <div className="panel-head">
        <h2>Ликвидность</h2>
        {view === 'pools' && (
          <button
            type="button"
            className="ghost-btn"
            disabled={loading}
            title="Обновить данные пулов"
            onClick={() => void refreshPools()}
          >
            {loading ? '…' : '↻'}
          </button>
        )}
      </div>

      <nav className="sub-tabs" aria-label="Раздел ликвидности">
        <button type="button" className={view === 'pools' ? 'active' : ''} onClick={() => setView('pools')}>
          Пулы
          {pools.length > 0 && <span className="sub-tab-count">{pools.length}</span>}
        </button>
        <button type="button" className={view === 'add' ? 'active' : ''} onClick={() => openCreatePool()}>
          Создать пул
        </button>
      </nav>

      {view === 'pools' && (
        <div className="liquidity-section">
          {poolsUpdatedAt && !loading && (
            <p className="hint pools-updated">
              Обновлено: {poolsUpdatedAt.toLocaleTimeString()}
              {loading ? '' : ' · ↻ для повторного запроса'}
            </p>
          )}
          {loadError && <div className="banner error inline">{loadError}</div>}

          {loading && pools.length === 0 && !loadError && (
            <p className="hint empty">Загрузка пулов…</p>
          )}

          {!loading && !loadError && pools.length === 0 && (
            <div className="liquidity-empty">
              <p className="hint">Создайте пул с любыми jetton testnet — вставьте адрес minter (EQ…) в поле токена.</p>
              <button type="button" className="secondary-btn" onClick={() => openCreatePool()}>
                Создать пул
              </button>
            </div>
          )}

          <ul className="pool-list compact">
            {pools.map((pool) => (
              <li key={pool.address}>
                <PoolCard
                  pool={pool}
                  selected={selectedPool?.address === pool.address}
                  onAdd={() => openAddForPool(pool)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {view === 'add' && (
        <div className="liquidity-section">
          {selectedPool && (
            <div className="selected-pool-banner">
              <span>
                Пул <strong>{selectedPool.pairLabel}</strong>
                {selectedPool.emptyLiquidity && ' · пустой'}
              </span>
              <button type="button" className="link-btn" onClick={() => setSelectedPool(null)}>
                Сбросить
              </button>
            </div>
          )}

          <p className="hint">
            {lpStep === 'deploy'
              ? 'Новый пул: после первого jetton нужен деплой контракта (~0.5 TON), затем второй токен.'
              : 'Выберите два jetton из списка или вставьте адрес minter (EQ…). На шаге 1 нужно ~1 TON на газ.'}
          </p>

          {poolPreview && (
            <p className="hint pool-preview">
              Адрес пула: <code>{shortAddr(poolPreview)}</code>
            </p>
          )}

          {lpStep === 'second' && (
            <div className="selected-pool-banner">
              <span>
                Отправьте <strong>{resolveToken(cfg, tokenB)?.symbol ?? tokenB}</strong> после предыдущих шагов
              </span>
              <button type="button" className="link-btn" onClick={() => setLpStep('first')}>
                Сбросить
              </button>
            </div>
          )}

          {lpStep === 'deploy' && (
            <div className="selected-pool-banner">
              <span>Задеплойте контракт пула перед отправкой второго jetton</span>
              <button type="button" className="link-btn" onClick={() => setLpStep('first')}>
                Сбросить
              </button>
            </div>
          )}

          <div className="liquidity-deposit">
            <div className="deposit-row">
              <AssetPicker
                label="Токен A"
                cfg={cfg}
                includeTon={false}
                onAddCustomToken={onAddCustomToken}
                value={tokenA}
                onChange={setTokenA}
              />
              <input className="input" value={amountA} onChange={(e) => setAmountA(e.target.value)} placeholder="0" />
            </div>
            <div className="deposit-plus" aria-hidden>
              +
            </div>
            <div className="deposit-row">
              <AssetPicker
                label="Токен B"
                cfg={cfg}
                includeTon={false}
                onAddCustomToken={onAddCustomToken}
                value={tokenB}
                onChange={setTokenB}
              />
              <input className="input" value={amountB} onChange={(e) => setAmountB(e.target.value)} placeholder="0" />
            </div>
          </div>

          <button type="button" className="primary" disabled={busy} onClick={provide}>
            {stepLabel()}
          </button>
        </div>
      )}
    </section>
  );
}

function PoolCard(props: {
  pool: LiquidityPoolInfo;
  selected?: boolean;
  onAdd: () => void;
}) {
  const { pool, selected, onAdd } = props;

  return (
    <article className={`pool-card compact ${selected ? 'selected' : ''}`}>
      <div className="pool-card-top">
        <div className="pool-pair">
          <span className="pool-pair-symbols">{pool.token0.symbol}</span>
          <span className="pool-pair-sep">/</span>
          <span className="pool-pair-symbols">{pool.token1.symbol}</span>
        </div>
        <div className="pool-card-badges">
          {pool.emptyLiquidity && <span className="pool-badge warn">Пустой</span>}
          {pool.isLocked && <span className="pool-badge locked">Locked</span>}
        </div>
      </div>

      <div className="pool-reserves compact">
        <div className="pool-reserve-chip">
          <span className="pool-reserve-label">{pool.token0.name}</span>
          <span className="pool-reserve-value">
            {formatAmount(pool.token0.reserve, pool.token0.decimals)} {pool.token0.symbol}
          </span>
        </div>
        <div className="pool-reserve-chip">
          <span className="pool-reserve-label">{pool.token1.name}</span>
          <span className="pool-reserve-value">
            {formatAmount(pool.token1.reserve, pool.token1.decimals)} {pool.token1.symbol}
          </span>
        </div>
      </div>

      <div className="pool-card-footer">
        <span className="pool-meta">{shortAddr(pool.address)}</span>
        <span className="pool-fee-hint">LP {pool.lpFeePercent}</span>
        <button type="button" className="secondary-btn small" onClick={onAdd}>
          Внести
        </button>
      </div>

      {!pool.emptyLiquidity && (
        <div className="pool-price-line">{pool.priceLabel}</div>
      )}
    </article>
  );
}

function AssetPicker(props: {
  label: string;
  cfg: TestDexConfig;
  includeTon?: boolean;
  value: string;
  onChange: (v: string) => void;
  onAddCustomToken?: (address: string) => TestDexToken;
}) {
  const { label, cfg, includeTon = true, value, onChange, onAddCustomToken } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const options = useMemo(() => {
    const list: { id: string; title: string; subtitle?: string; custom?: boolean }[] = [];
    if (includeTon) list.push({ id: TON_ASSET, title: 'TON', subtitle: 'Native' });
    for (const t of cfg.tokens) {
      list.push({ id: t.symbol, title: `${t.symbol} — ${t.name}`, subtitle: t.address });
    }
    return list;
  }, [cfg, includeTon]);

  const filtered = useMemo(() => {
    const q = query.trim();
    const base = !q
      ? options
      : options.filter((opt) => {
          if (opt.id === TON_ASSET) return /ton|native/i.test(q);
          const token = cfg.tokens.find((t) => t.symbol === opt.id);
          return token ? tokenMatchesQuery(token, q) : false;
        });

    const addr = parseJettonAddress(q);
    if (!addr) return base;

    const addrStr = addr.toString();
    const alreadyListed = cfg.tokens.some(
      (t) => t.address === addrStr || t.symbol === q,
    );
    if (alreadyListed) return base;

    return [
      ...base,
      {
        id: addrStr,
        title: `Jetton ${shortTokenSymbol(addrStr)}`,
        subtitle: addrStr,
        custom: true,
      },
    ];
  }, [options, query, cfg]);

  const resolved = resolveToken(cfg, value);
  const selectedTitle = value === TON_ASSET
    ? 'TON'
    : resolved
      ? `${resolved.symbol} — ${resolved.name}`
      : value;

  const pick = (id: string, custom?: boolean) => {
    if (custom && onAddCustomToken) {
      onAddCustomToken(id);
      onChange(id);
    } else if (id.startsWith('EQ') || id.startsWith('UQ') || id.includes(':')) {
      if (onAddCustomToken) onAddCustomToken(id);
      onChange(id);
    } else {
      onChange(id);
    }
    setOpen(false);
    setQuery('');
  };

  return (
    <label className="field">
      {label}
      <div className="token-select">
        <input
          className="input"
          value={open ? query : selectedTitle}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtered.length === 1) {
              e.preventDefault();
              const opt = filtered[0]!;
              pick(opt.id, opt.custom);
            }
            if (e.key === 'Escape') {
              setOpen(false);
              setQuery('');
            }
          }}
          placeholder="Символ, имя или адрес (EQ…)"
        />
        {open && filtered.length > 0 && (
          <ul className="token-select-list" role="listbox">
            {filtered.map((opt) => (
              <li key={opt.id}>
                <button
                  type="button"
                  role="option"
                  className={opt.id === value || opt.title.startsWith(resolved?.symbol ?? '§') ? 'active' : ''}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(opt.id, opt.custom)}
                >
                  <span className="token-select-title">{opt.title}</span>
                  {opt.subtitle && opt.id !== TON_ASSET && (
                    <span className="token-select-addr">{shortAddr(opt.subtitle)}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {open && filtered.length === 0 && query.trim() && (
          <div className="token-select-empty">Вставьте адрес jetton minter (EQ…)</div>
        )}
        {open && (
          <button
            type="button"
            className="token-select-backdrop"
            aria-label="Закрыть"
            onClick={() => {
              setOpen(false);
              setQuery('');
            }}
          />
        )}
      </div>
    </label>
  );
}

function shortAddr(addr: string): string {
  try {
    const friendly = Address.parse(addr).toString({ bounceable: false });
    return `${friendly.slice(0, 6)}…${friendly.slice(-4)}`;
  } catch {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  }
}
