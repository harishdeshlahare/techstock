import { getPriceActionContext } from './priceAction.js';

const signalLookbacks = {
  '1min': 120,
  '2min': 120,
  '5min': 120,
  '15min': 100,
  '30min': 100,
  '1h': 80,
  '90min': 80,
  '1day': 120,
  '1week': 100,
  '1month': 80,
};

export function getSignalLevelLookback(interval) {
  return signalLookbacks[interval] || 120;
}

export function evaluateEntrySignals({
  candles,
  index = candles?.length - 1,
  candle = candles?.[index],
  ema9,
  ema21,
  atr,
  supports = [],
  resistances = [],
  strategy = 'support-resistance',
  priceAction,
} = {}) {
  const close = candle?.close;
  const tolerance = Number.isFinite(close)
    ? Math.max((Number.isFinite(atr) ? atr : 0) * 0.5, close * 0.002)
    : 0;
  const support = supports.find((level) => Number.isFinite(level.price) && level.price < close);
  const resistance = resistances.find((level) => Number.isFinite(level.price) && level.price > close);
  const nearSupport = Boolean(support && close - support.price <= tolerance);
  const nearResistance = Boolean(resistance && resistance.price - close <= tolerance);
  const bullishCandle = Boolean(candle && candle.close > candle.open);
  const bearishCandle = Boolean(candle && candle.close < candle.open);
  const bullishEma = Number.isFinite(ema9) && Number.isFinite(ema21) && ema9 >= ema21;
  const bearishEma = Number.isFinite(ema9) && Number.isFinite(ema21) && ema9 <= ema21;
  const usesPriceAction = strategy === 'price-action';
  const activePriceAction = priceAction || (usesPriceAction ? getPriceActionContext(candles, index) : null);
  const longPriceAction = !usesPriceAction || Boolean(activePriceAction?.longRetest);
  const shortPriceAction = !usesPriceAction || Boolean(activePriceAction?.shortRetest);
  const longConditions = [
    { label: 'Price near support', passed: nearSupport },
    { label: 'Bullish candle closed', passed: bullishCandle },
    { label: 'EMA 9/21 bullish alignment', passed: bullishEma },
    ...(usesPriceAction ? [{ label: 'FVG or order-block retest', passed: longPriceAction }] : []),
  ];
  const shortConditions = [
    { label: 'Price near resistance', passed: nearResistance },
    { label: 'Bearish candle closed', passed: bearishCandle },
    { label: 'EMA 9/21 bearish alignment', passed: bearishEma },
    ...(usesPriceAction ? [{ label: 'FVG or order-block retest', passed: shortPriceAction }] : []),
  ];

  return {
    support,
    resistance,
    nearSupport,
    nearResistance,
    longConditions,
    shortConditions,
    longSignal: longConditions.every((condition) => condition.passed),
    shortSignal: shortConditions.every((condition) => condition.passed),
  };
}
