function validCandle(candle) {
  return candle && [candle.high, candle.low, candle.close].every(Number.isFinite);
}

const dateFormatters = new Map();

function getLocalDateParts(time, timeZone) {
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(new Date(time * 1000));
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function getDayKey(time, timeZone) {
  const { year, month, day } = getLocalDateParts(time, timeZone);
  return `${year}-${month}-${day}`;
}

function getWeekKey(dayKey) {
  const date = new Date(`${dayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function getPreviousPeriodPools(candles, index, timeZone) {
  const current = candles[index];
  if (!current) return [];
  const currentDay = getDayKey(current.time, timeZone);
  const currentKeys = {
    day: currentDay,
    week: getWeekKey(currentDay),
    month: currentDay.slice(0, 7),
  };
  const groups = { day: new Map(), week: new Map(), month: new Map() };
  for (let cursor = 0; cursor < index; cursor += 1) {
    const candle = candles[cursor];
    if (!validCandle(candle)) continue;
    const day = getDayKey(candle.time, timeZone);
    const keys = { day, week: getWeekKey(day), month: day.slice(0, 7) };
    for (const period of ['day', 'week', 'month']) {
      const key = keys[period];
      if (key >= currentKeys[period]) continue;
      const group = groups[period].get(key) || { high: -Infinity, low: Infinity };
      group.high = Math.max(group.high, candle.high);
      group.low = Math.min(group.low, candle.low);
      groups[period].set(key, group);
    }
  }
  return ['day', 'week', 'month'].flatMap((period) => {
    let previousKey = '';
    for (const key of groups[period].keys()) {
      if (key > previousKey) previousKey = key;
    }
    const previous = groups[period].get(previousKey);
    if (!previous) return [];
    const label = period === 'day' ? 'Previous-session' : period === 'week' ? 'Previous-week' : 'Previous-month';
    return [{
      resistance: { price: previous.high, touches: 1, type: `${label} high` },
      support: { price: previous.low, touches: 1, type: `${label} low` },
    }];
  });
}

function getSwingPools(candles, index, tolerance, lookback) {
  const start = Math.max(0, index - lookback);
  const highs = [];
  const lows = [];
  for (let cursor = start + 2; cursor < index - 2; cursor += 1) {
    const candle = candles[cursor];
    if (!validCandle(candle)) continue;
    const neighbors = candles.slice(cursor - 2, cursor).concat(candles.slice(cursor + 1, cursor + 3));
    if (neighbors.some((item) => !validCandle(item))) continue;
    if (neighbors.every((item) => candle.high >= item.high)) highs.push(candle.high);
    if (neighbors.every((item) => candle.low <= item.low)) lows.push(candle.low);
  }

  const getClusterPools = (prices, type) => {
    const clusters = [];
    for (const price of prices) {
      const cluster = clusters.find((item) => Math.abs(item.price - price) <= tolerance);
      if (cluster) {
        cluster.price = (cluster.price * cluster.touches + price) / (cluster.touches + 1);
        cluster.touches += 1;
      } else {
        clusters.push({ price, touches: 1 });
      }
    }
    return clusters.map((cluster) => ({
      ...cluster,
      type: cluster.touches >= 2 ? `Equal ${type}s` : `Swing-${type} liquidity`,
    }));
  };
  return { resistances: getClusterPools(highs, 'high'), supports: getClusterPools(lows, 'low') };
}

function getRoundNumberPools(close) {
  const step = close >= 5000 ? 500 : close >= 1000 ? 100 : close >= 200 ? 50 : close >= 50 ? 10 : close >= 10 ? 5 : 1;
  const nearest = Math.round(close / step) * step;
  return [-2, -1, 0, 1, 2].map((offset) => ({
    price: nearest + offset * step,
    touches: 1,
    type: 'Round-number liquidity',
  }));
}

function deduplicatePools(pools, close, tolerance) {
  const priority = (type) => (
    type?.startsWith('Equal') ? 5
      : type?.startsWith('Previous-week') || type?.startsWith('Previous-month') ? 4
        : type?.startsWith('Previous-session') ? 3
          : type?.startsWith('Swing') ? 2 : 1
  );
  const sorted = pools
    .filter((pool) => Number.isFinite(pool.price))
    .sort((first, second) => (
      Math.abs(first.price - close) - Math.abs(second.price - close) ||
      priority(second.type) - priority(first.type)
    ));
  const result = [];
  for (const pool of sorted) {
    if (result.some((item) => Math.abs(item.price - pool.price) <= tolerance)) continue;
    result.push(pool);
  }
  return result;
}

export function getLiquidityPools(candles, index = candles?.length - 1, {
  supports = [],
  resistances = [],
  atr = 0,
  timeZone = 'UTC',
  lookback = 120,
} = {}) {
  const candle = candles?.[index];
  if (!Array.isArray(candles) || !Number.isInteger(index) || index < 0 ||
      index >= candles.length || !validCandle(candle)) {
    return { supports: [], resistances: [] };
  }
  const close = candle.close;
  const tolerance = Math.max(Number.isFinite(atr) ? atr * 0.15 : 0, Math.abs(close) * 0.0005);
  const swingPools = getSwingPools(candles, index, tolerance, lookback);
  const candidateSupports = [
    ...supports.map((level) => ({
      ...level,
      type: level.touches >= 2 ? 'Equal lows' : 'Swing-low liquidity',
    })),
    ...swingPools.supports,
  ];
  const candidateResistances = [
    ...resistances.map((level) => ({
      ...level,
      type: level.touches >= 2 ? 'Equal highs' : 'Swing-high liquidity',
    })),
    ...swingPools.resistances,
  ];
  for (const pool of getPreviousPeriodPools(candles, index, timeZone)) {
    candidateSupports.push(pool.support);
    candidateResistances.push(pool.resistance);
  }
  for (const pool of getRoundNumberPools(close)) {
    if (pool.price < close) candidateSupports.push(pool);
    if (pool.price > close) candidateResistances.push(pool);
  }
  return {
    supports: deduplicatePools(candidateSupports.filter((pool) => pool.price < close), close, tolerance),
    resistances: deduplicatePools(candidateResistances.filter((pool) => pool.price > close), close, tolerance),
  };
}
