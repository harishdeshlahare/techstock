import { useEffect, useState } from 'react';
import { fetchYahooJson, getYahooSymbol } from '../lib/yahoo.js';
import {
  calculatePositionPnl,
  createPaperPortfolio,
  executePaperOrder,
  getPaperAccountStorageKey,
  getPositionRiskStatus,
} from '../lib/paperTrading.js';

function readLocalPortfolio(market) {
  try {
    const saved = window.localStorage.getItem(getPaperAccountStorageKey(market));
    if (!saved) return { portfolio: createPaperPortfolio(), error: '' };
    const portfolio = JSON.parse(saved);
    if (!portfolio || !Number.isFinite(Number(portfolio.startingCash)) ||
        !Number.isFinite(Number(portfolio.cash)) || !portfolio.positions || !Array.isArray(portfolio.orders)) {
      throw new Error('Saved account has an invalid format.');
    }
    return { portfolio, error: '' };
  } catch (error) {
    console.error(`Unable to load the ${market} paper-trading account:`, error);
    return {
      portfolio: createPaperPortfolio(),
      error: `Unable to load the saved ${market} paper account. Your data was not overwritten: ${error.message}`,
    };
  }
}

function saveLocalPortfolio(market, portfolio) {
  try {
    window.localStorage.setItem(getPaperAccountStorageKey(market), JSON.stringify(portfolio));
  } catch (error) {
    console.error(`Unable to save the ${market} paper-trading account:`, error);
    throw new Error(`Unable to save the ${market} paper account in this browser: ${error.message}`);
  }
}

function readRiskLimits(market) {
  try {
    const key = `techstock-paper-risk-limits-${market === 'India' ? 'india' : 'us'}`;
    const saved = window.localStorage.getItem(key);
    const parsed = saved ? JSON.parse(saved) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.error(`Unable to load ${market} paper-trading risk limits:`, error);
    return {};
  }
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
  const [initialAccount] = useState(() => readLocalPortfolio(market));
  const [portfolio, setPortfolio] = useState(initialAccount.portfolio);
  const [accountLoadError, setAccountLoadError] = useState(initialAccount.error);
  const [marketQuoteState, setMarketQuoteState] = useState({ symbolsKey: '', prices: {}, errors: {} });
  const [riskLimits, setRiskLimits] = useState(() => readRiskLimits(market));
  const [startingCashSetting, setStartingCashSetting] = useState(String(initialAccount.portfolio.startingCash));
  const [symbol, setSymbol] = useState(stock?.symbol || '');
  const [side, setSide] = useState('buy');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState(Number.isFinite(Number(currentPrice)) ? String(currentPrice) : '');
  const [loading, setLoading] = useState(false);
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

  function loadPortfolio() {
    setLoading(true);
    setError('');
    try {
      const account = readLocalPortfolio(market);
      setPortfolio(account.portfolio);
      setStartingCashSetting(String(account.portfolio.startingCash));
      setAccountLoadError(account.error);
      if (account.error) setError(account.error);
    } finally {
      setLoading(false);
    }
  }

  function executeOrder(order) {
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      if (accountLoadError) throw new Error(accountLoadError);
      const updatedPortfolio = executePaperOrder(portfolio, order);
      saveLocalPortfolio(market, updatedPortfolio);
      setPortfolio(updatedPortfolio);
      setMessage(`${order.side === 'buy' ? 'Bought' : 'Sold'} ${order.quantity} ${order.symbol.toUpperCase()} at ${formatMoney(order.price, currency)} (simulated).`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  function submitOrder(event) {
    event.preventDefault();
    executeOrder({
      symbol: symbol.trim(),
      side,
      quantity: Number(quantity),
      price: Number(price),
    });
  }

  function sellPosition(position) {
    const salePrice = marketPrices[position.symbol];
    if (!Number.isFinite(salePrice) || salePrice <= 0) {
      setError(`Cannot sell ${position.symbol}: a current market price is unavailable.`);
      return;
    }
    if (!window.confirm(`Sell all ${position.quantity} ${position.symbol} at ${formatMoney(salePrice, currency)}?`)) return;
    executeOrder({
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

  function resetAccount(event) {
    event.preventDefault();
    if (!window.confirm('Reset paper account? This clears all open positions and simulated order history.')) return;

    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      if (accountLoadError) throw new Error(accountLoadError);
      const newPortfolio = createPaperPortfolio(Number(startingCashSetting));
      saveLocalPortfolio(market, newPortfolio);
      setPortfolio(newPortfolio);
      setMessage(`Paper account reset to ${formatMoney(newPortfolio.startingCash, currency)}.`);
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
      const key = `techstock-paper-risk-limits-${market === 'India' ? 'india' : 'us'}`;
      window.localStorage.setItem(key, JSON.stringify(riskLimits));
    } catch (error) {
      console.error(`Unable to save ${market} paper-trading risk limits:`, error);
    }
  }, [riskLimits, market]);

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
        <button type="button" className="secondary-button" onClick={loadPortfolio} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh account'}
        </button>
      </div>

      {(accountLoadError || error) && <p className="scanner-error" role="alert">{error || accountLoadError}</p>}
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
          <button type="submit" className="secondary-button" disabled={submitting || loading || Boolean(accountLoadError)}>
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
          <button type="submit" className="scan-button" disabled={submitting || loading || Boolean(accountLoadError)}>
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
                      <td><button type="button" className="secondary-button" disabled={submitting || loading || Boolean(accountLoadError) || !Number.isFinite(marketPrice)} onClick={() => sellPosition(position)}>Sell all</button></td>
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

      <p className="subtle-note paper-disclaimer">{market} paper-trading account is stored separately in this browser from the other market and is not shared across browsers or devices. Stop-loss and target levels are alerts only and do not automatically place orders. Sell all submits a confirmed simulated sell at the latest fetched Yahoo price. Market data may be delayed or unavailable.</p>
    </section>
  );
}
