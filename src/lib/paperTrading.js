export function calculatePositionPnl(position, marketPrice) {
  const quantity = Number(position?.quantity);
  const averagePrice = Number(position?.averagePrice);
  if (!Number.isFinite(quantity) || quantity <= 0 ||
      !Number.isFinite(averagePrice) || averagePrice <= 0 ||
      !Number.isFinite(marketPrice) || marketPrice <= 0) {
    return null;
  }
  return (marketPrice - averagePrice) * quantity;
}

export function getPositionRiskStatus(marketPrice, stopLoss, target) {
  const price = Number(marketPrice);
  const stop = Number(stopLoss);
  const targetPrice = Number(target);
  const validPrice = Number.isFinite(price) && price > 0;
  const validStop = Number.isFinite(stop) && stop > 0;
  const validTarget = Number.isFinite(targetPrice) && targetPrice > 0;

  if (validStop && validTarget && stop >= targetPrice) {
    return 'Stop loss must be below target.';
  }
  if (!validPrice) return '';
  if (validStop && price <= stop) return 'Stop loss reached — review and sell manually.';
  if (validTarget && price >= targetPrice) return 'Target reached — review and sell manually.';
  return '';
}
