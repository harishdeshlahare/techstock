import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateATR, calculateEMA, calculateRSI } from './indicators.js';
import { getMarketStatus } from './marketStatus.js';
import { fetchYahooJson, getClosedCandles, getYahooSymbol, normalizeYahooProxyUrl, parseYahooCandles } from './yahoo.js';
import { buildTradeReport } from './tradeReport.js';
import { updateTradeHistory } from './tradeHistory.js';
import { searchIndianIndices } from './indices.js';
import { getPriceActionContext } from './priceAction.js';
import { evaluateEntrySignals, getSignalLevelLookback } from './signalRules.js';
import { backtestSignals, backtestSymbols } from './backtest.js';
import viteConfig from '../../vite.config.js';
import {
  calculatePositionPnl,
  createPaperPortfolio,
  executePaperOrder,
  getPaperAccountStorageKey,
  getPositionRiskStatus,
} from './paperTrading.js';
import vercelConfig from '../../vercel.json';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('market-data utilities', () => {
  it('uses the same required entry checks for both strategy modes', () => {
    const candles = [{ time: 1, open: 100, high: 101, low: 99.7, close: 100.5, volume: 100 }];
    const levels = {
      supports: [{ price: 100.1 }],
      resistances: [{ price: 102 }],
    };
    const base = {
      candles,
      ema9: 100.4,
      ema21: 100.2,
      atr: 1,
      supports: levels.supports,
      resistances: levels.resistances,
    };

    expect(evaluateEntrySignals(base).longSignal).toBe(true);
    expect(evaluateEntrySignals({
      ...base,
      strategy: 'price-action',
      priceAction: { longRetest: false, shortRetest: false },
    }).longSignal).toBe(false);
    expect(evaluateEntrySignals({
      ...base,
      strategy: 'price-action',
      priceAction: { longRetest: true, shortRetest: false },
    }).longSignal).toBe(true);
  });

  it('shares each chart timeframe lookback with signal calculations', () => {
    expect(getSignalLevelLookback('1min')).toBe(120);
    expect(getSignalLevelLookback('15min')).toBe(100);
    expect(getSignalLevelLookback('1h')).toBe(80);
    expect(getSignalLevelLookback('unknown')).toBe(120);
  });

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

  it('detects an unmitigated bullish FVG retest without using future candles', () => {
    const candles = [
      { time: 1, open: 9.5, high: 10, low: 9, close: 9.8, volume: 1 },
      { time: 2, open: 10, high: 11, low: 9.8, close: 10.7, volume: 1 },
      { time: 3, open: 11.5, high: 13, low: 12, close: 12.5, volume: 1 },
      { time: 4, open: 12.2, high: 13, low: 11, close: 12.6, volume: 1 },
    ];

    expect(getPriceActionContext(candles, 2).bullishFvg).toBeNull();
    const context = getPriceActionContext(candles);
    expect(context.bullishFvg).toMatchObject({ lower: 10, upper: 12, formedAt: 2 });
    expect(context.longFvgRetest).toBe(true);
    expect(context.longRetest).toBe(true);
  });

  it('invalidates an FVG after price trades through the full gap', () => {
    const candles = [
      { time: 1, open: 9.5, high: 10, low: 9, close: 9.8, volume: 1 },
      { time: 2, open: 10, high: 11, low: 9.8, close: 10.7, volume: 1 },
      { time: 3, open: 11.5, high: 13, low: 12, close: 12.5, volume: 1 },
      { time: 4, open: 12.2, high: 13, low: 11, close: 12.6, volume: 1 },
      { time: 5, open: 10, high: 10.5, low: 9.5, close: 10.2, volume: 1 },
      { time: 6, open: 10.2, high: 10.8, low: 10, close: 10.5, volume: 1 },
    ];

    expect(getPriceActionContext(candles).bullishFvg).toBeNull();
    expect(getPriceActionContext(candles).longFvgRetest).toBe(false);
  });

  it('requires a structure-breaking displacement and confirmed order-block retest', () => {
    const candles = [
      { time: 1, open: 10, high: 11, low: 9, close: 10, volume: 1 },
      { time: 2, open: 10.1, high: 11.5, low: 9.8, close: 11, volume: 1 },
      { time: 3, open: 11, high: 12, low: 10.5, close: 11.6, volume: 1 },
      { time: 4, open: 11.5, high: 12, low: 10.8, close: 11, volume: 1 },
      { time: 5, open: 11, high: 12.5, low: 10.7, close: 12, volume: 1 },
      { time: 6, open: 12, high: 12.8, low: 11.5, close: 11.8, volume: 1 },
      { time: 7, open: 12.1, high: 14.4, low: 12, close: 14, volume: 1 },
      { time: 8, open: 12.2, high: 13.3, low: 12, close: 13.1, volume: 1 },
    ];
    const context = getPriceActionContext(candles);

    expect(context.bullishOrderBlock).toMatchObject({ lower: 11.5, upper: 12.8, formedAt: 6 });
    expect(context.longOrderBlockRetest).toBe(true);
  });

  it('keeps the original support/resistance backtest available alongside price-action mode', () => {
    let seed = 1;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const candles = [];
    let previousClose = 100;
    for (let index = 0; index < 80; index += 1) {
      const drift = (random() - 0.49) * 1.8;
      const open = previousClose + (random() - 0.5) * 0.8;
      const close = Math.max(2, open + drift);
      candles.push({
        time: index + 1,
        open,
        high: Math.max(open, close) + random() * 0.5,
        low: Math.min(open, close) - random() * 0.5,
        close,
        volume: 1000,
      });
      previousClose = close;
    }

    const originalStrategy = backtestSignals(candles);
    const priceActionStrategy = backtestSignals(candles, { strategy: 'price-action' });
    const brokerageBacktest = backtestSignals(candles, { brokeragePerOrder: 3 });
    const slippageBacktest = backtestSignals(candles, { slippagePercent: 0.5 });
    const multiSymbolBacktest = backtestSymbols([
      { symbol: 'AAA', candles },
      { symbol: 'BBB', candles },
      null,
    ], { brokeragePerOrder: 3 });
    expect(originalStrategy.numberOfTrades).toBeGreaterThan(priceActionStrategy.numberOfTrades);
    expect(originalStrategy.numberOfTrades).toBeGreaterThan(0);
    expect(originalStrategy.trades.every((trade) => trade.tradingCosts === 0 && trade.pnl === trade.grossPnl)).toBe(true);
    expect(brokerageBacktest.trades.every((trade) => (
      trade.tradingCosts === (trade.partialTargetReached ? 9 : 6)
    ))).toBe(true);
    expect(slippageBacktest.totalCosts).toBeGreaterThan(0);
    expect(brokerageBacktest.net.totalPnl).toBeCloseTo(
      brokerageBacktest.gross.totalPnl - brokerageBacktest.totalCosts,
    );
    expect(brokerageBacktest.inSample.net.totalPnl).toBeCloseTo(
      brokerageBacktest.inSample.gross.totalPnl - brokerageBacktest.inSample.totalCosts,
    );
    expect(brokerageBacktest.outOfSample.net.totalPnl).toBeCloseTo(
      brokerageBacktest.outOfSample.gross.totalPnl - brokerageBacktest.outOfSample.totalCosts,
    );
    expect(multiSymbolBacktest.symbolsTested).toBe(2);
    expect(multiSymbolBacktest.numberOfTrades).toBe(brokerageBacktest.numberOfTrades * 2);
    expect(multiSymbolBacktest.outOfSample.numberOfTrades).toBe(brokerageBacktest.outOfSample.numberOfTrades * 2);
    expect(multiSymbolBacktest.net.totalPnl).toBeCloseTo(brokerageBacktest.net.totalPnl * 2);
    expect(multiSymbolBacktest.trades.every((trade) => ['AAA', 'BBB'].includes(trade.symbol))).toBe(true);
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
    expect(getYahooSymbol({ symbol: 'NIFTY', exchange: 'NSE', yahooSymbol: '^NSEI' }, 'India')).toBe('^NSEI');
    expect(getYahooSymbol({ symbol: 'BANKNIFTY', exchange: 'NSE', yahooSymbol: '^NSEBANK' }, 'India')).toBe('^NSEBANK');
    expect(getYahooSymbol({ symbol: 'SENSEX', exchange: 'BSE', yahooSymbol: '^BSESN' }, 'India')).toBe('^BSESN');
    expect(getMarketStatus('India', { open: 100, close: 200 }, 150_000)).toBe(true);
    expect(getMarketStatus('India', { open: 100, close: 200 }, 200_000)).toBe(false);
  });

  it('finds Indian indices by common names and ticker aliases', () => {
    expect(searchIndianIndices('NIFTY').map((index) => index.id)).toEqual(['nifty', 'banknifty']);
    expect(searchIndianIndices('bank nifty').map((index) => index.id)).toEqual(['banknifty']);
    expect(searchIndianIndices('SENSEX').map((index) => index.yahooSymbol)).toEqual(['^BSESN']);
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

  it('routes Vercel Yahoo API requests through a same-origin rewrite', () => {
    expect(vercelConfig.rewrites).toContainEqual({
      source: '/api/yahoo/:path*',
      destination: 'https://query1.finance.yahoo.com/:path*',
    });
  });

  it('routes Vite dev and preview Yahoo API requests to Yahoo Finance', () => {
    for (const proxy of [viteConfig.server.proxy, viteConfig.preview.proxy]) {
      expect(proxy['/api/yahoo'].target).toBe('https://query1.finance.yahoo.com');
      expect(proxy['/api/yahoo'].rewrite('/api/yahoo/v8/finance/chart/AAPL')).toBe('/v8/finance/chart/AAPL');
    }
  });

  it('explains when a Yahoo proxy returns HTML instead of JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token '<'");
      },
    }));

    await expect(fetchYahooJson('/api/yahoo/v1/finance/search?q=AAPL'))
      .rejects.toThrow(/non-JSON response.*Verify that \/api\/yahoo is routed to Yahoo Finance/);
  });
});

