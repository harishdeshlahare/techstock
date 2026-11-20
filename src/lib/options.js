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

export function buildGrowwOptionUrl({ indexId, expiryDate, strike, optionType }) {
  const index = Object.values(INDEX_DETAILS).find((details) => details.id === indexId);
  if (!index) throw new Error('Choose NIFTY or NIFTY BANK.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(expiryDate || ''))) {
    throw new Error('Choose a valid expiry date.');
  }
  const expiry = new Date(`${expiryDate}T00:00:00Z`);
  if (!Number.isFinite(expiry.getTime()) || expiry.toISOString().slice(0, 10) !== expiryDate) {
    throw new Error('Choose a valid expiry date.');
  }
  if (expiryDate < getIndiaDateKey(new Date())) {
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

export function getNextScheduledExpiryDate(indexId, referenceDate = new Date()) {
  const index = Object.values(INDEX_DETAILS).find((details) => details.id === indexId);
  if (!index) throw new Error('Choose a supported index.');
  const indiaDate = getIndiaDateKey(referenceDate);
  const [currentYear, currentMonth] = indiaDate.split('-').map(Number);
  for (let offset = 0; offset < 12; offset += 1) {
    const monthStart = new Date(Date.UTC(currentYear, currentMonth - 1 + offset, 1));
    const expiry = getMonthlyExpiryDate(index.id, monthStart.getUTCFullYear(), monthStart.getUTCMonth());
    if (expiry.toISOString().slice(0, 10) > indiaDate) {
      return expiry.toISOString().slice(0, 10);
    }
  }
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
