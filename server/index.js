import express from 'express';

const app = express();
const port = Number(process.env.PORT || 4000);
const upstreamOrigin = 'https://query1.finance.yahoo.com';
const cache = new Map();
const inflight = new Map();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

function getTtl(req) {
  if (/\/v7\/finance\/quote|\/v6\/finance\/quote/.test(req.path) || req.path.includes('/quote')) return 60_000;
  if (req.path.includes('/chart/') && ['1m', '2m', '5m', '15m', '30m', '60m', '90m'].includes(req.query.interval)) return 10_000;
  if (req.path.includes('/chart/')) return 300_000;
  return 60_000;
}

async function fetchUpstream(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'application/json,text/plain,*/*',
    },
  });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  return { status: response.status, body };
}

app.get('/api/yahoo/*', async (req, res) => {
  const upstreamUrl = `${upstreamOrigin}${req.originalUrl.replace(/^\/api\/yahoo/, '')}`;
  const ttl = getTtl(req);
  const cached = cache.get(upstreamUrl);
  if (cached && cached.expiresAt > Date.now()) {
    res.status(cached.status).json(cached.body);
    return;
  }

  let request = inflight.get(upstreamUrl);
  if (!request) {
    request = (async () => {
      const result = await fetchUpstream(upstreamUrl);
      cache.set(upstreamUrl, { ...result, expiresAt: Date.now() + ttl });
      return result;
    })();
    inflight.set(upstreamUrl, request);
    request.finally(() => inflight.delete(upstreamUrl));
  }

  try {
    const result = await request;
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(502).json({ error: 'Yahoo Finance request failed', description: error?.message || 'Upstream unavailable' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(port, () => {
  console.log(`Techstock Yahoo proxy listening on http://localhost:${port}`);
});