describe('paper-trading calculations', () => {
  it('uses separate storage keys and ledgers for US and India', () => {
    expect(getPaperAccountStorageKey('India')).not.toBe(getPaperAccountStorageKey('United States'));
    const us = createPaperPortfolio();
    const india = createPaperPortfolio();
    const boughtIndia = executePaperOrder(india, { symbol: 'TCS', side: 'buy', quantity: 2, price: 100 });

    expect(us.cash).toBe(100_000);
    expect(us.positions).toEqual({});
    expect(boughtIndia.cash).toBe(99_800);
    expect(boughtIndia.positions.TCS.quantity).toBe(2);
  });

  it('validates funds and quantity when buying and selling', () => {
    const account = createPaperPortfolio(1_000);
    const bought = executePaperOrder(account, { symbol: 'AAPL', side: 'buy', quantity: 2, price: 100 });
    const sold = executePaperOrder(bought, { symbol: 'AAPL', side: 'sell', quantity: 1, price: 120 });

    expect(sold.cash).toBe(920);
    expect(sold.positions.AAPL.quantity).toBe(1);
    expect(() => executePaperOrder(account, { symbol: 'AAPL', side: 'buy', quantity: 11, price: 100 }))
      .toThrow(/Insufficient/);
    expect(() => executePaperOrder(sold, { symbol: 'AAPL', side: 'sell', quantity: 2, price: 100 }))
      .toThrow(/Not enough/);
  });

  it('calculates unrealized P&L only with a valid market price', () => {
    expect(calculatePositionPnl({ quantity: 3, averagePrice: 100 }, 112)).toBe(36);
    expect(calculatePositionPnl({ quantity: 3, averagePrice: 100 }, null)).toBeNull();
  });

  it('alerts on stop loss or target without implying an automatic exit', () => {
    expect(getPositionRiskStatus(94, 95, 110)).toMatch(/Stop loss reached/);
    expect(getPositionRiskStatus(111, 95, 110)).toMatch(/Target reached/);
    expect(getPositionRiskStatus(100, 110, 105)).toMatch(/must be below target/);
    expect(getPositionRiskStatus(100, 95, 110)).toBe('');
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
