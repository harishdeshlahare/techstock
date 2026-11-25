function isLong(trade) {
  return trade.direction !== 'Short';
}

function calculatePnl(trade, exitPrice, partialExitPrice = null) {
  const entry = Number(trade.entryFillPrice ?? trade.entryPrice);
  const shares = Number(trade.shares || 0);
  const direction = isLong(trade) ? 1 : -1;
  const gross = partialExitPrice === null
    ? (exitPrice - entry) * direction * shares
    : ((partialExitPrice - entry) + (exitPrice - entry)) * direction * shares / 2;
  return gross - (Number(trade.estimatedCosts) || 0);
}

function finishTrade(trade, outcome, candle, exitPrice, partialExitPrice = null) {
  const entry = Number(trade.entryFillPrice ?? trade.entryPrice);
  const initialRisk = Math.abs(entry - Number(trade.stopPrice));
  const pnl = calculatePnl(trade, exitPrice, partialExitPrice);
  const heldFrom = Number(trade.entryHitAt ?? candle.time);
  const rMultiple = initialRisk > 0 && Number(trade.shares) > 0
    ? pnl / (initialRisk * Number(trade.shares))
    : null;
  return {
    ...trade,
    outcome,
    hitAt: candle.time,
    exitPrice,
    pnl,
    rMultiple,
    durationMinutes: Math.max(0, (candle.time - heldFrom) / 60),
    statusLabel: `Hit candle: ${new Date(candle.time * 1000).toLocaleString()}`,
  };
}

function checkOpenTrade(trade, candles) {
  const long = isLong(trade);
  const entry = Number(trade.entryFillPrice ?? trade.entryPrice);
  const stop = Number(trade.stopPrice);
  const target1 = Number(trade.target1Price ?? trade.targetPrice);
  const target2 = Number(trade.target2Price ?? trade.targetPrice);
  let updated = trade;
  const firstTime = candles[0]?.time;
  const referenceTime = Number(trade.entryHitAt ?? Date.parse(trade.createdAt) / 1000);

  if (Number.isFinite(firstTime) && Number.isFinite(referenceTime) && referenceTime < firstTime) {
    return {
      ...trade,
      outcome: 'expired',
      statusLabel: 'Unchecked: older than available data',
    };
  }

  for (const candle of candles) {
    if (candle.time <= Number(trade.entryHitAt)) continue;
    if (updated.outcome === 'target1' && candle.time <= Number(updated.target1HitAt)) continue;

    const alreadyAtTarget1 = updated.outcome === 'target1';
    const activeStop = updated.moveStopToBreakeven && alreadyAtTarget1 ? entry : stop;
    const stopHit = long ? candle.low <= activeStop : candle.high >= activeStop;
    const target1Hit = long ? candle.high >= target1 : candle.low <= target1;
    const target2Hit = long ? candle.high >= target2 : candle.low <= target2;
    const anyTargetHit = alreadyAtTarget1 ? target2Hit : target1Hit || target2Hit;

    if (stopHit && anyTargetHit) {
      updated = {
        ...updated,
        outcome: 'ambiguous',
        hitAt: candle.time,
        statusLabel: 'Stop and target touched — order unknown',
      };
      break;
    }

    if (stopHit) {
      const breakevenStop = updated.moveStopToBreakeven &&
        alreadyAtTarget1;
      updated = finishTrade(
        updated,
        breakevenStop ? 'breakeven' : 'stop',
        candle,
        activeStop,
        alreadyAtTarget1 ? Number(updated.target1Price ?? updated.targetPrice) : null,
      );
      break;
    }

    if (target2Hit) {
      updated = finishTrade(
        updated,
        'target2',
        candle,
        target2,
        alreadyAtTarget1 ? Number(updated.target1Price ?? updated.targetPrice) : null,
      );
      break;
    }

    if (!alreadyAtTarget1 && target1Hit) {
      updated = {
        ...updated,
        outcome: 'target1',
        target1HitAt: candle.time,
        target1ExitPrice: target1,
        statusLabel: `Target 1 hit candle: ${new Date(candle.time * 1000).toLocaleString()} · tracking`,
      };
    }
  }
  return updated;
}

export function updateTradeHistory(trades, candles, symbol, interval) {
  if (!Array.isArray(trades) || !Array.isArray(candles) || candles.length === 0) return trades;
  let changed = false;
  const updatedTrades = trades.map((trade) => {
    if (
      trade.symbol !== symbol ||
      trade.interval !== interval ||
      !['pending', 'open', 'target1'].includes(trade.outcome || 'pending')
    ) return trade;

    let updated = trade;
    if ((trade.outcome || 'pending') === 'pending') {
      const createdAt = Date.parse(trade.createdAt);
      const entryLow = Number(trade.entryZoneLow ?? trade.entryPrice);
      const entryHigh = Number(trade.entryZoneHigh ?? trade.entryPrice);
      const entryCandle = candles.find((candle) => (
        (!Number.isFinite(createdAt) || candle.time * 1000 > createdAt) &&
        candle.low <= entryHigh && candle.high >= entryLow
      ));

      if (!entryCandle) {
        const firstCandleTime = candles[0]?.time;
        if (Number.isFinite(createdAt) && Number.isFinite(firstCandleTime) && createdAt / 1000 < firstCandleTime) {
          updated = { ...trade, outcome: 'expired', statusLabel: 'Unchecked: older than available data' };
        }
      } else {
        updated = {
          ...trade,
          outcome: 'open',
          entryHitAt: entryCandle.time,
          entryFillPrice: Number(trade.entryPrice),
          statusLabel: `Entry hit candle: ${new Date(entryCandle.time * 1000).toLocaleString()} · tracking`,
        };
        updated = checkOpenTrade(updated, candles);
      }
    } else {
      updated = checkOpenTrade(trade, candles);
    }

    if (updated !== trade) changed = true;
    return updated;
  });
  return changed ? updatedTrades : trades;
}
