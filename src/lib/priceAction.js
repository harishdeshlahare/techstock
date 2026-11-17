function validCandle(candle) {
  return candle && [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite);
}

function getAverageTrueRange(candles, index, period = 14) {
  const first = Math.max(1, index - period);
  let total = 0;
  let count = 0;
  for (let cursor = first; cursor < index; cursor += 1) {
    const candle = candles[cursor];
    const previousClose = candles[cursor - 1]?.close;
    if (!validCandle(candle) || !Number.isFinite(previousClose)) continue;
    total += Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
    count += 1;
  }
  return count >= 3 ? total / count : 0;
}

function findOrderBlock(candles, displacementIndex, direction) {
  const displacement = candles[displacementIndex];
  if (!validCandle(displacement) || displacementIndex < 5) return null;

  const previousCandles = candles.slice(displacementIndex - 5, displacementIndex);
  if (previousCandles.some((candle) => !validCandle(candle))) return null;
  const previousHigh = Math.max(...previousCandles.map((candle) => candle.high));
  const previousLow = Math.min(...previousCandles.map((candle) => candle.low));
  const atr = getAverageTrueRange(candles, displacementIndex);
  const body = Math.abs(displacement.close - displacement.open);
  const hasDisplacement = atr > 0 && body >= atr * 0.75;
  const closesInDirection = direction === 'Long'
    ? displacement.close > displacement.open
    : displacement.close < displacement.open;
  const breaksStructure = direction === 'Long'
    ? displacement.close > previousHigh
    : displacement.close < previousLow;
  if (!hasDisplacement || !closesInDirection || !breaksStructure) return null;

  for (let cursor = displacementIndex - 1; cursor >= Math.max(1, displacementIndex - 3); cursor -= 1) {
    const candle = candles[cursor];
    const isOpposing = direction === 'Long'
      ? candle.close < candle.open
      : candle.close > candle.open;
    if (isOpposing) {
      return {
        type: 'Order block',
        direction,
        lower: candle.low,
        upper: candle.high,
        formedAt: displacementIndex,
      };
    }
  }
  return null;
}

function getActiveZones(candles, currentIndex, lookback, type, direction) {
  const firstFormation = Math.max(type === 'FVG' ? 2 : 5, currentIndex - lookback);
  const zones = [];

  for (let formedAt = firstFormation; formedAt < currentIndex; formedAt += 1) {
    let zone = null;
    if (type === 'FVG') {
      const current = candles[formedAt];
      const twoBack = candles[formedAt - 2];
      if (!validCandle(current) || !validCandle(twoBack)) continue;
      if (direction === 'Long' && current.close > current.open && current.low > twoBack.high) {
        zone = {
          type,
          direction,
          lower: twoBack.high,
          upper: current.low,
          formedAt,
        };
      } else if (direction === 'Short' && current.close < current.open && current.high < twoBack.low) {
        zone = {
          type,
          direction,
          lower: current.high,
          upper: twoBack.low,
          formedAt,
        };
      }
    } else {
      zone = findOrderBlock(candles, formedAt, direction);
    }
    if (!zone) continue;

    let mitigated = false;
    for (let cursor = zone.formedAt + 1; cursor <= currentIndex; cursor += 1) {
      const candle = candles[cursor];
      if (!validCandle(candle)) continue;
      if (direction === 'Long' ? candle.low <= zone.lower : candle.high >= zone.upper) {
        mitigated = true;
        break;
      }
    }
    if (!mitigated) zones.push(zone);
  }

  return zones;
}

function isConfirmedRetest(zone, candle) {
  if (!zone || !validCandle(candle)) return false;
  const touched = candle.low <= zone.upper && candle.high >= zone.lower;
  const midpoint = (zone.lower + zone.upper) / 2;
  return touched && (zone.direction === 'Long'
    ? candle.close > candle.open && candle.close >= midpoint
    : candle.close < candle.open && candle.close <= midpoint);
}

export function getPriceActionContext(candles, currentIndex = candles?.length - 1, lookback = 80) {
  if (!Array.isArray(candles) || !Number.isInteger(currentIndex) ||
      currentIndex < 0 || currentIndex >= candles.length || !validCandle(candles[currentIndex])) {
    return {
      bullishFvg: null,
      bearishFvg: null,
      bullishOrderBlock: null,
      bearishOrderBlock: null,
      longFvgRetest: false,
      shortFvgRetest: false,
      longOrderBlockRetest: false,
      shortOrderBlockRetest: false,
      longRetest: false,
      shortRetest: false,
    };
  }

  const bullishFvgs = getActiveZones(candles, currentIndex, lookback, 'FVG', 'Long');
  const bearishFvgs = getActiveZones(candles, currentIndex, lookback, 'FVG', 'Short');
  const bullishOrderBlocks = getActiveZones(candles, currentIndex, lookback, 'Order block', 'Long');
  const bearishOrderBlocks = getActiveZones(candles, currentIndex, lookback, 'Order block', 'Short');
  const candle = candles[currentIndex];
  const longFvgRetest = bullishFvgs.some((zone) => isConfirmedRetest(zone, candle));
  const shortFvgRetest = bearishFvgs.some((zone) => isConfirmedRetest(zone, candle));
  const longOrderBlockRetest = bullishOrderBlocks.some((zone) => isConfirmedRetest(zone, candle));
  const shortOrderBlockRetest = bearishOrderBlocks.some((zone) => isConfirmedRetest(zone, candle));
  const activeZone = (zones, isRetest) => (
    isRetest
      ? [...zones].reverse().find((zone) => isConfirmedRetest(zone, candle)) || zones.at(-1) || null
      : zones.at(-1) || null
  );

  return {
    bullishFvg: activeZone(bullishFvgs, longFvgRetest),
    bearishFvg: activeZone(bearishFvgs, shortFvgRetest),
    bullishOrderBlock: activeZone(bullishOrderBlocks, longOrderBlockRetest),
    bearishOrderBlock: activeZone(bearishOrderBlocks, shortOrderBlockRetest),
    longFvgRetest,
    shortFvgRetest,
    longOrderBlockRetest,
    shortOrderBlockRetest,
    longRetest: longFvgRetest || longOrderBlockRetest,
    shortRetest: shortFvgRetest || shortOrderBlockRetest,
  };
}
