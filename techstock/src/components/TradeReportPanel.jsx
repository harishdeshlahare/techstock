import { buildTradeReport, tradeReportToCsv } from '../lib/tradeReport.js';

function formatValue(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1_440) return `${(minutes / 60).toFixed(1)}h`;
  return `${(minutes / 1_440).toFixed(1)}d`;
}

export default function TradeReportPanel({ trades, ticker, currency }) {
  const report = buildTradeReport(trades);
  const currencyMark = currency === 'INR' ? '₹' : '$';

  function downloadCsv() {
    const blob = new Blob([tradeReportToCsv(report)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${ticker || 'stock'}-trade-report.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="scanner-panel trade-report-panel" aria-labelledby="trade-report-title">
      <header className="report-heading">
        <div>
          <h2 id="trade-report-title">{ticker} trade report</h2>
          <p>Closed outcomes from saved scenarios for this stock. Open, pending, expired, and ambiguous trades are excluded from performance totals.</p>
        </div>
        <div className="report-actions">
          <button type="button" className="secondary-button" onClick={downloadCsv} disabled={!trades.length}>Export CSV</button>
          <button type="button" className="secondary-button" onClick={() => window.print()} disabled={!trades.length}>Print</button>
        </div>
      </header>
      <div className="metrics-grid report-metrics">
        <div className="metric"><span>Closed trades</span><strong>{report.closedCount}</strong></div>
        <div className="metric"><span>Open / pending</span><strong>{report.openCount}</strong></div>
        <div className="metric"><span>Ambiguous</span><strong>{report.ambiguousCount}</strong></div>
        <div className="metric"><span>Expired</span><strong>{report.expiredCount}</strong></div>
        <div className="metric"><span>Win rate</span><strong>{report.winRate === null ? '—' : `${report.winRate.toFixed(1)}%`}</strong></div>
        <div className="metric"><span>Net P&amp;L</span><strong>{currencyMark}{report.totalPnl.toFixed(2)}</strong></div>
        <div className="metric"><span>Average R</span><strong>{report.averageR === null ? '—' : `${report.averageR.toFixed(2)}R`}</strong></div>
        <div className="metric"><span>Max drawdown</span><strong>{currencyMark}{report.maxDrawdown.toFixed(2)}</strong></div>
        <div className="metric"><span>Avg. hold</span><strong>{formatDuration(report.averageDurationMinutes)}</strong></div>
      </div>
      {report.rows.length ? (
        <div className="report-table-wrap">
          <table className="trade-report-table">
            <thead>
              <tr>
                <th scope="col">Created</th>
                <th scope="col">Direction</th>
                <th scope="col">Timeframe</th>
                <th scope="col">Outcome</th>
                <th scope="col">Entry / exit</th>
                <th scope="col">P&amp;L</th>
                <th scope="col">R</th>
                <th scope="col">Hold</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((trade) => (
                <tr key={trade.id}>
                  <td>{trade.createdAt ? new Date(trade.createdAt).toLocaleString() : '—'}</td>
                  <td>{trade.direction || 'Long'}</td>
                  <td>{trade.interval || '1day'}</td>
                  <td>{trade.outcome || 'open'}</td>
                  <td>
                    {formatValue(Number(trade.entryFillPrice ?? trade.entryPrice))}
                    {' / '}
                    {formatValue(trade.exitPrice)}
                  </td>
                  <td>{Number.isFinite(trade.pnl) ? `${currencyMark}${trade.pnl.toFixed(2)}` : '—'}</td>
                  <td>{Number.isFinite(trade.rMultiple) ? `${trade.rMultiple.toFixed(2)}R` : '—'}</td>
                  <td>{formatDuration(trade.durationMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="history-empty">No saved scenarios for {ticker} yet. Save a scenario from the chart to start its report.</p>
      )}
      <p className="subtle-note report-disclaimer">Historical bookkeeping only; the reported statistics do not indicate or predict future performance. Ambiguous same-candle outcomes are not assumed as wins or losses.</p>
    </section>
  );
}
