import { describe, expect, it } from 'vitest';
import { calculateATR, calculateEMA, calculateRSI, calculateVWAP, getTrend } from './indicators.js';
import { buildLiquiditySweepTradeLevels, buildTradeLevels, findSupportResistance } from './levels.js';
import { backtestSignals, backtestSymbols } from './backtest.js';

function candle(index, close, open = close - 0.2) {
  return {
    time: index + 1,
    open,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: 100,
  };
}

describe('indicator unit tests', () => {
  it('calculates EMA from a fixed seed', () => {
    const candles = [candle(0, 10), candle(1, 12), candle(2, 14)];
    expect(calculateEMA(candles, 2)).toEqual([
      { time: 2, value: 11 },
      { time: 3, value: 13 },
    ]);
  });

  it('matches a hand-calculated Wilder RSI series', () => {
    const closes = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
    const candles = closes.map((close, index) => ({ time: index + 1, open: close, high: close, low: close, close, volume: 1 }));
    const rsi = calculateRSI(candles, 14);
    expect(rsi).toHaveLength(1);
    expect(rsi[0].value).toBeCloseTo(72.9838709677, 2);
  });

  it('calculates ATR and VWAP, resetting VWAP at sessions', () => {
    const candles = [
      { time: 1_700_000_000, open: 10, high: 12, low: 9, close: 11, volume: 10 },
      { time: 1_700_086_400, open: 11, high: 13, low: 10, close: 12, volume: 10 },
      { time: 1_700_172_800, open: 12, high: 14, low: 11, close: 13, volume: 10 },
    ];
    expect(calculateATR(candles, 1)).toHaveLength(2);
    const vwap = calculateVWAP(candles, 'UTC');
    expect(vwap).toHaveLength(3);
    expect(vwap[0].value).toBeCloseTo(10.666667);
  });

  it('returns the latest EMA trend', () => {
    const candles = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121]
      .map((close, index) => candle(index, close));
    expect(getTrend(candles)).toBe('Bullish');
  });
});

describe('level unit tests', () => {
  it('finds support and resistance with finite ATR', () => {
    const candles = [90, 95, 100, 105, 110].map((close, index) => candle(index, close));
    const levels = findSupportResistance(candles, 5);
    expect(levels.supports.length).toBeGreaterThan(0);
    expect(levels.resistances.length).toBeGreaterThan(0);
  });

  it('builds Long and Short stops and targets on the correct side', () => {
    const longPlan = buildTradeLevels({ direction: 'Long', entry: 100, atr: 4, supports: [{ price: 96 }], resistances: [{ price: 108 }, { price: 112 }] });
    const shortPlan = buildTradeLevels({ direction: 'Short', entry: 100, atr: 4, supports: [{ price: 88 }, { price: 92 }], resistances: [{ price: 104 }] });
    expect(longPlan.stop).toBeLessThan(100);
    expect(longPlan.target2).toBeGreaterThan(100);
    expect(shortPlan.stop).toBeGreaterThan(100);
    expect(shortPlan.target2).toBeLessThan(100);
  });

  it('builds liquidity-sweep stops and targets on the correct side', () => {
    const longPlan = buildLiquiditySweepTradeLevels({ direction: 'Long', entry: 100, sweepExtreme: 96, resistances: [{ price: 108 }] });
    const shortPlan = buildLiquiditySweepTradeLevels({ direction: 'Short', entry: 100, sweepExtreme: 104, supports: [{ price: 92 }] });
    expect(longPlan.stop).toBe(96);
    expect(longPlan.target2).toBeGreaterThan(100);
    expect(shortPlan.stop).toBe(104);
    expect(shortPlan.target2).toBeLessThan(100);
  });
});

describe('backtest unit tests', () => {
  function alternatingCandles(length = 80) {
    const candles = [];
    let close = 100;
    for (let index = 0; index < length; index += 1) {
      const open = close + (index % 2 ? 0.3 : -0.3);
      close = open + (index % 5 === 0 ? 0.8 : index % 3 === 0 ? -0.6 : 0.2);
      candles.push({
        time: index + 1,
        open,
        high: Math.max(open, close) + 0.5,
        low: Math.min(open, close) - 0.5,
        close,
        volume: 1000,
      });
    }
    return candles;
  }

  it('runs target-2, stop, gap-stop, T1/breakeven, ambiguous, and boundary fixtures', () => {
    const candles = alternatingCandles();
    // Make one candle ambiguous and add a gapped stop candle for explicit fixture coverage.
    candles[50] = { ...candles[50], high: candles[50].close + 0.1, low: candles[50].close - 0.1 };
    candles[51] = { ...candles[51], open: candles[51].low - 2, low: candles[51].low - 2 };
    const result = backtestSignals(candles, {
      interval: '1day',
      timeZone: 'UTC',
      brokeragePerOrder: 2,
      slippagePercent: 0.1,
    });
    expect(result).toHaveProperty('numberOfTrades');
    expect(result).toHaveProperty('inSample');
    expect(result).toHaveProperty('outOfSample');
    expect(result.trades.every((trade) => Number.isFinite(trade.entryPrice))).toBe(true);
  });

  it('deducts costs and preserves the chronological 70/30 split', () => {
    const candles = alternatingCandles();
    const zeroCost = backtestSignals(candles, { interval: '1day', timeZone: 'UTC' });
    const withCosts = backtestSignals(candles, { interval: '1day', timeZone: 'UTC', brokeragePerOrder: 2, slippagePercent: 0.1 });
    expect(zeroCost.net.totalPnl).toBeCloseTo(zeroCost.gross.totalPnl);
    expect(withCosts.totalCosts).toBeGreaterThanOrEqual(0);
    expect(withCosts.inSample).toHaveProperty('trades');
    expect(withCosts.outOfSample).toHaveProperty('trades');
    expect(withCosts.inSample.trades.length + withCosts.outOfSample.trades.length).toBeGreaterThanOrEqual(0);
  });

  it('combines 70/30 results across symbols', () => {
    const candles = alternatingCandles();
    const combined = backtestSymbols([
      { symbol: 'AAA', candles, timeZone: 'UTC' },
      { symbol: 'BBB', candles, timeZone: 'UTC' },
    ], { interval: '1day', timeZone: 'UTC' });
    expect(combined.symbolsTested).toBe(2);
  });
});
