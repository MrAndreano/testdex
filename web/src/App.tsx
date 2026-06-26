import { useEffect, useMemo, useState } from 'react';
import { CHAIN, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { Address, toNano } from '@ton/core';
import { loadConfig, parseAmount, formatAmount, tokenMatchesQuery, findToken, type TestDexConfig } from './config';
import { createDexContext, TON_ASSET } from './dex';
import { loadLiquidityPools, type LiquidityPoolInfo } from './pools';
import { buildTonConnectMessage, buildTonConnectRequest } from './tonConnectTx';
import { getJettonWalletAddress } from './jettonWallets';
import { buildProvideLiquidityJettonTx, formatTxError } from './txBuilder';

type Tab = 'swap' | 'liquidity';
type LiquidityView = 'pools' | 'add';
type LiquidityStep = 'first' | 'second';

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

  const assets = useMemo(() => {
    if (!cfg) return [TON_ASSET];
    return [TON_ASSET, ...cfg.tokens.map((t) => t.symbol)];
  }, [cfg]);

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
      </nav>

      {cfg && tab === 'swap' && (
        <SwapPanel
          cfg={cfg}
          assets={assets}
          walletAddress={wallet?.account.address}
          busy={busy}
          setBusy={setBusy}
          setStatus={showStatus}
        />
      )}

      {cfg && tab === 'liquidity' && (
        <LiquidityPanel
          cfg={cfg}
          assets={assets.filter((a) => a !== TON_ASSET)}
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

function SwapPanel(props: {
  cfg: TestDexConfig;
  assets: string[];
  walletAddress?: string;
  busy: boolean;
  setBusy: (v: boolean) => void;
  setStatus: (v: string | null, isError?: boolean) => void;
}) {
  const [tonConnectUI] = useTonConnectUI();
  const { cfg, assets, walletAddress, busy, setBusy, setStatus } = props;
  const [from, setFrom] = useState(assets[0] ?? TON_ASSET);
  const [to, setTo] = useState(assets[1] ?? 'TTA');
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
      const offerToken = findToken(cfg, from);
      const askToken = findToken(cfg, to);
      const offerAmount = from === TON_ASSET ? toNano(amount) : parseAmount(amount, offerToken!.decimals);
      const minAsk = 1n;

      let tx;
      if (from === TON_ASSET && askToken) {
        tx = await dex.router.getSwapTonToJettonTxParams({
          userWalletAddress: walletAddress,
          proxyTon: dex.proxyTon,
          offerAmount,
          askJettonAddress: askToken.address,
          askJettonWalletAddress: askToken.routerWallet,
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
        tx = await dex.router.getSwapJettonToJettonTxParams({
          userWalletAddress: walletAddress,
          offerJettonAddress: offerToken.address,
          offerJettonWalletAddress: offerWallet,
          askJettonAddress: askToken.address,
          askJettonWalletAddress: askToken.routerWallet,
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
      <AssetPicker label="Отдаёте" cfg={cfg} value={from} onChange={setFrom} />
      <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Количество" />
      <AssetPicker label="Получаете" cfg={cfg} value={to} onChange={setTo} />
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
  walletAddress?: string;
  walletChain?: string;
  busy: boolean;
  setBusy: (v: boolean) => void;
  setStatus: (v: string | null, isError?: boolean) => void;
}) {
  const { cfg, assets, walletAddress, walletChain, busy, setBusy, setStatus } = props;
  const [view, setView] = useState<LiquidityView>('pools');
  const [pools, setPools] = useState<LiquidityPoolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedPool, setSelectedPool] = useState<LiquidityPoolInfo | null>(null);
  const [tokenA, setTokenA] = useState(assets[0] ?? 'TTA');
  const [tokenB, setTokenB] = useState(assets[1] ?? 'TTB');
  const [amountA, setAmountA] = useState('1000');
  const [amountB, setAmountB] = useState('1000');
  const [lpStep, setLpStep] = useState<LiquidityStep>('first');
  const [poolsUpdatedAt, setPoolsUpdatedAt] = useState<Date | null>(null);
  const [tonConnectUI] = useTonConnectUI();

  const testnet = cfg.network === 'testnet';

  const sendTonConnectTx = async (tx: { to: Address; value: bigint; body?: import('@ton/core').Cell | null }) => {
    await tonConnectUI.sendTransaction(
      buildTonConnectRequest(cfg, [buildTonConnectMessage(tx, testnet)]),
    );
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

  const openAddForPool = (pool: LiquidityPoolInfo) => {
    setSelectedPool(pool);
    setTokenA(pool.token0.symbol);
    setTokenB(pool.token1.symbol);
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
      const jettonA = findToken(cfg, tokenA)!;
      const jettonB = findToken(cfg, tokenB)!;
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
      setLpStep('second');
      setStatus(
        `Шаг 1/2: ${formatAmount(amtA, jettonA.decimals)} ${tokenA} отправлено. ` +
          `Подождите ~15 с и нажмите «Шаг 2: ${tokenB}». Нужно ~1 TON на газ.`,
      );
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
      const jettonA = findToken(cfg, tokenA)!;
      const jettonB = findToken(cfg, tokenB)!;
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
      setLpStep('first');
      setStatus(`Ликвидность добавлена: ${amountA} ${tokenA} + ${amountB} ${tokenB}`);
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
    } else {
      await provideSecond();
    }
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
        <button type="button" className={view === 'add' ? 'active' : ''} onClick={() => setView('add')}>
          Внести
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
              <p className="hint">Добавьте адрес пула в <code>testnet.json</code> или создайте новый через «Внести».</p>
              <button type="button" className="secondary-btn" onClick={() => setView('add')}>
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
            Два шага: сначала {tokenA}, затем {tokenB}. На шаге 1 нужно ~1 TON на газ. Tonkeeper на Android: подтверждайте каждый шаг отдельно.
          </p>

          {lpStep === 'second' && (
            <div className="selected-pool-banner">
              <span>
                Шаг 2/2 — отправьте <strong>{tokenB}</strong> после подтверждения первой транзакции
              </span>
              <button type="button" className="link-btn" onClick={() => setLpStep('first')}>
                Сбросить
              </button>
            </div>
          )}

          <div className="liquidity-deposit">
            <div className="deposit-row">
              <AssetPicker label="Токен A" cfg={cfg} includeTon={false} value={tokenA} onChange={setTokenA} />
              <input className="input" value={amountA} onChange={(e) => setAmountA(e.target.value)} placeholder="0" />
            </div>
            <div className="deposit-plus" aria-hidden>
              +
            </div>
            <div className="deposit-row">
              <AssetPicker label="Токен B" cfg={cfg} includeTon={false} value={tokenB} onChange={setTokenB} />
              <input className="input" value={amountB} onChange={(e) => setAmountB(e.target.value)} placeholder="0" />
            </div>
          </div>

          <button type="button" className="primary" disabled={busy} onClick={provide}>
            {busy
              ? 'Отправка…'
              : lpStep === 'first'
                ? `Шаг 1: отправить ${tokenA}`
                : `Шаг 2: отправить ${tokenB}`}
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
}) {
  const { label, cfg, includeTon = true, value, onChange } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const options = useMemo(() => {
    const list: { id: string; title: string; subtitle?: string }[] = [];
    if (includeTon) list.push({ id: TON_ASSET, title: 'TON', subtitle: 'Native' });
    for (const t of cfg.tokens) {
      list.push({ id: t.symbol, title: `${t.symbol} — ${t.name}`, subtitle: t.address });
    }
    return list;
  }, [cfg, includeTon]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return options;
    return options.filter((opt) => {
      if (opt.id === TON_ASSET) return /ton|native/i.test(q);
      const token = cfg.tokens.find((t) => t.symbol === opt.id);
      return token ? tokenMatchesQuery(token, q) : false;
    });
  }, [options, query, cfg]);

  const selected = options.find((o) => o.id === value);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  return (
    <label className="field">
      {label}
      <div className="token-select">
        <input
          className="input"
          value={open ? query : selected?.title ?? value}
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
              pick(filtered[0]!.id);
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
                  className={opt.id === value ? 'active' : ''}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(opt.id)}
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
          <div className="token-select-empty">Токен не найден</div>
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
