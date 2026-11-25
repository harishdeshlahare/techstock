function formatPrice(price, currency) {
  if (!Number.isFinite(price)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: price >= 100 ? 2 : 6,
    }).format(price);
  } catch {
    return `${currency || ''} ${price.toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
  }
}

export default function ForexCryptoPanel({ instruments, quotes, refreshStatus, onOpenChart, onRefresh }) {
  const groups = [
    ['Cryptocurrency', instruments.filter((item) => item.assetClass === 'Crypto')],
    ['Forex pairs', instruments.filter((item) => item.assetClass === 'Forex')],
  ];

  return (
    <section id="panel-forex-crypto" className="scanner-panel forex-crypto-panel" aria-labelledby="tab-forex-crypto" role="tabpanel">
      <div className="scanner-heading">
        <div>
          <h2>Forex &amp; Crypto markets</h2>
          <p>Track selected currency pairs and cryptocurrencies using Yahoo Finance market data.</p>
        </div>
        <div className="forex-crypto-panel-actions">
          <span className="market-status is-open">Forex · 24/5 &nbsp; Crypto · 24/7</span>
          <button type="button" className="secondary-button" onClick={onRefresh} disabled={refreshStatus.loading}>
            {refreshStatus.loading ? 'Refreshing…' : 'Refresh prices'}
          </button>
        </div>
      </div>
      <p className="subtle-note">
        Prices refresh automatically every 60 seconds while this tab is open. Yahoo Finance quotes may be delayed; this is not a continuous live-price feed.
      </p>
      {refreshStatus.error && <p className="search-error" role="status">{refreshStatus.error}</p>}
      {refreshStatus.updatedAt && (
        <p className="subtle-note" role="status">
          {refreshStatus.error ? 'Last attempted update' : 'Prices updated'} {new Date(refreshStatus.updatedAt).toLocaleTimeString()}.
        </p>
      )}
      {groups.map(([group, items]) => (
        <section className="forex-crypto-group" key={group} aria-label={group}>
          <h3>{group}</h3>
          <div className="forex-crypto-list">
            {items.map((instrument) => {
              const quote = quotes[instrument.yahooSymbol];
              return (
                <button
                  type="button"
                  className="forex-crypto-item"
                  key={instrument.yahooSymbol}
                  onClick={() => onOpenChart(instrument)}
                >
                  <span className="forex-crypto-name">
                    <strong>{instrument.symbol}</strong>
                    <small>{instrument.instrument_name}</small>
                  </span>
                  <span className="forex-crypto-quote">
                    <strong>{quote ? formatPrice(quote.price, instrument.currency) : refreshStatus.loading ? 'Loading…' : 'Price unavailable'}</strong>
                    {quote?.changePercent !== null && quote?.changePercent !== undefined && (
                      <small className={quote.changePercent >= 0 ? 'tone-bullish' : 'tone-bearish'}>
                        {quote.changePercent >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%
                      </small>
                    )}
                  </span>
                  <span className="forex-crypto-action">Open chart</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}
