import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateATR, calculateEMA, calculateRSI } from './indicators.js';
import { getMarketStatus } from './marketStatus.js';
import { fetchYahooJson, getClosedCandles, getYahooSymbol, normalizeYahooProxyUrl, parseYahooCandles } from './yahoo.js';
import { buildTradeReport } from './tradeReport.js';
import { updateTradeHistory } from './tradeHistory.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('market-data utilities', () => {
  it('calculates moving averages and RSI with timestamped output', () => {
    const candles = [
      { time: 1, high: 2, low: 0, close: 1 },
      { time: 2, high: 3, low: 1, close: 2 },
      { time: 3, high: 5, low: 2, close: 4 },
    ];

    expect(calculateEMA(candles, 2)).toEqual([
      { time: 2, value: 1.5 },
      { time: 3, value: 3.1666666666666665 },
    ]);
    expect(calculateRSI(candles, 2).at(-1)).toEqual({ time: 3, value: 100 });
    expect(calculateATR(candles, 1).at(-1)).toEqual({ time: 3, value: 3 });
  });

  it('parses Yahoo candles and excludes the unfinished daily candle', () => {
    const today = Date.UTC(2026, 10, 9) / 1000;
    const result = {
      meta: {
        exchangeTimezoneName: 'UTC',
        currentTradingPeriod: { regular: { open: today + 9 * 3600, close: today + 16 * 3600 } },
      },
      timestamp: [today - 86_400, today],
      indicators: {
        quote: [{ open: [10, 11], high: [12, 13], low: [9, 10], close: [11, 12], volume: [100, 200] }],
      },
    };
    const candles = parseYahooCandles(result);

    expect(candles).toHaveLength(2);
    expect(candles[0].volume).toBe(100);
    expect(getClosedCandles(candles, result, '1day', (today + 12 * 3600) * 1000)).toEqual([candles[0]]);
  });

  it('maps Indian equities to Yahoo suffixes and respects exchange sessions', () => {
    expect(getYahooSymbol({ symbol: 'TCS', exchange: 'NSE' }, 'India')).toBe('TCS.NS');
    expect(getYahooSymbol({ symbol: '500325', exchange: 'BSE' }, 'India')).toBe('500325.BO');
    expect(getMarketStatus('India', { open: 100, close: 200 }, 150_000)).toBe(true);
    expect(getMarketStatus('India', { open: 100, close: 200 }, 200_000)).toBe(false);
  });

  it('normalizes a proxy base URL and rejects Yahoo as the proxy host', () => {
    expect(normalizeYahooProxyUrl('https://proxy.example.com/api/yahoo/')).toBe('https://proxy.example.com');
    expect(normalizeYahooProxyUrl('https://proxy.example.com')).toBe('https://proxy.example.com');
    expect(() => normalizeYahooProxyUrl('https://query1.finance.yahoo.com')).toThrow(/own HTTPS proxy server/);
  });

  it('sends proxy requests through the /api/yahoo route exactly once', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ finance: { result: [] } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchYahooJson('/api/yahoo/v1/finance/search?q=AAPL', 'https://proxy.example.com');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://proxy.example.com/api/yahoo/v1/finance/search?q=AAPL',
      { signal: undefined, cache: 'no-store' },
    );
    fetchMock.mockClear();
    await fetchYahooJson('/api/yahoo/v1/finance/search?q=MSFT', 'https://proxy.example.com/api/yahoo');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://proxy.example.com/api/yahoo/v1/finance/search?q=MSFT',
      { signal: undefined, cache: 'no-store' },
    );
  });
});

describe('trade history', () => {
  it('tracks entry, target progression, and reports a closed trade', () => {
    const trade = {
      id: 'trade-1',
      symbol: 'TCS.NS',
      interval: '1day',
      ticker: 'TCS',
      direction: 'Long',
      entryPrice: 100,
      entryZoneLow: 99,
      entryZoneHigh: 101,
      stopPrice: 95,
      target1Price: 105,
      target2Price: 110,
      shares: 10,
      estimatedCosts: 0,
      createdAt: new Date(1_000_000).toISOString(),
      outcome: 'pending',
    };
    const candles = [
      { time: 1_100, low: 99, high: 102 },
      { time: 1_200, low: 100, high: 106 },
      { time: 1_300, low: 106, high: 111 },
    ];
    const updated = updateTradeHistory([trade], candles, 'TCS.NS', '1day');
    const report = buildTradeReport(updated);

    expect(updated[0].outcome).toBe('target2');
    expect(updated[0].pnl).toBe(75);
    expect(report.closedCount).toBe(1);
    expect(report.winRate).toBe(100);
    expect(report.averageR).toBe(1.5);
  });

  it('marks same-candle stop and target touches as ambiguous', () => {
    const trade = {
      symbol: 'AAPL',
      interval: '1day',
      direction: 'Long',
      entryPrice: 100,
      entryZoneLow: 99,
      entryZoneHigh: 101,
      stopPrice: 95,
      target1Price: 105,
      target2Price: 110,
      shares: 1,
      createdAt: new Date(1_000_000).toISOString(),
      outcome: 'pending',
    };
    const candles = [
      { time: 1_100, low: 99, high: 101 },
      { time: 1_200, low: 94, high: 106 },
    ];

    expect(updateTradeHistory([trade], candles, 'AAPL', '1day')[0].outcome).toBe('ambiguous');
  });
});
