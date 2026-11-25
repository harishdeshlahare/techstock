function validPrice(value) {
  return Number.isFinite(value);
}

export function calculateEMA(candles, period) {
  if (!Array.isArray(candles) || !Number.isInteger(period) || period < 1 || candles.length < period) return [];
  const result = [];
  const seed = candles.slice(0, period);
  if (seed.some((candle) => !validPrice(candle.close))) return [];

  let average = seed.reduce((sum, candle) => sum + candle.close, 0) / period;
  result.push({ time: seed.at(-1).time, value: average });
  const multiplier = 2 / (period + 1);
  for (let index = period; index < candles.length; index += 1) {
    const close = candles[index].close;
    if (!validPrice(close)) continue;
    average = (close - average) * multiplier + average;
    result.push({ time: candles[index].time, value: average });
  }
  return result;
}

export function calculateRSI(candles, period = 14) {
  if (!Array.isArray(candles) || !Number.isInteger(period) || period < 1 || candles.length <= period) return [];
  const result = [];
  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    if (!Number.isFinite(change)) return [];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  const toRsi = () => {
    if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
    return 100 - 100 / (1 + averageGain / averageLoss);
  };
  result.push({ time: candles[period].time, value: toRsi() });

  for (let index = period + 1; index < candles.length; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    if (!Number.isFinite(change)) continue;
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    result.push({ time: candles[index].time, value: toRsi() });
  }
  return result;
}

export function calculateATR(candles, period = 14) {
  if (!Array.isArray(candles) || !Number.isInteger(period) || period < 1 || candles.length <= period) return [];
  const ranges = [];
  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index];
    const previousClose = candles[index - 1].close;
    if (![candle.high, candle.low, previousClose].every(Number.isFinite)) continue;
    ranges.push({
      time: candle.time,
      value: Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose)),
    });
  }
  if (ranges.length < period) return [];

  const result = [];
  let average = ranges.slice(0, period).reduce((sum, range) => sum + range.value, 0) / period;
  result.push({ time: ranges[period - 1].time, value: average });
  for (let index = period; index < ranges.length; index += 1) {
    average = (average * (period - 1) + ranges[index].value) / period;
    result.push({ time: ranges[index].time, value: average });
  }
  return result;
}

function localDateKey(time, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date(time * 1000));
}

export function calculateVWAP(candles, timeZone = 'UTC') {
  if (!Array.isArray(candles)) return [];
  const result = [];
  let session = '';
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;

  for (const candle of candles) {
    const date = localDateKey(candle.time, timeZone);
    if (date !== session) {
      session = date;
      cumulativePriceVolume = 0;
      cumulativeVolume = 0;
    }
    if (!Number.isFinite(candle.volume) || candle.volume <= 0 ||
        ![candle.high, candle.low, candle.close].every(Number.isFinite)) continue;
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativePriceVolume += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
    result.push({ time: candle.time, value: cumulativePriceVolume / cumulativeVolume });
  }
  return result;
}

export function getTrend(candles) {
  const fast = calculateEMA(candles, 9).at(-1)?.value;
  const slow = calculateEMA(candles, 21).at(-1)?.value;
  const close = candles?.at(-1)?.close;
  if (![fast, slow, close].every(Number.isFinite)) return 'Sideways';
  if (fast > slow && close >= slow) return 'Bullish';
  if (fast < slow && close <= slow) return 'Bearish';
  return 'Sideways';
}
