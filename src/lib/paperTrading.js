export function getPaperAccountStorageKey(market) {
  return market === 'India'
    ? 'techstock-paper-account-india'
    : 'techstock-paper-account-us';
}

export function createPaperPortfolio(startingCash = 100_000) {
  const cash = Number(startingCash);
  if (!Number.isFinite(cash) || cash <= 0) {
    throw new Error('Starting cash must be greater than zero.');
  }
  return { startingCash: cash, cash, totalInvested: 0, positions: {}, orders: [] };
}

export function executePaperOrder(portfolio, order) {
  const symbol = String(order?.symbol || '').trim().toUpperCase();
  const side = String(order?.side || '').toLowerCase();
  const quantity = Number(order?.quantity);
  const price = Number(order?.price);
  if (!symbol) throw new Error('Enter a symbol.');
  if (!['buy', 'sell'].includes(side)) throw new Error('Order side must be buy or sell.');
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Quantity must be greater than zero.');
  if (!Number.isFinite(price) || price <= 0) throw new Error('Execution price must be greater than zero.');

  const value = quantity * price;
  const positions = { ...portfolio.positions };
  const currentPosition = positions[symbol];
  if (side === 'buy') {
    if (value > Number(portfolio.cash) + 1e-8) throw new Error('Insufficient paper-trading cash.');
    const previousQuantity = Number(currentPosition?.quantity || 0);
    const newQuantity = previousQuantity + quantity;
    positions[symbol] = {
      symbol,
      quantity: newQuantity,
      averagePrice: (
        previousQuantity * Number(currentPosition?.averagePrice || 0) + value
      ) / newQuantity,
      lastPrice: price,
    };
  } else {
    if (!currentPosition || quantity > Number(currentPosition.quantity) + 1e-8) {
      throw new Error(`Not enough ${symbol} shares to sell.`);
    }
    const remaining = Number(currentPosition.quantity) - quantity;
    if (remaining <= 1e-8) {
      delete positions[symbol];
    } else {
      positions[symbol] = { ...currentPosition, quantity: remaining, lastPrice: price };
    }
  }

  const orders = [...portfolio.orders, {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    symbol,
    side,
    quantity,
    price,
    value,
    executedAt: new Date().toISOString(),
  }];
  const cash = Number(portfolio.cash) + (side === 'sell' ? value : -value);
  const totalInvested = Object.values(positions)
    .reduce((total, position) => total + Number(position.quantity) * Number(position.averagePrice), 0);
  return { ...portfolio, cash, totalInvested, positions, orders };
}

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
