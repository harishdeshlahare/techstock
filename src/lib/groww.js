import { getOptionLotSize } from './options.js';
import { normalizeYahooProxyUrl } from './yahoo.js';

const INDEX_EXCHANGES = {
  nifty: 'NSE',
  banknifty: 'NSE',
  sensex: 'BSE',
};

const quoteCache = new Map();

function getGrowwRequestUrl(path, baseUrl = '') {
  if (!baseUrl) return path;
  return `${normalizeYahooProxyUrl(baseUrl)}/api/groww${path.slice('/api/groww'.length)}`;
}

export async function fetchGrowwOptionQuote(contract, options = {}) {
  const exchange = INDEX_EXCHANGES[contract?.indexId];
  if (!exchange || !contract?.symbol) throw new Error('Unsupported Groww option contract.');

  const url = `/api/groww/stocks_fo_data/v1/tr_live_prices/exchange/${exchange}/segment/FNO/${encodeURIComponent(contract.symbol)}/latest`;
  const cached = quoteCache.get(url);
  if (!options.force && cached && cached.expiresAt > Date.now()) return cached.data;

  const response = await fetch(getGrowwRequestUrl(url, options.baseUrl), {
    signal: options.signal,
    cache: 'no-store',
  });
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`Groww option quote returned a non-JSON response (HTTP ${response.status}).`, { cause: error });
  }
  if (!response.ok) {
    throw new Error(payload?.message || `Groww option quote request failed (HTTP ${response.status}).`);
  }
  const ltp = Number(payload?.ltp);
  if (!Number.isFinite(ltp) || ltp < 0) {
    throw new Error('Groww did not return a valid option premium for this contract.');
  }

  const timestamp = Number(payload.tsInMillis);
  const quote = {
    ltp,
    lotSize: getOptionLotSize(contract.indexId),
    timestamp: Number.isFinite(timestamp) ? timestamp * (timestamp < 1e12 ? 1000 : 1) : null,
  };
  quoteCache.set(url, { data: quote, expiresAt: Date.now() + 5_000 });
  return quote;
}

export function clearGrowwQuoteCache() {
  quoteCache.clear();
}
