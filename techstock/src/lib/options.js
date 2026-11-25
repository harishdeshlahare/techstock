import { getTrend } from './indicators.js';
import { buildTradeLevels, findSupportResistance } from './levels.js';

const MONTHS = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

const INDEX_DETAILS = {
  NIFTY: { id: 'nifty', slug: 'nifty', yahooSymbol: '^NSEI', strikeStep: 50, lotSize: 65 },
  BANKNIFTY: { id: 'banknifty', slug: 'nifty-bank', yahooSymbol: '^NSEBANK', strikeStep: 100, lotSize: 30 },
  SENSEX: { id: 'sensex', slug: 'sp-bse-sensex', yahooSymbol: '^BSESN', strikeStep: 100, lotSize: 20 },
};

function getMonthlyExpiryWeekday(indexId, year, month) {
  if (indexId === 'sensex') return 4;
  const usesTuesdayExpiry = year > 2025 || (year === 2025 && month >= 8);
  if (usesTuesdayExpiry) return 2;
  return indexId === 'banknifty' ? 3 : 4;
}

function getMonthlyExpiryDate(indexId, year, month) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  const weekday = getMonthlyExpiryWeekday(indexId, year, month);
  const daysBack = (lastDay.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, month, lastDay.getUTCDate() - daysBack));
}

function parseGrowwUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('Enter a complete Groww URL starting with https://groww.in/.');
  }
  if (!['groww.in', 'www.groww.in'].includes(url.hostname) || url.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs from groww.in are supported.');
  }
  return url;
}

function getIndexDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function isPlausibleIndexStrike(value) {
  return Number.isFinite(value) && value >= 1_000 && value <= 200_000;
}

export function parseGrowwOptionUrl(value) {
  const url = parseGrowwUrl(value);
  const match = url.pathname.match(/^\/options\/(nifty|nifty-bank|banknifty|sp-bse-sensex)\/([a-z0-9-]+)\/?$/i);
  if (!match) {
    throw new Error('Use a Groww NIFTY, NIFTY BANK, or SENSEX option URL.');
  }

  const routeIndex = match[1].toUpperCase();
  const symbol = match[2].replace(/-/g, '').toUpperCase();
  const contractMatch = symbol.match(/^(NIFTY|BANKNIFTY|SENSEX)(\d{2})([A-Z]{3})(\d+)(CE|PE)$/);
  if (!contractMatch) {
    throw new Error('The option symbol must include an expiry date, strike, and CE or PE.');
  }
  const [, prefix, yearText, monthText, strikeDigits, optionType] = contractMatch;
  const index = INDEX_DETAILS[prefix];
  const routeIndexId = routeIndex === 'NIFTY'
    ? 'nifty'
    : routeIndex === 'SP-BSE-SENSEX'
      ? 'sensex'
      : 'banknifty';
  if (index.id !== routeIndexId) {
    throw new Error('The option symbol does not match the Groww URL index.');
  }
  const month = MONTHS[monthText];
  const year = 2000 + Number(yearText);
  if (Number(yearText) < 20 || Number(yearText) > 39) {
    throw new Error('The option symbol contains an unsupported expiry year.');
  }
  if (month === undefined) throw new Error('The option symbol contains an invalid expiry month.');
  const strike = Number(strikeDigits);
  if (!isPlausibleIndexStrike(strike)) {
    throw new Error('The option symbol contains an invalid index strike.');
  }
  const expiry = getMonthlyExpiryDate(index.id, year, month);

  return {
    symbol,
    indexId: index.id,
    yahooSymbol: index.yahooSymbol,
    expiryDate: expiry.toISOString().slice(0, 10),
    strike,
    optionType,
  };
}

