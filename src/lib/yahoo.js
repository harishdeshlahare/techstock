export const DEFAULT_YAHOO_API_BASE_URL = import.meta.env.VITE_YAHOO_API_BASE_URL || '';

const requestCache = new Map();
const intervalSeconds = {
  '1min': 60,
  '2min': 120,
  '5min': 300,
  '15min': 900,
  '30min': 1800,
  '1h': 3600,
  '90min': 5400,
};

export function normalizeYahooProxyUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  if (!normalized) return '';

  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error('Enter a complete proxy server URL, for example https://your-server.com.');
  }

  const localDevelopmentHost = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(localDevelopmentHost && url.protocol === 'http:')) {
    throw new Error('Use HTTPS for the proxy URL. HTTP is allowed only for localhost testing.');
  }
  if (url.search || url.hash) {
    throw new Error('The proxy URL must not include a query string or fragment.');
  }
  if (url.hostname === 'yahoo.com' || url.hostname.endsWith('.yahoo.com')) {
    throw new Error('Yahoo Finance cannot be used as the mobile proxy URL. Enter your own HTTPS proxy server; direct Yahoo requests are not supported.');
  }

  url.pathname = url.pathname.replace(/\/api\/yahoo\/?$/, '').replace(/\/+$/, '');
  return url.toString().replace(/\/+$/, '');
}

function requestUrl(path, baseUrl) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!baseUrl) return normalizedPath;
  const apiPrefix = '/api/yahoo';
  const suffix = normalizedPath.startsWith(apiPrefix)
    ? normalizedPath.slice(apiPrefix.length)
    : normalizedPath;
  const base = normalizeYahooProxyUrl(baseUrl);
  const proxyBase = `${base}${apiPrefix}`;
  return `${proxyBase}${suffix}`;
}

export async function fetchYahooJson(path, baseUrl = '', options = {}) {
  const url = requestUrl(path, baseUrl);
  const ttl = Number.isFinite(options.ttl) ? Math.max(0, options.ttl) : 10_000;
  const cached = requestCache.get(url);
  if (!options.force && cached && cached.expiresAt > Date.now()) return cached.data;

  const response = await fetch(url, { signal: options.signal, cache: 'no-store' });
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`Yahoo Finance returned an invalid response (HTTP ${response.status}).`, { cause: error });
  }
  if (!response.ok) {
    const detail = payload?.chart?.error?.description || payload?.finance?.error?.description;
    throw new Error(`${detail || 'Yahoo Finance request failed'} (HTTP ${response.status}).`);
  }
  if (ttl > 0) requestCache.set(url, { data: payload, expiresAt: Date.now() + ttl });
  return payload;
}

export function getYahooSymbol(stock, market) {
  const symbol = String(stock?.symbol || '').trim().toUpperCase();
  if (!symbol) return '';
  if (symbol.includes('.')) return symbol;
  if (stock?.exchange === 'NSE' || (market === 'India' && stock?.exchange !== 'BSE')) return `${symbol}.NS`;
  if (stock?.exchange === 'BSE') return `${symbol}.BO`;
  return symbol;
}

export function parseYahooCandles(result) {
  const timestamps = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  if (!Array.isArray(timestamps) || !quote) return [];
  const { open = [], high = [], low = [], close = [], volume = [] } = quote;
  return timestamps.flatMap((time, index) => {
    const candle = {
      time,
      open: open[index],
      high: high[index],
      low: low[index],
      close: close[index],
      volume: volume[index] ?? 0,
    };
    if (!Number.isFinite(time) || ![candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)) return [];
    return [candle];
  });
}

function dateParts(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(new Date(timestamp * 1000));
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function getWeekKey(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

export function getClosedCandles(candles, result, interval, now = Date.now()) {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const timeZone = result?.meta?.exchangeTimezoneName || 'UTC';
  const currentPeriod = result?.meta?.currentTradingPeriod?.regular;
  const regularClose = Number(currentPeriod?.close);
  const nowSeconds = now / 1000;
  const currentParts = dateParts(nowSeconds, timeZone);
  const todayKey = `${currentParts.year}-${currentParts.month}-${currentParts.day}`;
  const weeklyFinishedToday = currentParts.weekday === 'Fri' && Number.isFinite(regularClose) && nowSeconds >= regularClose;
  const nextTradingDate = new Date(Date.UTC(
    Number(currentParts.year),
    Number(currentParts.month) - 1,
    Number(currentParts.day) + 1,
  ));
  while (nextTradingDate.getUTCDay() === 0 || nextTradingDate.getUTCDay() === 6) {
    nextTradingDate.setUTCDate(nextTradingDate.getUTCDate() + 1);
  }
  const monthlyFinishedToday = Number.isFinite(regularClose) && nowSeconds >= regularClose &&
    nextTradingDate.getUTCMonth() !== Number(currentParts.month) - 1;

  if (intervalSeconds[interval]) {
    const duration = intervalSeconds[interval];
    const regularOpen = Number(currentPeriod?.open);
    const regularCloseTime = Number(currentPeriod?.close);
    return candles.filter((candle) => (
      Number.isFinite(candle.time) &&
      candle.time + duration <= nowSeconds &&
      (!Number.isFinite(regularCloseTime) ||
        candle.time < regularOpen ||
        candle.time >= regularCloseTime ||
        candle.time + duration <= regularCloseTime)
    ));
  }

  if (interval === '1day') {
    const sessionOngoing = Number.isFinite(regularClose) && nowSeconds < regularClose;
    return candles.filter((candle) => {
      const parts = dateParts(candle.time, timeZone);
      const key = `${parts.year}-${parts.month}-${parts.day}`;
      return !(sessionOngoing && key === todayKey);
    });
  }

  if (interval === '1week') {
    const currentWeek = getWeekKey(currentParts.year, currentParts.month, currentParts.day);
    return candles.filter((candle) => {
      const parts = dateParts(candle.time, timeZone);
      const sameWeek = getWeekKey(parts.year, parts.month, parts.day) === currentWeek;
      return !(sameWeek && !weeklyFinishedToday);
    });
  }

  if (interval === '1month') {
    return candles.filter((candle) => {
      const parts = dateParts(candle.time, timeZone);
      const sameMonth = parts.year === currentParts.year && parts.month === currentParts.month;
      return !(sameMonth && !monthlyFinishedToday);
    });
  }

  return candles;
}
