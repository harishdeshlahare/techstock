import { getPriceActionContext } from './priceAction.js';
import { getLiquidityPools } from './liquidity.js';

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
  timeZone = 'UTC',
  levelLookback = 120,
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
  const liquiditySweep = { long: null, short: null };
  let volumeExpanded = false;
  const liquidityChecks = {
    long: { poolIdentified: false, swept: false, reclaimed: false, rejection: false, structureShift: false },
    short: { poolIdentified: false, swept: false, reclaimed: false, rejection: false, structureShift: false },
  };
  let liquidityPools = { supports: [], resistances: [] };
  if (strategy === 'liquidity-sweep') {
    liquidityPools = getLiquidityPools(candles, index, {
      supports,
      resistances,
      atr,
      timeZone,
      lookback: levelLookback,
    });
    const previous = candles?.[index - 1];
    const candleBody = Math.abs((candle?.close || 0) - (candle?.open || 0));
    const minimumSweep = Math.max((Number.isFinite(atr) ? atr : 0) * 0.03, Math.abs(close || 0) * 0.0001);
    const maximumSweep = Math.max((Number.isFinite(atr) ? atr : 0) * 1.5, Math.abs(close || 0) * 0.002);
    const recentVolumes = candles.slice(Math.max(0, index - 20), index)
      .map((item) => item.volume)
      .filter((volume) => Number.isFinite(volume) && volume > 0);
    const averageVolume = recentVolumes.length
      ? recentVolumes.reduce((sum, volume) => sum + volume, 0) / recentVolumes.length
      : 0;
    volumeExpanded = averageVolume > 0 && Number.isFinite(candle?.volume) &&
      candle.volume >= averageVolume * 1.2;
    const findSweep = (direction, levels) => {
      if (!candle || !previous || ![candle.open, candle.high, candle.low, candle.close, previous.high, previous.low, previous.close].every(Number.isFinite)) {
        return { sweep: null, checks: liquidityChecks[direction === 'Long' ? 'long' : 'short'] };
      }
      let bestCandidate = null;
      let bestScore = -1;
      for (const level of levels) {
        if (!Number.isFinite(level.price)) continue;
        const isLong = direction === 'Long';
        const sweepDepth = isLong ? level.price - candle.low : candle.high - level.price;
        const wickSize = isLong
          ? Math.min(candle.open, candle.close) - candle.low
          : candle.high - Math.max(candle.open, candle.close);
        const sweptFromCorrectSide = isLong ? previous.close >= level.price : previous.close <= level.price;
        const reclaimed = isLong ? candle.close > level.price : candle.close < level.price;
        const rejection = wickSize >= Math.max(minimumSweep, candleBody * 0.5);
        const swept = sweepDepth >= minimumSweep && sweepDepth <= maximumSweep;
        const structureShift = isLong
          ? candle.close > previous.high && candle.close > candle.open
          : candle.close < previous.low && candle.close < candle.open;
        const checks = {
          poolIdentified: true,
          swept: sweptFromCorrectSide && swept,
          reclaimed: sweptFromCorrectSide && swept && reclaimed,
          rejection: sweptFromCorrectSide && swept && reclaimed && rejection,
          structureShift: sweptFromCorrectSide && swept && reclaimed && rejection && structureShift,
        };
        const score = Object.values(checks).filter(Boolean).length;
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = { checks, sweep: null };
        }
        if (sweptFromCorrectSide && swept && reclaimed && rejection && structureShift) {
          return {
            checks,
            sweep: {
            direction,
            level: level.price,
            poolType: level.type || (level.touches >= 2 ? (isLong ? 'Equal lows' : 'Equal highs') : (isLong ? 'Swing-low liquidity' : 'Swing-high liquidity')),
            sweepExtreme: isLong ? candle.low : candle.high,
            structureShift,
            volumeExpanded,
            },
          };
        }
      }
      return bestCandidate || { sweep: null, checks: liquidityChecks[direction === 'Long' ? 'long' : 'short'] };
    };
    const longResult = findSweep('Long', liquidityPools.supports);
    const shortResult = findSweep('Short', liquidityPools.resistances);
    liquiditySweep.long = longResult.sweep;
    liquiditySweep.short = shortResult.sweep;
    liquidityChecks.long = longResult.checks;
    liquidityChecks.short = shortResult.checks;
  }
  const usesLiquiditySweep = strategy === 'liquidity-sweep';
  const longLiquiditySweep = !usesLiquiditySweep || Boolean(liquiditySweep.long);
  const shortLiquiditySweep = !usesLiquiditySweep || Boolean(liquiditySweep.short);
  const longConditions = [
    ...(usesLiquiditySweep ? [
      { label: 'Sell-side liquidity pool identified', passed: liquidityChecks.long.poolIdentified },
      { label: 'Liquidity swept and reclaimed with rejection', passed: liquidityChecks.long.rejection },
      { label: 'Bullish structure shift confirmed', passed: liquidityChecks.long.structureShift },
      { label: 'Sweep volume expanded (context only)', passed: volumeExpanded, required: false },
    ] : [
      { label: 'Price near support', passed: nearSupport },
      { label: 'Bullish candle closed', passed: bullishCandle },
      { label: 'EMA 9/21 bullish alignment', passed: bullishEma },
    ]),
    ...(usesPriceAction ? [{ label: 'FVG or order-block retest', passed: longPriceAction }] : []),
  ];
  const shortConditions = [
    ...(usesLiquiditySweep ? [
      { label: 'Buy-side liquidity pool identified', passed: liquidityChecks.short.poolIdentified },
      { label: 'Liquidity swept and reclaimed with rejection', passed: liquidityChecks.short.rejection },
      { label: 'Bearish structure shift confirmed', passed: liquidityChecks.short.structureShift },
      { label: 'Sweep volume expanded (context only)', passed: volumeExpanded, required: false },
    ] : [
      { label: 'Price near resistance', passed: nearResistance },
      { label: 'Bearish candle closed', passed: bearishCandle },
      { label: 'EMA 9/21 bearish alignment', passed: bearishEma },
    ]),
    ...(usesPriceAction ? [{ label: 'FVG or order-block retest', passed: shortPriceAction }] : []),
  ];

  return {
    support,
    resistance,
    nearSupport,
    nearResistance,
    liquiditySweep,
    liquidityChecks,
    liquidityPools,
    longConditions,
    shortConditions,
    longSignal: longLiquiditySweep && longConditions.filter((condition) => condition.required !== false)
      .every((condition) => condition.passed),
    shortSignal: shortLiquiditySweep && shortConditions.filter((condition) => condition.required !== false)
      .every((condition) => condition.passed),
  };
}