export function buildGrowwOptionUrl({ indexId, expiryDate, strike, optionType, referenceDate = new Date() }) {
  const index = Object.values(INDEX_DETAILS).find((details) => details.id === indexId);
  if (!index) throw new Error('Choose NIFTY, NIFTY BANK, or SENSEX.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(expiryDate || ''))) {
    throw new Error('Choose a valid expiry date.');
  }
  const expiry = new Date(`${expiryDate}T00:00:00Z`);
  if (!Number.isFinite(expiry.getTime()) || expiry.toISOString().slice(0, 10) !== expiryDate) {
    throw new Error('Choose a valid expiry date.');
  }
  if (expiryDate < getIndiaDateKey(referenceDate)) {
    throw new Error('Choose an expiry date that has not passed.');
  }
  const scheduledExpiry = getMonthlyExpiryDate(indexId, expiry.getUTCFullYear(), expiry.getUTCMonth())
    .toISOString()
    .slice(0, 10);
  if (expiryDate !== scheduledExpiry) {
    throw new Error(`Choose the scheduled monthly expiry date: ${scheduledExpiry}.`);
  }
  const numericStrike = Number(strike);
  if (!isPlausibleIndexStrike(numericStrike) || !Number.isInteger(numericStrike)) {
    throw new Error('Enter a valid whole-number index strike.');
  }
  if (!['CE', 'PE'].includes(optionType)) throw new Error('Choose CE or PE.');
  const month = Object.keys(MONTHS).find((key) => MONTHS[key] === expiry.getUTCMonth());
  const year = String(expiry.getUTCFullYear()).slice(-2);
  const symbolPrefix = indexId === 'nifty' ? 'NIFTY' : indexId === 'sensex' ? 'SENSEX' : 'BANKNIFTY';
  const symbol = `${symbolPrefix}${year}${month}${numericStrike}${optionType}`;
  return `https://groww.in/options/${index.slug}/${symbol}`;
}

function getIndiaDateKey(date) {
  const values = getIndexDateParts(date);
  return `${values.year}-${values.month}-${values.day}`;
}

export function getUpcomingScheduledExpiryDates(indexId, count = 3, referenceDate = new Date()) {
  const index = Object.values(INDEX_DETAILS).find((details) => details.id === indexId);
  if (!index) throw new Error('Choose a supported index.');
  const indiaDate = getIndiaDateKey(referenceDate);
  const [currentYear, currentMonth] = indiaDate.split('-').map(Number);
  const dates = [];
  for (let offset = 0; offset < 12 && dates.length < count; offset += 1) {
    const monthStart = new Date(Date.UTC(currentYear, currentMonth - 1 + offset, 1));
    const expiry = getMonthlyExpiryDate(index.id, monthStart.getUTCFullYear(), monthStart.getUTCMonth());
    const iso = expiry.toISOString().slice(0, 10);
    if (iso >= indiaDate) dates.push(iso);
  }
  return dates;
}

export function getNextScheduledExpiryDate(indexId, referenceDate = new Date()) {
  const indiaDate = getIndiaDateKey(referenceDate);
  const upcoming = getUpcomingScheduledExpiryDates(indexId, 2, referenceDate)
    .find((date) => date > indiaDate);
  if (upcoming) return upcoming;
  throw new Error('Unable to determine the next scheduled monthly expiry.');
}

export function getOptionStrikeStep(indexId) {
  return Object.values(INDEX_DETAILS).find((details) => details.id === indexId)?.strikeStep || 100;
}

export function getOptionLotSize(indexId) {
  return Object.values(INDEX_DETAILS).find((details) => details.id === indexId)?.lotSize || 1;
}

export function getOptionExpiryStatus(expiryDate, today = getIndiaDateKey(new Date())) {
  return expiryDate < today ? 'expired' : 'active';
}

