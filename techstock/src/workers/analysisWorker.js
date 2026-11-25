import { calculateATR, calculateEMA } from '../lib/indicators.js';
import { findSupportResistance } from '../lib/levels.js';
import { evaluateEntrySignals, getSignalLevelLookback } from '../lib/signalRules.js';
import { getPriceActionContext } from '../lib/priceAction.js';
import { backtestSignals, backtestSymbols } from '../lib/backtest.js';

function buildHistoricalMarkers({
  candles,
  interval,
  timeZone,
  strategy,
  levelLookback,
  ema9,
  ema21,
}) {
  const markers = [];
  const atrByTime = new Map(calculateATR(candles, 14, { interval, timeZone }).map((point) => [point.time, point.value]));
  const ema9ByTime = new Map(ema9.map((point) => [point.time, point.value]));
  const ema21ByTime = new Map(ema21.map((point) => [point.time, point.value]));

  candles.forEach((candle, index) => {
    if (index < 20) return;
    const history = candles.slice(Math.max(0, index - levelLookback + 1), index + 1);
    const historyLevels = findSupportResistance(history, levelLookback, { interval, timeZone });
    const historicalPriceAction = strategy === 'price-action'
      ? getPriceActionContext(candles.slice(0, index + 1), index)
      : undefined;
    const historicalSignals = evaluateEntrySignals({
      candles: candles.slice(0, index + 1),
      index,
      ema9: ema9ByTime.get(candle.time),
      ema21: ema21ByTime.get(candle.time),
      atr: atrByTime.get(candle.time) || 0,
      supports: historyLevels.supports,
      resistances: historyLevels.resistances,
      strategy,
      priceAction: historicalPriceAction,
      timeZone,
      levelLookback,
    });
    if (historicalSignals.longSignal) markers.push({
      time: candle.time,
      position: 'belowBar',
      shape: 'arrowUp',
      text: strategy === 'liquidity-sweep' ? '▲ Sweep Long' : strategy === 'price-action' ? '▲ FVG/OB Long' : '▲ Long',
    });
    if (historicalSignals.shortSignal) markers.push({
      time: candle.time,
      position: 'aboveBar',
      shape: 'arrowDown',
      text: strategy === 'liquidity-sweep' ? '▼ Sweep Short' : strategy === 'price-action' ? '▼ FVG/OB Short' : '▼ Short',
    });
  });
  return markers;
}

self.addEventListener('message', (event) => {
  const { id, type, payload } = event.data || {};
  try {
    if (type === 'chart') {
      const levelLookback = payload.levelLookback || getSignalLevelLookback(payload.interval);
      const ema9 = payload.ema9 || calculateEMA(payload.candles, 9);
      const ema21 = payload.ema21 || calculateEMA(payload.candles, 21);
      const markers = buildHistoricalMarkers({
        ...payload,
        levelLookback,
        ema9,
        ema21,
      });
      const backtest = backtestSignals(payload.candles, {
        interval: payload.interval,
        timeZone: payload.timeZone,
        strategy: payload.strategy,
        levelLookback,
        brokeragePerOrder: payload.brokeragePerOrder || 0,
        slippagePercent: payload.slippagePercent || 0,
      });
      self.postMessage({ id, result: { markers, backtest } });
      return;
    }
    if (type === 'backtest') {
      self.postMessage({ id, result: backtestSignals(payload.candles, payload.options) });
      return;
    }
    if (type === 'backtestSymbols') {
      self.postMessage({ id, result: backtestSymbols(payload.symbolCandles, payload.options) });
      return;
    }
    throw new Error(`Unknown worker request: ${type}`);
  } catch (error) {
    self.postMessage({ id, error: error?.message || 'Analysis worker failed.' });
  }
});
