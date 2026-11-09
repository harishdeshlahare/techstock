import { calculateATR, calculateEMA } from './indicators.js';
import { buildTradeLevels, findSupportResistance } from './levels.js';

function summarize(trades) {
  const pnl = trades.map((trade) => trade.pnl);
  const totalPnl = pnl.reduce((sum, value) => sum + value, 0);
  const averageR = trades.length
    ? trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length
    : 0;
  const wins = trades.filter((trade) => trade.rMultiple > 0).length;
  let equity = 0;
  let peak = 0;
  let maxDrawdownR = 0;
  trades.forEach((trade) => {
    equity += trade.rMultiple;
    peak = Math.max(peak, equity);
    maxDrawdownR = Math.max(maxDrawdownR, peak - equity);
  });
  return {
    numberOfTrades: trades.length,
    gross: { totalPnl },
    net: { totalPnl },
    winRate: trades.length ? wins / trades.length * 100 : 0,
    averageR,
    expectancy: averageR,
    maxDrawdownR,
    trades,
  };
}

function simulate(candles, startIndex, endIndex, indicators, interval, timeZone) {
  const trades = [];
  let nextAvailableIndex = startIndex;

  for (let index = Math.max(20, startIndex); index < endIndex - 1; index += 1) {
    if (index < nextAvailableIndex) continue;
    const candle = candles[index];
    const history = candles.slice(Math.max(0, index - 119), index + 1);
    const levels = findSupportResistance(history, 120, { interval, timeZone });
    const atr = indicators.atr.get(candle.time) || levels.atr;
    const fast = indicators.fast.get(candle.time);
    const slow = indicators.slow.get(candle.time);
    if (![atr, fast, slow].every(Number.isFinite) || atr <= 0) continue;
    const support = levels.supports[0];
    const resistance = levels.resistances[0];
    const tolerance = Math.max(atr * 0.5, candle.close * 0.002);
    const longSignal = support && candle.close > candle.open &&
      fast >= slow && candle.close - support.price <= tolerance;
    const shortSignal = resistance && candle.close < candle.open &&
      fast <= slow && resistance.price - candle.close <= tolerance;
    if (!longSignal && !shortSignal) continue;

    const direction = longSignal ? 'Long' : 'Short';
    const entryCandle = candles[index + 1];
    const entry = entryCandle.open;
    const plan = buildTradeLevels({
      direction,
      entry,
      atr,
      supports: levels.supports,
      resistances: levels.resistances,
    });
    if (!(plan.stopDistance > 0)) continue;

    let exitIndex = -1;
    let exitPrice;
    let target1Reached = false;
    let outcome = 'stop';
    for (let cursor = index + 1; cursor < endIndex; cursor += 1) {
      const current = candles[cursor];
      const stopHit = direction === 'Long' ? current.low <= plan.stop : current.high >= plan.stop;
      const target2Hit = direction === 'Long' ? current.high >= plan.target2 : current.low <= plan.target2;
      const target1Hit = direction === 'Long' ? current.high >= plan.target1 : current.low <= plan.target1;

      if (stopHit) {
        exitIndex = cursor;
        exitPrice = plan.stop;
        outcome = 'stop';
        break;
      }
      if (target2Hit) {
        target1Reached = true;
        exitIndex = cursor;
        exitPrice = plan.target2;
        outcome = 'target2';
        break;
      }
      if (target1Hit) target1Reached = true;
    }

    if (exitIndex === -1) continue;
    const sign = direction === 'Long' ? 1 : -1;
    const pnl = target1Reached
      ? ((plan.target1 - entry) + (exitPrice - entry)) * sign / 2
      : (exitPrice - entry) * sign;
    const rMultiple = pnl / plan.stopDistance;
    trades.push({
      entryTime: entryCandle.time,
      exitTime: candles[exitIndex].time,
      direction,
      outcome,
      pnl,
      rMultiple,
    });
    nextAvailableIndex = exitIndex + 1;
  }
  return summarize(trades);
}

export function backtestSignals(candles, { interval, timeZone } = {}) {
  if (!Array.isArray(candles) || candles.length < 24) {
    const empty = summarize([]);
    return { ...empty, inSample: empty, outOfSample: empty, symbolsTested: 1 };
  }

  const atr = calculateATR(candles, 14, { interval, timeZone });
  const fast = calculateEMA(candles, 9);
  const slow = calculateEMA(candles, 21);
  const indicators = {
    atr: new Map(atr.map((point) => [point.time, point.value])),
    fast: new Map(fast.map((point) => [point.time, point.value])),
    slow: new Map(slow.map((point) => [point.time, point.value])),
  };
  const splitIndex = Math.floor(candles.length * 0.7);
  const inSample = simulate(candles, 21, splitIndex, indicators, interval, timeZone);
  const outOfSample = simulate(candles, splitIndex, candles.length, indicators, interval, timeZone);
  const all = summarize([...inSample.trades, ...outOfSample.trades]);
  return { ...all, inSample, outOfSample, symbolsTested: 1 };
}
