import { useEffect, useState } from 'react';

const API_BASE = (import.meta.env.VITE_BACKEND_API_BASE_URL || '/api/backend').replace(/\/+$/, '');

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

export default function PaperTradingPanel({ stock, currency = 'USD', currentPrice }) {
  const [portfolio, setPortfolio] = useState(null);
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
    try {
      const data = await requestJson('/api/paper-trading/summary');
      setPortfolio(data.portfolio);
      setStartingCashSetting(String(data.portfolio.startingCash));
    } catch (requestError) {
      setError(`${requestError.message} Confirm the Techstock backend is running on port 4000.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPortfolio();
  }, []);

  async function submitOrder(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const data = await requestJson('/api/paper-trading/orders', {
        method: 'POST',
        body: JSON.stringify({
          symbol: symbol.trim(),
          side,
          quantity: Number(quantity),
          price: Number(price),
        }),
      });
      setPortfolio(data.portfolio);
      setMessage(`${side === 'buy' ? 'Bought' : 'Sold'} ${quantity} ${symbol.trim().toUpperCase()} at ${formatMoney(price, currency)} (simulated).`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
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

      {error && <p className="scanner-error" role="alert">{error}</p>}
      {message && <p className="history-message" role="status">{message}</p>}

      <div className="metrics-grid paper-summary-grid">
        <div className="metric"><span>Starting cash</span><strong>{formatMoney(portfolio?.startingCash, currency)}</strong></div>
        <div className="metric"><span>Available cash</span><strong>{formatMoney(portfolio?.cash, currency)}</strong></div>
        <div className="metric"><span>Invested at average cost</span><strong>{formatMoney(portfolio?.totalInvested, currency)}</strong></div>
        <div className="metric"><span>Open positions · orders</span><strong>{positions.length} · {portfolio?.orders?.length || 0}</strong></div>
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
          <button type="submit" className="secondary-button" disabled={submitting || loading}>
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
          <button type="submit" className="scan-button" disabled={submitting || loading}>
            {submitting ? 'Submitting…' : `Place paper ${side}`}
          </button>
          <p className="subtle-note">Execution price is entered manually (prefilled from the selected chart when available). No live order routing or automatic quote fill.</p>
        </form>

        <section className="paper-table-section" aria-labelledby="paper-positions-title">
          <h3 id="paper-positions-title">Open positions</h3>
          {positions.length ? (
            <div className="paper-table-scroll">
              <table className="paper-table">
                <thead><tr><th>Symbol</th><th>Qty</th><th>Avg. cost</th><th>Last execution</th></tr></thead>
                <tbody>{positions.map((position) => (
                  <tr key={position.symbol}>
                    <th scope="row">{position.symbol}</th>
                    <td>{position.quantity}</td>
                    <td>{formatMoney(position.averagePrice, currency)}</td>
                    <td>{formatMoney(position.lastPrice, currency)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="history-empty">{loading ? 'Loading portfolio…' : 'No open positions yet.'}</p>}
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

      <p className="subtle-note paper-disclaimer">This is a local practice ledger. The backend currently keeps paper-trading data in memory, so it resets when the server restarts.</p>
    </section>
  );
}
