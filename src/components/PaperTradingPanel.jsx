import { useEffect, useState } from 'react';
import { fetchYahooJson, getYahooSymbol } from '../lib/yahoo.js';
import { calculatePositionPnl, getPositionRiskStatus } from '../lib/paperTrading.js';

const API_BASE = String(
  import.meta.env.VITE_BACKEND_API_BASE_URL || 'https://techstock-backend-gzws.onrender.com',
).replace(/\/+$/, '');
const RISK_LIMITS_STORAGE_KEY = 'techstock-paper-risk-limits';

function readRiskLimits() {
  try {
    const saved = window.localStorage.getItem(RISK_LIMITS_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.error('Unable to load saved paper-trading risk limits:', error);
    return {};
  }
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Backend request failed (HTTP ${response.status}).`);
  }
  return payload;
}

function formatMoney(value, currency) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export default function PaperTradingPanel({
  stock,
  currency = 'USD',
  currentPrice,
  market = 'United States',
  yahooApiBaseUrl = '',
}) {
  const [portfolio, setPortfolio] = useState(null);
  const [marketQuoteState, setMarketQuoteState] = useState({ symbolsKey: '', prices: {}, errors: {} });
  const [riskLimits, setRiskLimits] = useState(readRiskLimits);
  const [startingCashSetting, setStartingCashSetting] = useState('100000');
  const [symbol, setSymbol] = useState(stock?.symbol || '');
  const [side, setSide] = useState('buy');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState(Number.isFinite(Number(currentPrice)) ? String(currentPrice) : '');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setSymbol(stock?.symbol || '');
  }, [stock?.symbol]);

  useEffect(() => {
    if (Number.isFinite(Number(currentPrice)) && Number(currentPrice) > 0) {
      setPrice(String(currentPrice));
    }
  }, [currentPrice]);

  async function loadPortfolio() {
    setLoading(true);
    setError('');
    if (!API_BASE) {
      setError('Paper trading is unavailable: no backend is configured for this deployment. Deploy a TechStock backend and set VITE_BACKEND_API_BASE_URL to its HTTPS URL in Vercel, then redeploy.');
      setLoading(false);
      return;
    }

    try {
      const data = await requestJson('/api/paper-trading/summary');
      setPortfolio(data.portfolio);
      setStartingCashSetting(String(data.portfolio.startingCash));
    } catch (requestError) {
      setError(`${requestError.message} Check that the configured backend is reachable and supports the paper-trading API.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPortfolio();
  }, []);

  async function executeOrder(order) {
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const data = await requestJson('/api/paper-trading/orders', {
        method: 'POST',
        body: JSON.stringify(order),
      });
      setPortfolio(data.portfolio);
      setMessage(`${order.side === 'buy' ? 'Bought' : 'Sold'} ${order.quantity} ${order.symbol.toUpperCase()} at ${formatMoney(order.price, currency)} (simulated).`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitOrder(event) {
    event.preventDefault();
    await executeOrder({
      symbol: symbol.trim(),
      side,
      quantity: Number(quantity),
      price: Number(price),
    });
  }

  async function sellPosition(position) {
    const salePrice = marketPrices[position.symbol];
    if (!Number.isFinite(salePrice) || salePrice <= 0) {
      setError(`Cannot sell ${position.symbol}: a current market price is unavailable.`);
      return;
    }
    if (!window.confirm(`Sell all ${position.quantity} ${position.symbol} at ${formatMoney(salePrice, currency)}?`)) return;
    await executeOrder({
      symbol: position.symbol,
      side: 'sell',
      quantity: Number(position.quantity),
      price: salePrice,
    });
  }

  function updateRiskLimit(positionSymbol, field, value) {
    setRiskLimits((current) => ({
      ...current,
      [positionSymbol]: { ...current[positionSymbol], [field]: value },
    }));
  }

  async function resetAccount(event) {
    event.preventDefault();
    if (!window.confirm('Reset paper account? This clears all open positions and simulated order history.')) return;

    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      const data = await requestJson('/api/paper-trading/reset', {
        method: 'PUT',
        body: JSON.stringify({ startingCash: Number(startingCashSetting) }),
      });
      setPortfolio(data.portfolio);
      setMessage(`Paper account reset to ${formatMoney(data.portfolio.startingCash, currency)}.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  const positions = Object.values(portfolio?.positions || {});
  const orders = [...(portfolio?.orders || [])].reverse();
  const positionSymbols = Object.keys(portfolio?.positions || {}).sort().join('|');
  const marketPrices = marketQuoteState.symbolsKey === positionSymbols ? marketQuoteState.prices : {};
  const marketPriceErrors = marketQuoteState.symbolsKey === positionSymbols ? marketQuoteState.errors : {};
  const allPositionsPriced = positions.every((position) => (
    Number.isFinite(marketPrices[position.symbol]) && Number.isFinite(Number(position.quantity))
  ));
  const markedPortfolioPnl = portfolio && allPositionsPriced
    ? Number(portfolio.cash) +
      positions.reduce((total, position) => total + Number(position.quantity) * marketPrices[position.symbol], 0) -
      Number(portfolio.startingCash)
    : null;

  useEffect(() => {
    try {
      window.localStorage.setItem(RISK_LIMITS_STORAGE_KEY, JSON.stringify(riskLimits));
    } catch (error) {
      console.error('Unable to save paper-trading risk limits:', error);
    }
  }, [riskLimits]);

  useEffect(() => {
    if (!positionSymbols) return undefined;

    const controller = new AbortController();

    async function refreshMarketPrices() {
      const results = await Promise.all(positionSymbols.split('|').map(async (positionSymbol) => {
        try {
          const exchange = positionSymbol.toUpperCase() === stock?.symbol?.toUpperCase()
            ? stock.exchange
            : undefined;
          const yahooSymbol = getYahooSymbol({ symbol: positionSymbol, exchange }, market);
          const params = new URLSearchParams({ interval: '1d', range: '1d' });
          const data = await fetchYahooJson(
            `/api/yahoo/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?${params}`,
            yahooApiBaseUrl,
            { signal: controller.signal, ttl: 15_000 },
          );
          const result = data.chart?.result?.[0];
          const priceValue = result?.meta?.regularMarketPrice ??
            result?.indicators?.quote?.[0]?.close?.at(-1);
          const price = Number(priceValue);
          if (!Number.isFinite(price) || price <= 0) throw new Error('Yahoo did not return a usable price.');
          return { symbol: positionSymbol, price };
        } catch (error) {
          if (controller.signal.aborted) return null;
          return { symbol: positionSymbol, error: error.message || 'Market price unavailable.' };
        }
      }));

      if (controller.signal.aborted) return;
      setMarketQuoteState({
        symbolsKey: positionSymbols,
        prices: Object.fromEntries(results.filter((result) => result && Number.isFinite(result.price))
          .map(({ symbol: positionSymbol, price: marketPrice }) => [positionSymbol, marketPrice])),
        errors: Object.fromEntries(results.filter((result) => result?.error)
          .map(({ symbol: positionSymbol, error }) => [positionSymbol, error])),
      });
    }

    refreshMarketPrices();
    const refreshTimer = window.setInterval(refreshMarketPrices, 30_000);
    return () => {
      controller.abort();
      window.clearInterval(refreshTimer);
    };
  }, [positionSymbols, market, stock?.symbol, stock?.exchange, yahooApiBaseUrl]);

  return (
    <section id="panel-paper" aria-labelledby="tab-paper" className="scanner-panel paper-trading-panel" role="tabpanel">
      <div className="scanner-heading">
        <div>
          <h2>Paper trading</h2>
          <p>Practice with simulated market orders. Orders do not reach a broker.</p>
        </div>
        <button type="button" className="secondary-button" onClick={loadPortfolio} disabled={loading || !API_BASE}>
          {loading ? 'Refreshing…' : 'Refresh account'}
        </button>
      </div>

      {error && <p className="scanner-error" role="alert">{error}</p>}
      {message && <p className="history-message" role="status">{message}</p>}

      <div className="metrics-grid paper-summary-grid">
        <div className="metric"><span>Starting cash</span><strong>{formatMoney(portfolio?.startingCash, currency)}</strong></div>
        <div className="metric"><span>Available cash</span><strong>{formatMoney(portfolio?.cash, currency)}</strong></div>
        <div className="metric"><span>Invested at average cost</span><strong>{formatMoney(portfolio?.totalInvested, currency)}</strong></div>
        <div className="metric"><span>Total P&amp;L (marked)</span><strong className={markedPortfolioPnl === null ? '' : markedPortfolioPnl >= 0 ? 'tone-bullish' : 'tone-bearish'}>{formatMoney(markedPortfolioPnl, currency)}</strong></div>
        <div className="metric"><span>Open positions</span><strong>{positions.length}</strong></div>
        <div className="metric"><span>Simulated orders</span><strong>{portfolio?.orders?.length || 0}</strong></div>
      </div>

      <details className="paper-account-settings">
        <summary>Paper account settings</summary>
        <form className="paper-account-settings-form" onSubmit={resetAccount}>
          <label>Starting cash ({currency})
            <input
              type="number"
              min="0.01"
              step="any"
              value={startingCashSetting}
              onChange={(event) => setStartingCashSetting(event.target.value)}
              required
            />
          </label>
          <button type="submit" className="secondary-button" disabled={submitting || loading || !API_BASE}>
            {submitting ? 'Applying…' : 'Reset account to this amount'}
          </button>
        </form>
        <p className="subtle-note">Changing starting cash resets available cash and clears positions and simulated order history. This setting lasts until the backend restarts.</p>
      </details>

      <div className="paper-trading-grid">
        <form className="paper-order-form" onSubmit={submitOrder}>
          <h3>Place simulated order</h3>
          <div className="calculator-inputs">
            <label>Symbol
              <input value={symbol} onChange={(event) => setSymbol(event.target.value)} autoCapitalize="characters" required />
            </label>
            <label>Side
              <select value={side} onChange={(event) => setSide(event.target.value)}>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </label>
            <label>Quantity
              <input type="number" min="0.000001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
            </label>
            <label>Execution price ({currency})
              <input type="number" min="0.000001" step="any" value={price} onChange={(event) => setPrice(event.target.value)} required />
            </label>
          </div>
          <button type="submit" className="scan-button" disabled={submitting || loading || !API_BASE}>
            {submitting ? 'Submitting…' : `Place paper ${side}`}
          </button>
          <p className="subtle-note">Execution price is entered manually (prefilled from the selected chart when available). No live order routing or automatic quote fill.</p>
        </form>

        <section className="paper-table-section" aria-labelledby="paper-positions-title">
          <h3 id="paper-positions-title">Open positions</h3>
          {positions.length ? (
            <div className="paper-table-scroll">
              <table className="paper-table">
                <thead><tr><th>Symbol</th><th>Qty</th><th>Avg. cost</th><th>Market price</th><th>Unrealized P&amp;L</th><th>Stop loss</th><th>Target</th><th>Action</th></tr></thead>
                <tbody>{positions.map((position) => {
                  const positionRisk = riskLimits[position.symbol] || {};
                  const marketPrice = marketPrices[position.symbol];
                  const pnl = calculatePositionPnl(position, marketPrice);
                  return (
                    <tr key={position.symbol}>
                      <th scope="row">{position.symbol}</th>
                      <td>{position.quantity}</td>
                      <td>{formatMoney(position.averagePrice, currency)}</td>
                      <td title={marketPriceErrors[position.symbol] || ''}>
                        {Number.isFinite(marketPrice) ? formatMoney(marketPrice, currency) : 'Unavailable'}
                      </td>
                      <td className={pnl === null ? '' : pnl >= 0 ? 'tone-bullish' : 'tone-bearish'}>
                        {formatMoney(pnl, currency)}
                      </td>
                      <td>
                        <label className="paper-risk-control">
                          <span className="visually-hidden">Stop loss for {position.symbol}</span>
                          <input type="number" min="0" step="any" placeholder="Off" value={positionRisk.stopLoss || ''} onChange={(event) => updateRiskLimit(position.symbol, 'stopLoss', event.target.value)} />
                        </label>
                      </td>
                      <td>
                        <label className="paper-risk-control">
                          <span className="visually-hidden">Target for {position.symbol}</span>
                          <input type="number" min="0" step="any" placeholder="Off" value={positionRisk.target || ''} onChange={(event) => updateRiskLimit(position.symbol, 'target', event.target.value)} />
                        </label>
                      </td>
                      <td><button type="button" className="secondary-button" disabled={submitting || loading || !Number.isFinite(marketPrice)} onClick={() => sellPosition(position)}>Sell all</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ) : <p className="history-empty">{loading ? 'Loading portfolio…' : 'No open positions yet.'}</p>}
          {positions.some((position) => getPositionRiskStatus(
            marketPrices[position.symbol],
            riskLimits[position.symbol]?.stopLoss,
            riskLimits[position.symbol]?.target,
          )) && <div className="paper-risk-alerts" role="status">
            {positions.map((position) => {
              const status = getPositionRiskStatus(
                marketPrices[position.symbol],
                riskLimits[position.symbol]?.stopLoss,
                riskLimits[position.symbol]?.target,
              );
              return status ? <p key={position.symbol}>{position.symbol}: {status}</p> : null;
            })}
          </div>}
        </section>
      </div>

      <section className="paper-table-section paper-orders-section" aria-labelledby="paper-orders-title">
        <h3 id="paper-orders-title">Recent simulated orders</h3>
        {orders.length ? (
          <div className="paper-table-scroll">
            <table className="paper-table">
              <thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Price</th><th>Value</th></tr></thead>
              <tbody>{orders.slice(0, 20).map((order) => (
                <tr key={order.id}>
                  <td>{formatTime(order.executedAt)}</td>
                  <th scope="row">{order.symbol}</th>
                  <td className={order.side === 'buy' ? 'tone-bullish' : 'tone-bearish'}>{order.side.toUpperCase()}</td>
                  <td>{order.quantity}</td>
                  <td>{formatMoney(order.price, currency)}</td>
                  <td>{formatMoney(order.value, currency)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="history-empty">{loading ? 'Loading orders…' : 'Your paper order history will appear here.'}</p>}
      </section>

      <p className="subtle-note paper-disclaimer">Stop-loss and target levels are saved in this browser and only show alerts; they do not automatically place orders. Sell all submits a simulated sell at the latest fetched Yahoo price after confirmation. Market data may be delayed or unavailable. The backend paper ledger resets when its server restarts.</p>
    </section>
  );
}
