import { calculateATR, calculateEMA } from './indicators.js';
import { buildTradeLevels, findSupportResistance } from './levels.js';
import { evaluateEntrySignals, getSignalLevelLookback } from './signalRules.js';

function summarize(trades) {
  const totalPnl = trades.reduce((sum, trade) => sum + trade.grossPnl, 0);
  const totalCosts = trades.reduce((sum, trade) => sum + trade.tradingCosts, 0);
  const netPnl = totalPnl - totalCosts;
  const averageGrossR = trades.length
    ? trades.reduce((sum, trade) => sum + trade.grossRMultiple, 0) / trades.length
    : 0;
  const averageR = trades.length
    ? trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length
    : 0;
  const grossWins = trades.filter((trade) => trade.grossPnl > 0).length;
  const netWins = trades.filter((trade) => trade.pnl > 0).length;
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
    gross: {
      totalPnl,
      winRate: trades.length ? grossWins / trades.length * 100 : 0,
      averageR: averageGrossR,
    },
    net: {
      totalPnl: netPnl,
      totalCosts,
      winRate: trades.length ? netWins / trades.length * 100 : 0,
      averageR,
    },
    totalCosts,
    winRate: trades.length ? netWins / trades.length * 100 : 0,
    averageR,
    expectancy: averageR,
    maxDrawdownR,
    trades,
  };
}

function normalizeCost(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
}

function getExecutionCost(price, shares, costs) {
  return costs.brokeragePerOrder + Math.abs(price) * costs.slippageRate * shares;
}

function simulate(candles, startIndex, endIndex, indicators, interval, timeZone, strategy, levelLookback, costs) {
  const trades = [];
  let nextAvailableIndex = startIndex;

  for (let index = Math.max(20, startIndex); index < endIndex - 1; index += 1) {
    if (index < nextAvailableIndex) continue;
    const candle = candles[index];
    const history = candles.slice(Math.max(0, index - levelLookback + 1), index + 1);
    const levels = findSupportResistance(history, levelLookback, { interval, timeZone });
    const atr = indicators.atr.get(candle.time) || levels.atr;
    const fast = indicators.fast.get(candle.time);
    const slow = indicators.slow.get(candle.time);
    if (![atr, fast, slow].every(Number.isFinite) || atr <= 0) continue;
    const signal = evaluateEntrySignals({
      candles,
      index,
      ema9: fast,
      ema21: slow,
      atr,
      supports: levels.supports,
      resistances: levels.resistances,
      strategy,
    });
    const { longSignal, shortSignal } = signal;
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
    let grossPnl = 0;
    let tradingCosts = getExecutionCost(entry, 2, costs);
    let outcome = 'stop';
    for (let cursor = index + 1; cursor < endIndex; cursor += 1) {
      const current = candles[cursor];
      const stopHit = direction === 'Long' ? current.low <= plan.stop : current.high >= plan.stop;
      const target2Hit = direction === 'Long' ? current.high >= plan.target2 : current.low <= plan.target2;
      const target1Hit = direction === 'Long' ? current.high >= plan.target1 : current.low <= plan.target1;
      const sign = direction === 'Long' ? 1 : -1;

      if (stopHit) {
        exitIndex = cursor;
        const stopGapped = direction === 'Long' ? current.open < plan.stop : current.open > plan.stop;
        exitPrice = stopGapped ? current.open : plan.stop;
        const remainingShares = target1Reached ? 1 : 2;
        grossPnl += sign * (exitPrice - entry) * remainingShares;
        tradingCosts += getExecutionCost(exitPrice, remainingShares, costs);
        outcome = 'stop';
        break;
      }
      if (target2Hit) {
        if (!target1Reached) {
          target1Reached = true;
          grossPnl += sign * (plan.target1 - entry);
          tradingCosts += getExecutionCost(plan.target1, 1, costs);
        }
        exitIndex = cursor;
        exitPrice = plan.target2;
        grossPnl += sign * (exitPrice - entry);
        tradingCosts += getExecutionCost(exitPrice, 1, costs);
        outcome = 'target2';
        break;
      }
      if (target1Hit && !target1Reached) {
        target1Reached = true;
        grossPnl += sign * (plan.target1 - entry);
        tradingCosts += getExecutionCost(plan.target1, 1, costs);
      }
    }

    if (exitIndex === -1) {
      exitIndex = endIndex - 1;
      exitPrice = candles[exitIndex].close;
      const remainingShares = target1Reached ? 1 : 2;
      grossPnl += (direction === 'Long' ? 1 : -1) * (exitPrice - entry) * remainingShares;
      tradingCosts += getExecutionCost(exitPrice, remainingShares, costs);
      outcome = 'end-of-data';
    }
    const netPnl = grossPnl - tradingCosts;
    const initialRisk = plan.stopDistance * 2;
    const grossRMultiple = grossPnl / initialRisk;
    const rMultiple = netPnl / initialRisk;
    trades.push({
      entryTime: entryCandle.time,
      exitTime: candles[exitIndex].time,
      direction,
      outcome,
      partialTargetReached: target1Reached,
      grossPnl,
      tradingCosts,
      pnl: netPnl,
      grossRMultiple,
      rMultiple,
    });
    nextAvailableIndex = exitIndex + 1;
  }
  return summarize(trades);
}

export function backtestSignals(candles, {
  interval,
  timeZone,
  strategy = 'support-resistance',
  levelLookback = getSignalLevelLookback(interval),
  brokeragePerOrder = 0,
  slippagePercent = 0,
} = {}) {
  const costs = {
    brokeragePerOrder: normalizeCost(brokeragePerOrder),
    slippageRate: normalizeCost(slippagePercent) / 100,
  };
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
  const inSample = simulate(candles, 21, splitIndex, indicators, interval, timeZone, strategy, levelLookback, costs);
  const outOfSample = simulate(candles, splitIndex, candles.length, indicators, interval, timeZone, strategy, levelLookback, costs);
  const all = summarize([...inSample.trades, ...outOfSample.trades]);
  return { ...all, inSample, outOfSample, symbolsTested: 1 };
}
