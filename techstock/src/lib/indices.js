const INDIAN_INDICES = [
  {
    id: 'nifty',
    name: 'NIFTY 50',
    exchange: 'NSE',
    symbol: 'NIFTY',
    yahooSymbol: '^NSEI',
    country: 'India',
    currency: 'INR',
    instrument_name: 'NIFTY 50',
    instrumentType: 'INDEX',
    searchTerms: ['nifty', 'nifty50', 'nifty 50', 'nsei'],
    url: 'https://www.nseindia.com/option-chain',
  },
  {
    id: 'banknifty',
    name: 'NIFTY BANK',
    exchange: 'NSE',
    symbol: 'BANKNIFTY',
    yahooSymbol: '^NSEBANK',
    country: 'India',
    currency: 'INR',
    instrument_name: 'NIFTY BANK (Bank Nifty)',
    instrumentType: 'INDEX',
    searchTerms: ['nifty', 'banknifty', 'bank nifty', 'niftybank', 'nifty bank', 'nsebank'],
    url: 'https://www.nseindia.com/option-chain',
  },
  {
    id: 'sensex',
    name: 'SENSEX',
    exchange: 'BSE',
    symbol: 'SENSEX',
    yahooSymbol: '^BSESN',
    country: 'India',
    currency: 'INR',
    instrument_name: 'BSE SENSEX',
    instrumentType: 'INDEX',
    searchTerms: ['sensex', 'bsesn'],
    url: 'https://www.bseindia.com/markets/Derivatives/DeriReports/OptionChain.html',
  },
];

function normalizeSearchTerm(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function searchIndianIndices(query) {
  const normalizedQuery = normalizeSearchTerm(String(query || '').trim());
  if (normalizedQuery.length < 2) return [];

  return INDIAN_INDICES
    .filter((index) => index.searchTerms.some((term) => normalizeSearchTerm(term).includes(normalizedQuery)))
    .map(({ searchTerms: _searchTerms, ...index }) => index);
}

export { INDIAN_INDICES };
