import { calculateATR } from './indicators.js';

function mergeNearbyLevels(levels, tolerance) {
  const merged = [];
  for (const price of levels.sort((a, b) => a - b)) {
    const existing = merged.find((level) => Math.abs(level.price - price) <= tolerance);
    if (existing) {
      existing.price = (existing.price * existing.touches + price) / (existing.touches + 1);
      existing.touches += 1;
    } else {
      merged.push({ price, touches: 1 });
    }
  }
  return merged;
}

export function findSupportResistance(candles, lookback = 120, options = {}) {
  const selected = Array.isArray(candles) ? candles.slice(-Math.max(3, lookback)) : [];
  const close = selected.at(-1)?.close;
  if (!Number.isFinite(close)) return { supports: [], resistances: [], atr: 0 };

  const atr = calculateATR(selected, 14, options).at(-1)?.value || 0;
  const tolerance = Math.max(atr * 0.2, Math.abs(close) * 0.001);
  const pivotHighs = [];
  const pivotLows = [];
  const radius = 2;

  for (let index = radius; index < selected.length - radius; index += 1) {
    const candle = selected[index];
    const left = selected.slice(index - radius, index);
    const right = selected.slice(index + 1, index + radius + 1);
    if (left.every((item) => candle.high >= item.high) && right.every((item) => candle.high >= item.high)) {
      pivotHighs.push(candle.high);
    }
    if (left.every((item) => candle.low <= item.low) && right.every((item) => candle.low <= item.low)) {
      pivotLows.push(candle.low);
    }
  }

  if (!pivotLows.length) pivotLows.push(Math.min(...selected.map((candle) => candle.low)));
  if (!pivotHighs.length) pivotHighs.push(Math.max(...selected.map((candle) => candle.high)));

  const supports = mergeNearbyLevels(pivotLows.filter((price) => Number.isFinite(price) && price <= close), tolerance)
    .sort((a, b) => b.price - a.price);
  const resistances = mergeNearbyLevels(pivotHighs.filter((price) => Number.isFinite(price) && price >= close), tolerance)
    .sort((a, b) => a.price - b.price);
  return { supports, resistances, atr };
}

export function buildTradeLevels({ direction = 'Long', entry, atr, supports = [], resistances = [] }) {
  if (!Number.isFinite(entry) || entry <= 0) {
    return { stop: 0, stopDistance: 0, target1: 0, target2: 0, method: 'ATR fallback' };
  }

  const isLong = direction !== 'Short';
  const safeAtr = Number.isFinite(atr) && atr > 0 ? atr : entry * 0.01;
  const minimumRisk = safeAtr * 0.75;
  const maximumRisk = safeAtr * 2.5;
  const structure = isLong
    ? supports.find((level) => Number.isFinite(level.price) && level.price < entry)
    : resistances.find((level) => Number.isFinite(level.price) && level.price > entry);
  const structuralRisk = structure ? (isLong ? entry - structure.price : structure.price - entry) : 0;
  const useStructure = structuralRisk >= minimumRisk && structuralRisk <= maximumRisk;
  const stopDistance = useStructure ? structuralRisk : safeAtr * 1.5;
  const stop = isLong ? entry - stopDistance : entry + stopDistance;
  const opposingLevels = isLong ? resistances : supports;
  const targets = opposingLevels
    .map((level) => level.price)
    .filter((price) => Number.isFinite(price) && (isLong ? price > entry : price < entry))
    .sort((a, b) => isLong ? a - b : b - a);
  const minimumTarget1 = isLong ? entry + stopDistance : entry - stopDistance;
  const minimumTarget2 = isLong ? entry + 2 * stopDistance : entry - 2 * stopDistance;
  const target1 = targets.find((price) => isLong ? price >= minimumTarget1 : price <= minimumTarget1) ?? minimumTarget1;
  const target2 = targets.find((price) => isLong ? price >= minimumTarget2 : price <= minimumTarget2) ?? minimumTarget2;

  return {
    stop,
    stopDistance,
    target1,
    target2,
    method: useStructure ? 'Structural support/resistance' : 'ATR fallback',
  };
}
