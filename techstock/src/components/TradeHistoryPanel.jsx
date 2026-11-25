import { buildTradeReport, tradeReportToCsv } from '../lib/tradeReport.js';

function formatPrice(value, currencyMark) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
    ? `${currencyMark}${Number(value).toFixed(2)}`
    : '—';
}

function getOutcomeLabel(trade) {
  switch (trade.outcome || 'open') {
    case 'pending':
      return 'Pending entry';
    case 'open':
      return 'Open · no hit observed';
    case 'expired':
      return 'Unchecked: older than available data';
    case 'stop':
      return 'Stop hit';
    case 'breakeven':
      return 'Breakeven stop hit';
    case 'target':
    case 'target1':
      return 'Target 1 reached · tracking';
    case 'target2':
      return 'Target 2 reached';
    case 'ambiguous':
      return 'Stop and target touched — order unknown';
    default:
      return trade.outcome;
  }
}

export default function TradeHistoryPanel({
  trades,
  ticker,
  instrumentName,
  currency,
  message,
  onOpenChart,
  onDelete,
}) {
  const report = buildTradeReport(trades);
  const currencyMark = currency === 'INR' ? '₹' : '$';

  function downloadCsv() {
    const blob = new Blob([tradeReportToCsv(report)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${ticker}-trade-history.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <section id="panel-history" aria-labelledby="tab-history" className="scanner-panel trade-history-panel" role="tabpanel">
      <div className="scanner-heading">
        <div>
          <h2>{ticker} trade history</h2>
          <p>Saved entry, stop, and target scenarios for {instrumentName || ticker}.</p>
        </div>
        <div className="history-actions">
          <button type="button" className="secondary-button" onClick={downloadCsv} disabled={!trades.length}>Download CSV</button>
          <button type="button" className="scan-button" onClick={onOpenChart}>Check latest chart</button>
        </div>
      </div>
      <div className="history-summary metrics-grid">
        <div className="metric"><span>Total trades</span><strong>{trades.length}</strong></div>
        <div className="metric"><span>Win rate</span><strong>{report.winRate === null ? '—' : `${report.winRate.toFixed(1)}%`}</strong></div>
        <div className="metric"><span>Average R</span><strong>{report.averageR === null ? '—' : `${report.averageR.toFixed(2)}R`}</strong></div>
        <div className="metric"><span>Total P&amp;L</span><strong>{currencyMark}{report.totalPnl.toFixed(2)}</strong></div>
      </div>
      <p className="subtle-note">
        Trades start pending until a later candle touches the entry zone. T1 remains active while T2/stop are tracked. Same-candle stop/target touches are marked ambiguous.
      </p>
      {message && <p className="history-message" role="status">{message}</p>}
      {trades.length > 0 ? (
        <div className="trade-history-list">
          {trades.map((trade) => (
            <article className="trade-history-card" key={trade.id}>
              <div className="trade-history-header">
                <div>
                  <strong>{trade.ticker || trade.symbol} · {trade.direction || 'Long'}</strong>
                  <span>{trade.createdAt ? new Date(trade.createdAt).toLocaleString() : 'Saved trade'} · {trade.interval || '1day'}</span>
                </div>
                <span className={`trade-outcome ${trade.outcome || 'open'}`}>{getOutcomeLabel(trade)}</span>
              </div>
              <div className="trade-history-levels">
                <span>
                  Entry <strong>{formatPrice(trade.entryPrice, currencyMark)}</strong>
                  {Number.isFinite(trade.entryZoneLow) && Number.isFinite(trade.entryZoneHigh) && (
                    <small>Zone: {formatPrice(trade.entryZoneLow, currencyMark)}–{formatPrice(trade.entryZoneHigh, currencyMark)}</small>
                  )}
                </span>
                <span>Stop loss <strong>{formatPrice(trade.stopPrice, currencyMark)}</strong></span>
                <span>Target 1 <strong>{formatPrice(trade.target1Price ?? trade.targetPrice, currencyMark)}</strong></span>
                <span>Target 2 <strong>{formatPrice(trade.target2Price ?? trade.targetPrice, currencyMark)}</strong></span>
                <span>Shares <strong>{Number(trade.shares || 0)}</strong></span>
              </div>
              <div className="trade-history-footer">
                <span>
                  {trade.statusLabel || (trade.hitAt
                    ? `Hit candle: ${new Date(trade.hitAt * 1000).toLocaleString()}`
                    : 'No outcome in available candles')}
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(trade.id)}
                  aria-label={`Delete ${trade.ticker || trade.symbol} trade from history`}
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="history-empty">No saved scenarios for {ticker} yet. Save one from the trade scenario calculator.</p>
      )}
    </section>
  );
}