export function calculateOptionExpiryPnl(optionType, strike, entryPremium, underlyingAtExpiry, quantity = 1) {
  if (!['CE', 'PE'].includes(optionType) ||
      ![strike, entryPremium, underlyingAtExpiry, quantity].every(Number.isFinite) ||
      strike <= 0 || entryPremium < 0 || underlyingAtExpiry < 0 || quantity <= 0) {
    throw new Error('Enter valid option type, strike, premium, underlying value, and quantity.');
  }
  const intrinsic = optionType === 'CE'
    ? Math.max(underlyingAtExpiry - strike, 0)
    : Math.max(strike - underlyingAtExpiry, 0);
  return {
    intrinsicPerUnit: intrinsic,
    pnlPerUnit: intrinsic - entryPremium,
    totalPnl: (intrinsic - entryPremium) * quantity,
    breakEven: optionType === 'CE' ? strike + entryPremium : strike - entryPremium,
    maximumLoss: entryPremium * quantity,
  };
}

function normalCdf(value) {
  const sign = value >= 0 ? 1 : -1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const coefficients = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
  const polynomial = coefficients[0] * t
    + coefficients[1] * t ** 2
    + coefficients[2] * t ** 3
    + coefficients[3] * t ** 4
    + coefficients[4] * t ** 5;
  const erf = sign * (1 - polynomial * Math.exp(-x * x));
  return (1 + erf) / 2;
}

function normalPdf(value) {
  return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
}

function blackScholesTerms(spot, strike, timeInYears, volatility, riskFreeRate) {
  const sqrtTime = Math.sqrt(timeInYears);
  const d1 = (Math.log(spot / strike) + (riskFreeRate + volatility * volatility / 2) * timeInYears)
    / (volatility * sqrtTime);
  const d2 = d1 - volatility * sqrtTime;
  const discount = Math.exp(-riskFreeRate * timeInYears);
  return { d1, d2, discount, sqrtTime };
}

function blackScholesPrice(optionType, spot, strike, timeInYears, volatility, riskFreeRate) {
  const { d1, d2, discount } = blackScholesTerms(spot, strike, timeInYears, volatility, riskFreeRate);
  return optionType === 'CE'
    ? spot * normalCdf(d1) - strike * discount * normalCdf(d2)
    : strike * discount * normalCdf(-d2) - spot * normalCdf(-d1);
}

function resolveOptionTimeInYears(expiryDate, currentDate) {
  const expiry = new Date(`${expiryDate}T00:00:00Z`);
  const current = new Date(`${currentDate}T00:00:00Z`);
  if (!Number.isFinite(expiry.getTime()) || !Number.isFinite(current.getTime()) || expiry < current) {
    throw new Error('Enter an active expiry date.');
  }
  return Math.max(1 / 365, (expiry.getTime() - current.getTime()) / (365 * 24 * 60 * 60 * 1000));
}

export function estimateOptionPremium({
  optionType,
  strike,
  underlyingPrice,
  targetUnderlying,
  expiryDate,
  currentDate = getIndiaDateKey(new Date()),
  volatilityPercent = 15,
  riskFreePercent = 6.5,
}) {
  if (!['CE', 'PE'].includes(optionType) ||
      ![strike, underlyingPrice, targetUnderlying, volatilityPercent, riskFreePercent].every(Number.isFinite) ||
      strike <= 0 || underlyingPrice <= 0 || targetUnderlying <= 0 ||
      volatilityPercent <= 0) {
    throw new Error('Enter valid option and volatility values.');
  }

  const timeInYears = resolveOptionTimeInYears(expiryDate, currentDate);
  const volatility = volatilityPercent / 100;
  const riskFreeRate = riskFreePercent / 100;
  const currentPremium = blackScholesPrice(optionType, underlyingPrice, strike, timeInYears, volatility, riskFreeRate);
  const targetPremium = Math.max(0, blackScholesPrice(optionType, targetUnderlying, strike, timeInYears, volatility, riskFreeRate));
  return {
    currentPremium,
    targetPremium,
    premiumChange: targetPremium - currentPremium,
  };
}

