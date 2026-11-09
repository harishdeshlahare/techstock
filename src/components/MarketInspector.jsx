export default function MarketInspector({ marketOpen, stock, analysis, onOpenHistory, onOpenReport }) {
  return (
    <aside className="dashboard-inspector" aria-label="Selected stock details">
      <div className="inspector-heading">
        <span>Market status</span>
        <strong className={marketOpen ? 'market-status is-open' : 'market-status'}>
          {marketOpen ? 'Open' : 'Closed'}
        </strong>
      </div>
      <section className="inspector-card">
        <span className="inspector-label">Selected stock</span>
        <h2>{stock.symbol}</h2>
        <p>{stock.instrument_name || stock.exchange}</p>
        <strong className="inspector-price">
          {analysis ? `${analysis.currency === 'INR' ? '₹' : '$'}${analysis.price}` : '—'}
        </strong>
      </section>
      <section className="inspector-card">
        <span className="inspector-label">Technical snapshot</span>
        <div className="inspector-stat"><span>Trend</span><strong>{analysis?.trend || '—'}</strong></div>
        <div className="inspector-stat"><span>Higher timeframe</span><strong>{analysis?.higherTrend || '—'}</strong></div>
        <div className="inspector-stat"><span>Setup score</span><strong>{analysis?.setupDirection ? `${analysis.setupScore}/100` : '—'}</strong></div>
      </section>
      <div className="inspector-actions">
        <button type="button" className="secondary-button" onClick={onOpenHistory}>Stock history</button>
        <button type="button" className="secondary-button" onClick={onOpenReport}>Trade report</button>
      </div>
    </aside>
  );
}
