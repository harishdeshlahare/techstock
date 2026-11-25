const CLOSED_OUTCOMES = new Set(['stop', 'breakeven', 'target2']);

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function buildTradeReport(trades = []) {
  const list = Array.isArray(trades) ? trades : [];
  const closed = list.filter((trade) => CLOSED_OUTCOMES.has(trade.outcome));
  const pnlValues = closed.map((trade) => Number(trade.pnl) || 0);
  const totalPnl = pnlValues.reduce((sum, pnl) => sum + pnl, 0);
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  pnlValues.forEach((pnl) => {
    equity += pnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  });

  const rValues = closed.map((trade) => finite(trade.rMultiple)).filter((value) => value !== null);
  const durations = closed.map((trade) => finite(trade.durationMinutes)).filter((value) => value !== null);
  const wins = closed.filter((trade) => Number(trade.pnl) > 0).length;
  const rows = [...closed].sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0));

  return {
    rows,
    closedCount: closed.length,
    openCount: list.filter((trade) => ['pending', 'open', 'target1'].includes(trade.outcome || 'open')).length,
    ambiguousCount: list.filter((trade) => trade.outcome === 'ambiguous').length,
    expiredCount: list.filter((trade) => trade.outcome === 'expired').length,
    winRate: closed.length ? wins / closed.length * 100 : null,
    totalPnl,
    averageR: rValues.length ? rValues.reduce((sum, value) => sum + value, 0) / rValues.length : null,
    maxDrawdown,
    averageDurationMinutes: durations.length
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : null,
  };
}

function escapeCsv(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function tradeReportToCsv(report) {
  const header = ['Created', 'Ticker', 'Direction', 'Timeframe', 'Outcome', 'Entry', 'Exit', 'P&L', 'R multiple', 'Duration (minutes)'];
  const rows = (report?.rows || []).map((trade) => [
    trade.createdAt,
    trade.ticker || trade.symbol,
    trade.direction,
    trade.interval,
    trade.outcome,
    trade.entryFillPrice ?? trade.entryPrice,
    trade.exitPrice,
    trade.pnl,
    trade.rMultiple,
    trade.durationMinutes,
  ]);
  return [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
}
