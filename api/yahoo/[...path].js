const YAHOO_API_ORIGIN = 'https://query1.finance.yahoo.com';
const YAHOO_ROUTE_PREFIX = '/api/yahoo';

export function buildYahooTargetUrl(requestUrl) {
  const request = new URL(requestUrl, 'https://vercel.local');
  if (!request.pathname.startsWith(`${YAHOO_ROUTE_PREFIX}/`)) {
    throw new Error('Unsupported Yahoo proxy path.');
  }

  const yahooPath = request.pathname.slice(YAHOO_ROUTE_PREFIX.length);
  if (!/^\/v1\/finance\/search\/?$|^\/v8\/finance\/chart\/.+/.test(yahooPath)) {
    throw new Error('Unsupported Yahoo Finance endpoint.');
  }

  return new URL(`${yahooPath}${request.search}`, YAHOO_API_ORIGIN);
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.statusCode = 405;
    response.end('Method not allowed');
    return;
  }

  let targetUrl;
  try {
    targetUrl = buildYahooTargetUrl(request.url || '/');
  } catch (error) {
    response.statusCode = 400;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ error: error.message }));
    return;
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    response.statusCode = upstream.status;
    response.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.end(await upstream.text());
  } catch (error) {
    console.error('Yahoo Finance proxy request failed:', error);
    response.statusCode = 502;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ error: 'Yahoo Finance is temporarily unavailable.' }));
  }
}