export function calculateOptionGreeks({
  optionType,
  strike,
  underlyingPrice,
  expiryDate,
  currentDate = getIndiaDateKey(new Date()),
  volatilityPercent = 15,
  riskFreePercent = 6.5,
}) {
  if (!['CE', 'PE'].includes(optionType) ||
      ![strike, underlyingPrice, volatilityPercent, riskFreePercent].every(Number.isFinite) ||
      strike <= 0 || underlyingPrice <= 0 || volatilityPercent <= 0) {
    return null;
  }

  let timeInYears;
  try {
    timeInYears = resolveOptionTimeInYears(expiryDate, currentDate);
  } catch {
    return null;
  }
  const volatility = volatilityPercent / 100;
  const riskFreeRate = riskFreePercent / 100;
  const { d1, d2, discount, sqrtTime } = blackScholesTerms(
    underlyingPrice,
    strike,
    timeInYears,
    volatility,
    riskFreeRate,
  );
  const delta = optionType === 'CE' ? normalCdf(d1) : normalCdf(d1) - 1;
  const commonDecay = -(underlyingPrice * normalPdf(d1) * volatility) / (2 * sqrtTime);
  const annualTheta = optionType === 'CE'
    ? commonDecay - riskFreeRate * strike * discount * normalCdf(d2)
    : commonDecay + riskFreeRate * strike * discount * normalCdf(-d2);
  return {
    delta,
    thetaPerDay: annualTheta / 365,
  };
}

export function estimateImpliedVolatility({
  optionType,
  strike,
  underlyingPrice,
  marketPremium,
  expiryDate,
  currentDate = getIndiaDateKey(new Date()),
  riskFreePercent = 6.5,
}) {
  if (!['CE', 'PE'].includes(optionType) ||
      ![strike, underlyingPrice, marketPremium, riskFreePercent].every(Number.isFinite) ||
      strike <= 0 || underlyingPrice <= 0 || marketPremium <= 0) {
    return null;
  }

  let timeInYears;
  try {
    timeInYears = resolveOptionTimeInYears(expiryDate, currentDate);
  } catch {
    return null;
  }
  const riskFreeRate = riskFreePercent / 100;
  let low = 0.01;
  let high = 3.0;
  const minPrice = blackScholesPrice(optionType, underlyingPrice, strike, timeInYears, low, riskFreeRate);
  const maxPrice = blackScholesPrice(optionType, underlyingPrice, strike, timeInYears, high, riskFreeRate);
  if (marketPremium < minPrice || marketPremium > maxPrice) return null;

  for (let iteration = 0; iteration < 40; iteration += 1) {
    const mid = (low + high) / 2;
    const price = blackScholesPrice(optionType, underlyingPrice, strike, timeInYears, mid, riskFreeRate);
    if (price < marketPremium) low = mid;
    else high = mid;
  }
  return ((low + high) / 2) * 100;
}

export function buildOptionsTechnicalSetup(candles, optionType, options = {}) {
  if (!Array.isArray(candles) || candles.length < 22) {
    throw new Error(`At least 22 completed ${options.interval || 'daily'} index candles are required for analysis.`);
  }
  if (!['CE', 'PE'].includes(optionType)) throw new Error('The option type must be CE or PE.');

  const lastCandle = candles.at(-1);
  const direction = optionType === 'CE' ? 'Long' : 'Short';
  const levels = findSupportResistance(candles, options.lookback || 120);
  const trend = getTrend(candles);
  const entry = direction === 'Long' ? lastCandle.high : lastCandle.low;
  const tradeLevels = buildTradeLevels({
    direction,
    entry,
    atr: levels.atr,
    supports: levels.supports,
    resistances: levels.resistances,
  });

  return {
    trend,
    aligned: (optionType === 'CE' && trend === 'Bullish') || (optionType === 'PE' && trend === 'Bearish'),
    setupDirection: direction,
    entry,
    stop: tradeLevels.stop,
    target1: tradeLevels.target1,
    target2: tradeLevels.target2,
    method: tradeLevels.method,
    candleTime: lastCandle.time,
    timeframe: options.interval || '1day',
  };
}
