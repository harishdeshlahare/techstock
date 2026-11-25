export default function DashboardHome({
  market,
  stock,
  analysis,
  loading,
  tradesCount,
  watchlist,
  quotes,
  onSelectStock,
  onAddStock,
  onOpenChart,
  onOpenReport,
}) {
  return (
    <section id="panel-home" className="dashboard-home" aria-labelledby="dashboard-home-title" role="tabpanel">
      <div className="home-heading">
        <div>
          <span className="home-eyebrow">MARKET OVERVIEW</span>
          <h2 id="dashboard-home-title">Welcome to your workspace</h2>
          <p>Review your selected stock, recent market read, watchlist, and saved trade scenarios.</p>
        </div>
        <button type="button" className="primary-button" onClick={onOpenChart}>Open chart</button>
      </div>
      <div className="home-metrics metrics-grid">
        <div className="metric"><span>Selected stock</span><strong>{stock.symbol}</strong></div>
        <div className="metric"><span>Latest price</span><strong>{analysis ? `${analysis.currency === 'INR' ? '₹' : '$'}${analysis.price}` : loading ? 'Loading…' : '—'}</strong></div>
        <div className="metric"><span>Chart bias</span><strong>{analysis?.trend || '—'}</strong></div>
        <div className="metric"><span>Saved scenarios</span><strong>{tradesCount}</strong></div>
      </div>
      <div className="home-grid">
        <section className="analysis-panel home-watchlist" aria-labelledby="home-watchlist-title">
          <div className="home-section-heading">
            <h3 id="home-watchlist-title">{market} watchlist</h3>
            <button type="button" className="secondary-button" onClick={onAddStock}>Add selected</button>
          </div>
          <div className="home-watchlist-items">
            {watchlist.map((item) => {
              const quote = quotes[item.yahooSymbol];
              return (
                <button
                  type="button"
                  key={`${item.stock.symbol}-${item.stock.exchange}`}
                  className="home-watchlist-item"
                  aria-current={stock.symbol === item.stock.symbol ? 'true' : undefined}
                  onClick={() => onSelectStock(item.stock)}
                >
                  <strong>{item.stock.symbol}</strong>
                  <span>{item.stock.instrument_name || item.stock.exchange}</span>
                  <span>{quote ? `${item.stock.currency === 'INR' ? '₹' : '$'}${quote.price.toFixed(2)}` : '—'}</span>
                </button>
              );
            })}
            {watchlist.length === 0 && <p className="history-empty">Add stocks to your watchlist to see them here.</p>}
          </div>
        </section>
        <section className="analysis-panel home-summary" aria-labelledby="home-summary-title">
          <h3 id="home-summary-title">Market read</h3>
          {analysis ? (
            <>
              <p>{analysis.entryIdea}</p>
              <div className="home-summary-levels">
                <span>Setup quality <strong>{analysis.setupDirection ? `${analysis.setupScore}/100` : 'No clear setup'}</strong></span>
                <span>Higher timeframe <strong>{analysis.higherTrend}</strong></span>
                <span>RSI (14) <strong>{analysis.rsi}</strong></span>
              </div>
            </>
          ) : <p>{loading ? 'Loading selected stock data…' : 'Open the chart to load market data.'}</p>}
          <button type="button" className="secondary-button" onClick={onOpenReport}>View trade report</button>
        </section>
      </div>
    </section>
  );
}
