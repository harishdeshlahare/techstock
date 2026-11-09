import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, createSeriesMarkers, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
import { calculateATR, calculateEMA, calculateRSI, calculateVWAP, getTrend } from './lib/indicators.js';
import { buildTradeLevels, findSupportResistance } from './lib/levels.js';
import { backtestSignals } from './lib/backtest.js';
import { updateTradeHistory } from './lib/tradeHistory.js';
import { getMarketStatus } from './lib/marketStatus.js';
import { DEFAULT_YAHOO_API_BASE_URL, fetchYahooJson, getClosedCandles, getYahooSymbol, normalizeYahooProxyUrl, parseYahooCandles } from './lib/yahoo.js';
import { TRADING_THRESHOLDS } from './lib/config/costs.js';
import ChartView from './components/ChartView.jsx';
import TradeReportPanel from './components/TradeReportPanel.jsx';
import TradeHistoryPanel from './components/TradeHistoryPanel.jsx';
import DashboardHome from './components/DashboardHome.jsx';
import MarketInspector from './components/MarketInspector.jsx';
import PaperTradingPanel from './components/PaperTradingPanel.jsx';
import { WorkspaceSidebar, WorkspaceTabs } from './components/WorkspaceNavigation.jsx';
import { useScanner } from './hooks/useScanner.js';
import { useTradeHistory } from './hooks/useTradeHistory.js';
import { useWatchlists } from './hooks/useWatchlists.js';
const AVAILABLE_THEMES = ['dark', 'light', 'ocean'];

const DEFAULT_WATCHLISTS = {
  India: [
    { symbol: 'RELIANCE', exchange: 'NSE', country: 'India', currency: 'INR', instrument_name: 'Reliance Industries Limited' },
    { symbol: 'TCS', exchange: 'NSE', country: 'India', currency: 'INR', instrument_name: 'Tata Consultancy Services Limited' },
    { symbol: 'INFY', exchange: 'NSE', country: 'India', currency: 'INR', instrument_name: 'Infosys Limited' },
  ],
  'United States': [
    { symbol: 'AAPL', exchange: 'NASDAQ', country: 'United States', currency: 'USD', instrument_name: 'Apple Inc.' },
    { symbol: 'MSFT', exchange: 'NASDAQ', country: 'United States', currency: 'USD', instrument_name: 'Microsoft Corporation' },
    { symbol: 'NVDA', exchange: 'NASDAQ', country: 'United States', currency: 'USD', instrument_name: 'NVIDIA Corporation' },
  ],
};

const INTRADAY_UNIVERSE = {
  India: [
    { symbol: 'RELIANCE', exchange: 'NSE', country: 'India', currency: 'INR', instrument_name: 'Reliance Industries' },
    { symbol: 'TCS', exchange: 'NSE', country: 'India', currency: 'INR', instrument_name: 'Tata Consultancy Services' },
    { symbol: 'INFY', exchange: 'NSE', country: 'India', currency: 'INR', instrument_name: 'Infosys' },
    { symbol: 'HDFCBANK', exchange: 'NSE', country: 'India', currency: 'INR', instrument_name: 'HDFC Bank' },
    { symbol: 'ICICIBANK', exchange: 'NSE', country: 'India', currency: 'INR', instrument_name: 'ICICI Bank' },
    { symbol: 'SBIN', exchange: 'NSE', country: 'India', currency: 'INR', instrument_name: 'State Bank of India' },
    { symbol: 'BHARTIARTL', exchange: 'NSE', country: 'India', currency: 'INR', instrument_name: 'Bharti Airtel' },
    { symbol: 'ITC', exchange: 'NSE', country: 'India', currency: 'INR', instrument_name: 'ITC' },
    { symbol: 'LT', exchange: 'NSE', country: 'India', currency: 'INR', instrument_name: 'Larsen & Toubro' },
    { symbol: 'AXISBANK', exchange: 'NSE', country: 'India', currency: 'INR', instrument_name: 'Axis Bank' },
  ],
  'United States': [
    { symbol: 'AAPL', exchange: 'NASDAQ', country: 'United States', currency: 'USD', instrument_name: 'Apple' },
    { symbol: 'MSFT', exchange: 'NASDAQ', country: 'United States', currency: 'USD', instrument_name: 'Microsoft' },
    { symbol: 'NVDA', exchange: 'NASDAQ', country: 'United States', currency: 'USD', instrument_name: 'NVIDIA' },
    { symbol: 'AMZN', exchange: 'NASDAQ', country: 'United States', currency: 'USD', instrument_name: 'Amazon' },
    { symbol: 'META', exchange: 'NASDAQ', country: 'United States', currency: 'USD', instrument_name: 'Meta Platforms' },
    { symbol: 'TSLA', exchange: 'NASDAQ', country: 'United States', currency: 'USD', instrument_name: 'Tesla' },
    { symbol: 'GOOGL', exchange: 'NASDAQ', country: 'United States', currency: 'USD', instrument_name: 'Alphabet' },
    { symbol: 'AMD', exchange: 'NASDAQ', country: 'United States', currency: 'USD', instrument_name: 'AMD' },
  ],
};

const SCANNER_THRESHOLDS = {
  minAverageVolume: 500000,
  relativeVolume: 1.2,
  atrPercent: 1.2,
  rsiMin: 40,
  rsiMax: 65,
};

const INDEX_OPTIONS = [
  { id: 'nifty', name: 'NIFTY 50', exchange: 'NSE', symbol: 'NIFTY', url: 'https://www.nseindia.com/option-chain' },
  { id: 'banknifty', name: 'NIFTY BANK', exchange: 'NSE', symbol: 'BANKNIFTY', url: 'https://www.nseindia.com/option-chain' },
  { id: 'sensex', name: 'SENSEX', exchange: 'BSE', symbol: 'SENSEX', url: 'https://www.bseindia.com/markets/Derivatives/DeriReports/OptionChain.html' },
];

function loadCustomScannerStocks() {
  try {
    const saved = localStorage.getItem('techstock-intraday-stocks');
    if (!saved) return { India: [], 'United States': [] };
    const parsed = JSON.parse(saved);
    return {
      India: Array.isArray(parsed.India) ? parsed.India : [],
      'United States': Array.isArray(parsed['United States']) ? parsed['United States'] : [],
    };
  } catch (error) {
    console.error('Unable to load custom intraday stocks.', error);
    return { India: [], 'United States': [] };
  }
}

function loadPreference(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? fallback : saved;
  } catch (error) {
    console.error(`Unable to load preference "${key}".`, error);
    return fallback;
  }
}

function getDefaultStock(market) {
  return DEFAULT_WATCHLISTS[market][0];
}

function loadLastMarket() {
  const savedMarket = loadPreference('techstock-last-market', 'India');
  return Object.prototype.hasOwnProperty.call(DEFAULT_WATCHLISTS, savedMarket) ? savedMarket : 'India';
}

function loadLastStock(market) {
  try {
    const saved = localStorage.getItem('techstock-last-stock');
    if (!saved) return getDefaultStock(market);
    const parsed = JSON.parse(saved);
    if (parsed.market !== market || !parsed.stock?.symbol || !parsed.stock?.exchange) {
      return getDefaultStock(market);
    }
    return parsed.stock;
  } catch (error) {
    console.error('Unable to load the last selected stock.', error);
    return getDefaultStock(market);
  }
}

function themeColor(name) {
  const shell = document.querySelector('.app-shell');
  const source = shell || document.documentElement;
  return getComputedStyle(source).getPropertyValue(name).trim();
}

function formatExchangeTime(time, timeZone) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: '2-digit',
  }).format(new Date(Number(time) * 1000));
}

function buildTradeMarkers(trades, candles) {
  const candleTimes = new Set(candles.map((candle) => candle.time));
  const markers = [];
  trades.forEach((trade) => {
    if (Number.isFinite(trade.entryHitAt) && candleTimes.has(trade.entryHitAt)) {
      markers.push({
        time: trade.entryHitAt,
        position: trade.direction === 'Short' ? 'aboveBar' : 'belowBar',
        color: '--up',
        shape: trade.direction === 'Short' ? 'arrowDown' : 'arrowUp',
        text: 'Entry',
      });
    }
    if (Number.isFinite(trade.target1HitAt) && candleTimes.has(trade.target1HitAt)) {
      markers.push({
        time: trade.target1HitAt,
        position: trade.direction === 'Short' ? 'belowBar' : 'aboveBar',
        color: '--accent',
        shape: 'circle',
        text: 'T1',
      });
    }
    if (!Number.isFinite(trade.hitAt) || !candleTimes.has(trade.hitAt)) return;
    const isStop = ['stop', 'breakeven', 'ambiguous'].includes(trade.outcome);
    const belowBar = trade.direction === 'Short' ? !isStop : isStop;
    markers.push({
      time: trade.hitAt,
      position: belowBar ? 'belowBar' : 'aboveBar',
      color: trade.outcome === 'ambiguous' ? '--warn' : isStop ? '--down' : '--up',
      shape: 'circle',
      text: trade.outcome === 'breakeven' ? 'BE' : trade.outcome === 'ambiguous' ? '?' : isStop ? 'SL' : 'T2',
    });
  });
  return markers;
}

function buildAllMarkers(signalMarkers, trades, candles) {
  const orderedMarkers = [
    ...signalMarkers,
    ...buildTradeMarkers(trades, candles),
  ].sort((first, second) => first.time - second.time);
  return orderedMarkers.reduce((result, marker) => {
    const previous = result.at(-1);
    if (previous?.time === marker.time) {
      previous.text = [previous.text, marker.text].filter(Boolean).join(' · ');
    } else {
      result.push({ ...marker });
    }
    return result;
  }, []);
}

function resolveMarkerColor(marker) {
  if (marker.color?.startsWith('--')) return themeColor(marker.color);
  return marker.position === 'belowBar' ? themeColor('--up') : themeColor('--down');
}

function App() {
  const chartContainerRef = useRef();
  const chartStateRef = useRef(null);
  const chartLoadGenerationRef = useRef(0);
  const watchlistLoadGenerationRef = useRef(0);
  const latestChartDataRef = useRef(null);
  const fitContentKeyRef = useRef('');
  const forceRefreshRef = useRef(false);
  const latestTradeHistoryRef = useRef([]);
  const symbolMarketKeyRef = useRef('');
  const signalCacheRef = useRef(null);
  const priceLinesRef = useRef([]);
  const markerPluginRef = useRef(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [market, setMarket] = useState(loadLastMarket);
  const [watchlists, setWatchlists] = useWatchlists(DEFAULT_WATCHLISTS);
  const [selectedStock, setSelectedStock] = useState(() => loadLastStock(market));
  const [searchQuery, setSearchQuery] = useState(() => loadLastStock(market).symbol);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [timeframe, setTimeframe] = useState('1day');
  const [loading, setLoading] = useState(false);
  const [chartError, setChartError] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [investment, setInvestment] = useState('10000');
  const [capital, setCapital] = useState('10000');
  const [riskPercent, setRiskPercent] = useState('1');
  const [sizingMode, setSizingMode] = useState('capital');
  const [brokeragePerOrder, setBrokeragePerOrder] = useState('0');
  const [slippagePercent, setSlippagePercent] = useState('0');
  const [moveStopToBreakeven, setMoveStopToBreakeven] = useState(false);
  const [tradeDirection, setTradeDirection] = useState('Long');
  const [activeTab, setActiveTab] = useState(() => {
    const saved = loadPreference('techstock-workspace-tab', 'home');
    return ['home', 'chart', 'ideas', 'report', 'history', 'paper', 'options'].includes(saved) ? saved : 'home';
  });
  const [showPreferences, setShowPreferences] = useState(false);
  const [tradeHistory, setTradeHistory] = useTradeHistory();
  const [historyMessage, setHistoryMessage] = useState('');
  const [theme, setTheme] = useState(() => {
    const savedTheme = loadPreference('techstock-theme', 'dark');
    return AVAILABLE_THEMES.includes(savedTheme) ? savedTheme : 'dark';
  });
  const [yahooApiBaseUrl, setYahooApiBaseUrl] = useState(
    () => loadPreference('techstock-yahoo-api-base-url', DEFAULT_YAHOO_API_BASE_URL)
      .replace(/\/api\/yahoo\/?$/, ''),
  );
  const [apiBaseDraft, setApiBaseDraft] = useState(yahooApiBaseUrl);
  const [preferencesMessage, setPreferencesMessage] = useState('');
  const [apiTestStatus, setApiTestStatus] = useState('');
  const [intradayCandidates, setIntradayCandidates] = useState([]);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerProgress, setScannerProgress] = useState('');
  const [scannerError, setScannerError] = useState('');
  const [customScannerStocks, setCustomScannerStocks] = useState(loadCustomScannerStocks);
  const [selectedOptionsIndex, setSelectedOptionsIndex] = useState('nifty');
  const [scannerSort, setScannerSort] = useState('score');
  const [showOnlyQualified, setShowOnlyQualified] = useState(false);
  const [backtestResult, setBacktestResult] = useState(null);
  const crosshairLegendRef = useRef(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [marketTradingPeriod, setMarketTradingPeriod] = useState(null);
  const [marketClock, setMarketClock] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [autoRefreshSeconds, setAutoRefreshSeconds] = useState(30);
  const [refreshKey, setRefreshKey] = useState(0);
  const [watchlistQuotes, setWatchlistQuotes] = useState({});
  const watchlistQuoteCacheRef = useRef(new Map());
  const { startScan, cancelScan } = useScanner(market, activeTab);
  const symbolMarketKey = `${getYahooSymbol(selectedStock, market)}|${market}`;
  const activeSetupDirection = analysis?.setupDirection || tradeDirection;
  const verdictTradeLevels = useMemo(() => (
    analysis
      ? buildTradeLevels({
        direction: activeSetupDirection,
        entry: Number(analysis.price),
        atr: Number(analysis.atr || 0),
        supports: analysis.supports,
        resistances: analysis.resistances,
      })
      : null
  ), [analysis, activeSetupDirection]);

  // Toggles
  const [showVolume, setShowVolume] = useState(true);
  const [showSR, setShowSR] = useState(true);

  useEffect(() => {
    latestTradeHistoryRef.current = tradeHistory;
  }, [tradeHistory]);

  useEffect(() => {
    if (!autoRefresh || activeTab !== 'chart') return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        forceRefreshRef.current = true;
        setRefreshKey((current) => current + 1);
      }
    }, autoRefreshSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, autoRefreshSeconds, activeTab]);

  useEffect(() => {
    try {
      localStorage.setItem('techstock-last-market', market);
      localStorage.setItem('techstock-last-stock', JSON.stringify({ market, stock: selectedStock }));
    } catch (error) {
      console.error('Unable to save the last selected stock.', error);
    }
  }, [market, selectedStock]);

  useEffect(() => {
    try {
      localStorage.setItem('techstock-workspace-tab', activeTab);
    } catch (error) {
      console.error('Unable to save the selected workspace page.', error);
    }
  }, [activeTab]);

  useEffect(() => {
    try {
      localStorage.setItem('techstock-intraday-stocks', JSON.stringify(customScannerStocks));
    } catch (error) {
      console.error('Unable to save custom intraday stocks.', error);
    }
  }, [customScannerStocks]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      themeColor('--bg'),
    );
    try {
      localStorage.setItem('techstock-theme', theme);
    } catch (error) {
      console.error('Unable to save theme preference.', error);
    }
  }, [theme]);

  function handleLogin(event) {
    event.preventDefault();
    if (loginId.trim().toLowerCase() === 'hd' && loginPassword === 'hd') {
      setLoginError('');
      setLoginPassword('');
      setIsAuthenticated(true);
      return;
    }

    setLoginError('That ID and password do not match. Please try again.');
  }

  function handleLogout() {
    setIsAuthenticated(false);
    setLoginId('');
    setLoginPassword('');
    setLoginError('');
  }

  function savePreferences() {
    let normalizedApiUrl;
    try {
      normalizedApiUrl = normalizeYahooProxyUrl(apiBaseDraft);
    } catch (error) {
      setPreferencesMessage(error.message);
      return;
    }

    try {
      localStorage.setItem('techstock-yahoo-api-base-url', normalizedApiUrl);
      setYahooApiBaseUrl(normalizedApiUrl);
      setApiBaseDraft(normalizedApiUrl);
      setPreferencesMessage('Preferences saved on this device.');
      setApiTestStatus('');
      setChartError('');
      setSearchError('');
    } catch (error) {
      console.error('Unable to save Yahoo API proxy URL.', error);
      setPreferencesMessage('Could not save preferences in this browser.');
    }
  }

  async function testYahooConnection() {
    setApiTestStatus('Testing proxy connection…');
    try {
      const params = new URLSearchParams({ q: 'AAPL', quotesCount: '1', newsCount: '0' });
      const data = await fetchYahooJson(`/api/yahoo/v1/finance/search?${params}`, yahooApiBaseUrl);
      if (data.finance?.error) {
        throw new Error(data.finance.error.description || 'The proxy returned a Yahoo Finance error.');
      }
      setApiTestStatus('Proxy connected. Yahoo Finance returned a response.');
    } catch (error) {
      console.error('Yahoo API proxy connection test failed.', error);
      setApiTestStatus(error.message || 'Could not connect to the Yahoo API proxy.');
    }
  }

  async function searchStocks() {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchError('Enter a company name or ticker symbol to search.');
      return;
    }

    setSearching(true);
    setSearchError('');
    setSearchResults([]);

    try {
      const params = new URLSearchParams({ q: query, quotesCount: '30', newsCount: '0' });
      const data = await fetchYahooJson(`/api/yahoo/v1/finance/search?${params}`, yahooApiBaseUrl);

      if (data.finance?.error) {
        throw new Error(data.finance?.error?.description || 'Yahoo Finance symbol search failed. Please try again.');
      }

      const results = (data.quotes || [])
        .filter((quote) => {
          if (quote.quoteType !== 'EQUITY') return false;
          const symbol = (quote.symbol || '').toUpperCase();
          const exchange = (quote.exchange || '').toUpperCase();
          return market === 'India'
            ? /\.(NS|BO)$/.test(symbol)
            : !/\.(NS|BO)$/.test(symbol) && ['NMS', 'NAS', 'NYQ', 'ASE', 'PCX', 'NGM', 'NCM', 'BTS'].includes(exchange);
        })
        .map((quote) => {
          const yahooSymbol = quote.symbol;
          const symbol = yahooSymbol.replace(/\.(NS|BO)$/i, '');
          return {
            symbol,
            yahooSymbol,
            exchange: /\.BO$/i.test(yahooSymbol) ? 'BSE' : /\.NS$/i.test(yahooSymbol) ? 'NSE' : quote.exchange,
            country: market === 'India' ? 'India' : 'United States',
            currency: quote.currency || (market === 'India' ? 'INR' : 'USD'),
            instrument_name: quote.shortname || quote.longname || yahooSymbol,
          };
        });

      setSearchResults(results);
      if (results.length === 0) {
        setSearchError(`No ${market} stocks found on Yahoo Finance. Try a ticker symbol or company name.`);
      }
    } catch (error) {
      if (!error.message?.includes('(HTTP 429)')) console.error(error);
      setSearchError(error.name === 'TypeError' && /fetch/i.test(error.message)
        ? 'Could not reach Yahoo Finance. Check your internet connection and confirm the Vite development server is running.'
        : error.message || 'Unable to search stocks.');
    } finally {
      setSearching(false);
    }
  }

  async function scanIntradayStocks() {
    const isCurrentScan = startScan();
    setScannerLoading(true);
    setScannerError('');
    setIntradayCandidates([]);
    const universe = [...INTRADAY_UNIVERSE[market], ...(customScannerStocks[market] || [])]
      .filter((stock, index, stocks) => (
        stocks.findIndex((item) => getYahooSymbol(item, market) === getYahooSymbol(stock, market)) === index
      ));
    const candidates = [];

    let rateLimited = false;
    for (let index = 0; index < universe.length; index += 1) {
      if (!isCurrentScan()) return;
      const stock = universe[index];
      setScannerProgress(`Checking ${stock.symbol} (${index + 1}/${universe.length})`);
      const yahooSymbol = getYahooSymbol(stock, market);
      try {
        const params = new URLSearchParams({ interval: '1d', range: '6mo', events: 'div,splits' });
        const data = await fetchYahooJson(`/api/yahoo/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?${params}`, yahooApiBaseUrl);
        if (!isCurrentScan()) return;
        const result = data.chart?.result?.[0];
        const candles = parseYahooCandles(result);
        const completedCandles = getClosedCandles(candles, result, '1day');
        if (completedCandles.length < 63) {
          candidates.push({ ...stock, yahooSymbol, status: 'skipped', skipReason: 'Fewer than 63 completed daily candles.' });
          continue;
        }

        const close = completedCandles.at(-1).close;
        const volumes = completedCandles.slice(-21, -1).map((candle) => candle.volume).filter(Number.isFinite);
        const averageVolume = volumes.length ? volumes.reduce((sum, volume) => sum + volume, 0) / volumes.length : 0;
        const relativeVolume = averageVolume ? completedCandles.at(-1).volume / averageVolume : 0;
        const timezone = result?.meta?.exchangeTimezoneName || 'UTC';
        const atr = calculateATR(completedCandles, 14, { interval: '1day', timeZone: timezone }).at(-1)?.value || 0;
        const atrPercent = close ? (atr / close) * 100 : 0;
        const rsi = calculateRSI(completedCandles, 14).at(-1)?.value || 50;
        const trend = getTrend(completedCandles, { timeZone: timezone });
        const levels = findSupportResistance(completedCandles, 40, { interval: '1day', timeZone: timezone });
        const nearestSupport = levels.supports[0];
        const nearestResistance = levels.resistances[0];
        const nearSupportLevel = [nearestSupport].some((level) => (
          level && Math.abs(close - level.price) <= Math.max(atr * 0.5, close * 0.002)
        ));
        const nearResistanceLevel = [nearestResistance].some((level) => (
          level && Math.abs(close - level.price) <= Math.max(atr * 0.5, close * 0.002)
        ));
        const directionalRsi = trend === 'Bullish' ? rsi >= 50 && rsi <= 70 : trend === 'Bearish' && rsi >= 30 && rsi <= 50;
        const directionalPrice = trend === 'Bullish'
          ? close > calculateEMA(completedCandles, 21).at(-1)?.value
          : trend === 'Bearish' && close < calculateEMA(completedCandles, 21).at(-1)?.value;
        const checks = {
          liquid: averageVolume >= SCANNER_THRESHOLDS.minAverageVolume,
          volume: relativeVolume >= SCANNER_THRESHOLDS.relativeVolume,
          volatility: atrPercent >= SCANNER_THRESHOLDS.atrPercent,
          rsi: Boolean(directionalRsi),
          trend: ['Bullish', 'Bearish'].includes(trend) && Boolean(directionalPrice),
          level: trend === 'Bullish' ? nearSupportLevel : trend === 'Bearish' && nearResistanceLevel,
        };
        const score = Math.round(
          Number(checks.liquid) * 10 + Number(checks.volume) * 25 +
          Number(checks.volatility) * 20 + Number(checks.rsi) * 15 +
          Number(checks.trend) * 15 + Number(checks.level) * 15
        );
        candidates.push({
          ...stock, yahooSymbol, price: close, relativeVolume, averageVolume, atrPercent, rsi,
          trend, direction: trend, nearestSupport, nearestResistance, nearLevel: checks.level, checks, score,
          qualified: Object.values(checks).every(Boolean),
        });
      } catch (error) {
        if (!isCurrentScan()) return;
        if (error.message?.includes('(HTTP 429)')) {
          rateLimited = true;
          setScannerError(`Rate limit reached. Showing partial results. ${error.message}`);
          break;
        }
        candidates.push({
          ...stock,
          yahooSymbol,
          status: 'skipped',
          skipReason: error.message || 'Yahoo request failed.',
        });
      }

      if (index < universe.length - 1 && isCurrentScan()) {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
    }

    if (!isCurrentScan()) return;
    candidates.sort((a, b) => (b.score || -1) - (a.score || -1));
    setIntradayCandidates(candidates);
    if (!candidates.some((candidate) => candidate.qualified) && !rateLimited) {
      setScannerError(candidates.length ? '' : 'Yahoo returned no usable daily candles for this market.');
    }
    setScannerLoading(false);
    setScannerProgress('');
  }

  function addToIntradayList(stock) {
    setCustomScannerStocks((current) => {
      const currentList = current[market] || [];
      const yahooSymbol = getYahooSymbol(stock, market);
      if (currentList.some((item) => getYahooSymbol(item, market) === yahooSymbol)) return current;
      return { ...current, [market]: [...currentList, stock] };
    });
  }

  function removeFromIntradayList(stock) {
    setCustomScannerStocks((current) => ({
      ...current,
      [market]: (current[market] || []).filter(
        (item) => getYahooSymbol(item, market) !== getYahooSymbol(stock, market),
      ),
    }));
  }

  useEffect(() => {
    if (!isAuthenticated || activeTab !== 'chart' || !chartContainerRef.current) return undefined;
    fitContentKeyRef.current = '';
    const palette = {
      background: themeColor('--surface'),
      foreground: themeColor('--text'),
      grid: themeColor('--border'),
      up: themeColor('--up'),
      down: themeColor('--down'),
      accent: themeColor('--accent'),
      warn: themeColor('--warn'),
      ema9: themeColor('--ema9'),
      ema21: themeColor('--ema21'),
      vwap: themeColor('--vwap'),
      rsi: themeColor('--rsi'),
    };
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 620,
      layout: { background: { color: palette.background }, textColor: palette.foreground },
      grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: palette.grid },
      timeScale: { borderColor: palette.grid, timeVisible: true },
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: palette.up, downColor: palette.down, borderVisible: false,
      wickUpColor: palette.up, wickDownColor: palette.down,
    });
    const ema9Series = chart.addSeries(LineSeries, { color: palette.ema9, lineWidth: 2, title: 'EMA 9' });
    const ema21Series = chart.addSeries(LineSeries, { color: palette.ema21, lineWidth: 2, title: 'EMA 21' });
    const vwapSeries = chart.addSeries(LineSeries, { color: palette.vwap, lineWidth: 2, title: 'VWAP' });
    chart.addPane();
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: palette.up, priceFormat: { type: 'volume' }, priceScaleId: '',
    }, 1);
    volumeSeries.applyOptions({ visible: true });
    chart.addPane();
    const rsiSeries = chart.addSeries(LineSeries, { color: palette.rsi, lineWidth: 2 }, 2);
    rsiSeries.createPriceLine({ price: 70, color: palette.down, lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
    rsiSeries.createPriceLine({ price: 30, color: palette.up, lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
    chart.panes().forEach((pane, index) => pane.setStretchFactor([0.6, 0.15, 0.25][index] || 0.25));
    const markerPlugin = createSeriesMarkers(candleSeries, []);
    const series = { chart, candleSeries, ema9Series, ema21Series, vwapSeries, volumeSeries, rsiSeries };
    chartStateRef.current = series;
    markerPluginRef.current = markerPlugin;
    if (latestChartDataRef.current) {
      const { candles, ema9, ema21, vwap, volume, rsi } = latestChartDataRef.current;
      candleSeries.setData(candles);
      ema9Series.setData(ema9);
      ema21Series.setData(ema21);
      vwapSeries.setData(vwap);
      volumeSeries.setData(volume);
      rsiSeries.setData(rsi);
      markerPlugin.setMarkers(latestChartDataRef.current.markers.map((marker) => ({
        ...marker,
        color: resolveMarkerColor(marker),
      })));
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) chart.applyOptions({ width, height });
    });
    resizeObserver.observe(chartContainerRef.current);
    if (latestChartDataRef.current?.timeZone) {
      const { timeZone, markers } = latestChartDataRef.current;
      const formatTime = (time) => formatExchangeTime(time, timeZone);
      chart.applyOptions({
        localization: { timeFormatter: formatTime },
        timeScale: { tickMarkFormatter: formatTime },
      });
      markerPlugin.setMarkers(markers.map((marker) => ({ ...marker, color: resolveMarkerColor(marker) })));
    }

    const crosshairHandler = (param) => {
      const candle = param.seriesData.get(candleSeries);
      const ema9 = param.seriesData.get(ema9Series);
      const ema21 = param.seriesData.get(ema21Series);
      const rsi = param.seriesData.get(rsiSeries);
      const legend = crosshairLegendRef.current;
      if (!legend) return;
      if (!candle) {
        legend.textContent = '';
        legend.hidden = true;
        return;
      }
      legend.hidden = false;
      legend.textContent = [
        `O ${candle.open} H ${candle.high} L ${candle.low} C ${candle.close}`,
        Number.isFinite(ema9?.value) ? `EMA9 ${ema9.value.toFixed(2)}` : '',
        Number.isFinite(ema21?.value) ? `EMA21 ${ema21.value.toFixed(2)}` : '',
        Number.isFinite(rsi?.value) ? `RSI ${rsi.value.toFixed(1)}` : '',
      ].filter(Boolean).join(' · ');
    };
    chart.subscribeCrosshairMove(crosshairHandler);
    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(crosshairHandler);
      chart.remove();
      chartStateRef.current = null;
      markerPluginRef.current = null;
      priceLinesRef.current = [];
    };
  }, [isAuthenticated, activeTab, theme]);

  useEffect(() => {
    const series = chartStateRef.current;
    if (!series) return undefined;
    series.volumeSeries.applyOptions({ visible: showVolume });
    const panes = series.chart.panes();
    if (panes[1]) panes[1].setStretchFactor(showVolume ? 0.15 : 0.001);
    priceLinesRef.current.forEach(({ series: lineSeries, line }) => lineSeries.removePriceLine(line));
    priceLinesRef.current = [];
    const data = latestChartDataRef.current;
    if (!data) return undefined;
    const addLine = (targetSeries, options) => {
      const line = targetSeries.createPriceLine(options);
      priceLinesRef.current.push({ series: targetSeries, line });
    };
    if (showSR) {
      data.levels.supports.forEach((level, index) => addLine(series.candleSeries, {
        price: level.price, color: themeColor('--up'), lineWidth: index === 0 ? 2 : 1,
        lineStyle: index === 0 ? 2 : 1, axisLabelVisible: true, title: `S${index + 1}`,
      }));
      data.levels.resistances.forEach((level, index) => addLine(series.candleSeries, {
        price: level.price, color: themeColor('--down'), lineWidth: index === 0 ? 2 : 1,
        lineStyle: index === 0 ? 2 : 1, axisLabelVisible: true, title: `R${index + 1}`,
      }));
      (data.dailyLevels?.supports || []).slice(0, 2).forEach((level, index) => addLine(series.candleSeries, {
        price: level.price, color: themeColor('--accent'), lineWidth: 1, lineStyle: 3,
        axisLabelVisible: true, title: `D-S${index + 1}`,
      }));
      (data.dailyLevels?.resistances || []).slice(0, 2).forEach((level, index) => addLine(series.candleSeries, {
        price: level.price, color: themeColor('--warn'), lineWidth: 1, lineStyle: 3,
        axisLabelVisible: true, title: `D-R${index + 1}`,
      }));
    }
    const lineEntry = Number(analysis?.price || 0);
    const currentLevels = analysis
      ? buildTradeLevels({
        direction: tradeDirection,
        entry: lineEntry,
        atr: Number(analysis.atr || 0),
        supports: analysis.supports,
        resistances: analysis.resistances,
      })
      : null;
    if (analysis && lineEntry > 0 && currentLevels) {
      [
        ['Entry', lineEntry, themeColor('--accent')],
        ['Stop', currentLevels.stop, themeColor('--down')],
        ['Target 1', currentLevels.target1, themeColor('--up')],
        ['Target 2', currentLevels.target2, themeColor('--up')],
      ].forEach(([title, price, color]) => addLine(series.candleSeries, {
        price, title, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true,
      }));
    }
    return undefined;
  }, [showVolume, showSR, analysis, tradeDirection, theme, isAuthenticated, activeTab]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    if (symbolMarketKeyRef.current && symbolMarketKeyRef.current !== symbolMarketKey) {
      setAnalysis(null);
      setChartError('');
      setBacktestResult(null);
      latestChartDataRef.current = null;
      signalCacheRef.current = null;
      crosshairLegendRef.current?.replaceChildren();
      if (chartStateRef.current) {
        chartStateRef.current.candleSeries.setData([]);
        chartStateRef.current.ema9Series.setData([]);
        chartStateRef.current.ema21Series.setData([]);
        chartStateRef.current.vwapSeries.setData([]);
        chartStateRef.current.volumeSeries.setData([]);
        chartStateRef.current.rsiSeries.setData([]);
      }
      markerPluginRef.current?.setMarkers([]);
      priceLinesRef.current.forEach(({ series, line }) => series.removePriceLine(line));
      priceLinesRef.current = [];
    }
    symbolMarketKeyRef.current = symbolMarketKey;
    return undefined;
  }, [isAuthenticated, symbolMarketKey]);

  useEffect(() => {
    const updateClock = () => setMarketClock(Date.now());
    updateClock();
    const timer = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !['home', 'chart'].includes(activeTab)) return undefined;
    const requestGeneration = ++chartLoadGenerationRef.current;
    const isCancelled = () => chartLoadGenerationRef.current !== requestGeneration;
    const loadChartData = async () => {
      setLoading(true);
      setChartError('');
      try {
        const yahooIntervals = {
          '1min': '1m', '2min': '2m', '5min': '5m', '15min': '15m',
          '30min': '30m', '1h': '60m', '90min': '90m', '1day': '1d',
          '1week': '1wk', '1month': '1mo',
        };
        const intervalRanges = {
          '1min': '7d', '2min': '1mo', '5min': '1mo', '15min': '1mo',
          '30min': '1mo', '1h': '1mo', '90min': '1mo',
          '1day': '1y', '1week': '5y', '1month': '10y',
        };
        const yahooSymbol = getYahooSymbol(selectedStock, market);
        const chartParams = new URLSearchParams({
          interval: yahooIntervals[timeframe], range: intervalRanges[timeframe], events: 'div,splits',
        });
        const forceRefresh = forceRefreshRef.current;
        forceRefreshRef.current = false;
        const data = await fetchYahooJson(`/api/yahoo/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?${chartParams}`, yahooApiBaseUrl, {
          ttl: forceRefresh ? 0 : 10_000,
          force: forceRefresh,
        });
        if (isCancelled()) return;
        const result = data.chart?.result?.[0];
        const candles = parseYahooCandles(result);
        if (data.chart?.error || !candles.length) {
          throw new Error(data.chart?.error?.description || 'Yahoo Finance returned no chart data for this symbol and timeframe.');
        }
        const timeZone = result.meta?.exchangeTimezoneName || (market === 'India' ? 'Asia/Kolkata' : 'America/New_York');
        setMarketTradingPeriod(result.meta?.currentTradingPeriod?.regular || null);
        const signalCandles = getClosedCandles(candles, result, timeframe, Date.now());
        const initialChartKey = `${yahooSymbol}|${timeframe}`;
        if (chartStateRef.current) {
          chartStateRef.current.candleSeries.setData(candles);
          if (fitContentKeyRef.current !== initialChartKey) {
            chartStateRef.current.chart.timeScale().fitContent();
            fitContentKeyRef.current = initialChartKey;
          }
        }
        if (signalCandles.length < 22) {
          throw new Error('Not enough completed candles (need at least 22)');
        }

        const higherTimeframe = {
          '1min': ['15m', '60d'], '2min': ['15m', '60d'], '5min': ['15m', '60d'],
          '15min': ['1d', '1y'], '30min': ['1d', '1y'], '1h': ['1d', '1y'], '90min': ['1d', '1y'],
          '1day': ['1wk', '5y'], '1week': ['1mo', '10y'],
        }[timeframe];
        let higherCandles = [];
        let higherLabel = 'Unavailable';
        let higherError = '';
        let dailyLevels = null;
        if (higherTimeframe) {
          const [higherYahooInterval, range] = higherTimeframe;
          higherLabel = ({ '15m': '15min', '60m': '1h', '1d': '1day', '1wk': '1week', '1mo': '1month' })[higherYahooInterval];
          try {
            const higherParams = new URLSearchParams({ interval: higherYahooInterval, range, events: 'div,splits' });
            const higherData = await fetchYahooJson(`/api/yahoo/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?${higherParams}`, yahooApiBaseUrl);
            if (isCancelled()) return;
            const higherResult = higherData.chart?.result?.[0];
            higherCandles = getClosedCandles(parseYahooCandles(higherResult), higherResult, higherLabel);
          } catch (error) {
            higherError = error.message || 'Higher-timeframe history could not be loaded.';
          }
          if (['1min', '2min', '5min', '15min', '30min', '1h', '90min'].includes(timeframe)) {
            try {
              let completedDaily = higherYahooInterval === '1d' ? higherCandles : [];
              if (!completedDaily.length) {
                const dailyParams = new URLSearchParams({ interval: '1d', range: '6mo', events: 'div,splits' });
                const dailyData = await fetchYahooJson(`/api/yahoo/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?${dailyParams}`, yahooApiBaseUrl);
                if (isCancelled()) return;
                const dailyResult = dailyData.chart?.result?.[0];
                completedDaily = getClosedCandles(parseYahooCandles(dailyResult), dailyResult, '1day');
              }
              dailyLevels = findSupportResistance(completedDaily, 120, { interval: '1day', timeZone });
            } catch (error) {
              if (!higherError) higherError = error.message || 'Daily support/resistance could not be loaded.';
            }
          }
        }
        if (isCancelled()) return;

        const ema9 = calculateEMA(signalCandles, 9);
        const ema21 = calculateEMA(signalCandles, 21);
        const rsiValues = calculateRSI(signalCandles, 14);
        const atrValues = calculateATR(signalCandles, 14, { interval: timeframe, timeZone });
        const levels = findSupportResistance(signalCandles, ({
          '1min': 120, '2min': 120, '5min': 120, '15min': 100, '30min': 100,
          '1h': 80, '90min': 80, '1day': 120, '1week': 100, '1month': 80,
        })[timeframe], { interval: timeframe, timeZone });
        const isIntraday = !['1day', '1week', '1month'].includes(timeframe);
        const vwap = isIntraday ? calculateVWAP(candles, timeZone) : [];
        const lastCandle = signalCandles.at(-1);
        const lastClose = lastCandle.close;
        const lastEma9 = ema9.at(-1)?.value;
        const lastEma21 = ema21.at(-1)?.value;
        const lastRsi = rsiValues.at(-1)?.value;
        const lastAtr = atrValues.at(-1)?.value || levels.atr;
        const currentTrend = getTrend(signalCandles, { interval: timeframe, timeZone });
        const higherTrend = getTrend(higherCandles, { interval: higherLabel, timeZone });
        const lastVwap = vwap.find((point) => point.time === lastCandle.time)?.value ?? null;
        const nearestSupport = levels.supports.find((level) => level.price < lastClose);
        const nearestResistance = levels.resistances.find((level) => level.price > lastClose);
        const nearSupport = nearestSupport && lastClose - nearestSupport.price <= Math.max(lastAtr * 0.5, lastClose * 0.002);
        const nearResistance = nearestResistance && nearestResistance.price - lastClose <= Math.max(lastAtr * 0.5, lastClose * 0.002);
        const bullishSignal = Boolean(nearSupport && lastCandle.close > lastCandle.open && lastEma9 >= lastEma21);
        const bearishSignal = Boolean(nearResistance && lastCandle.close < lastCandle.open && lastEma9 <= lastEma21);
        // Keep the original component weights while scoring each direction independently.
        const directionPoints = (direction) => {
          const isLong = direction === 'Long';
          const trendMatch = currentTrend === (isLong ? 'Bullish' : 'Bearish') && higherTrend === currentTrend;
          const emaMatch = isLong ? lastEma9 > lastEma21 : lastEma9 < lastEma21;
          const vwapMatch = lastVwap === null ? false : isLong ? lastClose > lastVwap : lastClose < lastVwap;
          const levelNear = isLong ? nearSupport : nearResistance;
          const signalMatch = isLong ? bullishSignal : bearishSignal;
          const rsiMatch = isLong ? lastRsi >= 50 && lastRsi <= 70 : lastRsi >= 30 && lastRsi <= 50;
          return [
            { label: 'Trend alignment', points: trendMatch ? 25 : 0, maxPoints: 25, reason: trendMatch ? `${currentTrend} chart and ${higherLabel} trends agree.` : 'Chart and higher-timeframe trends do not align.' },
            { label: 'EMA alignment', points: emaMatch ? 15 : 0, maxPoints: 15, reason: emaMatch ? `EMA 9 is aligned for ${direction.toLowerCase()}.` : 'EMA 9/21 alignment does not support this direction.' },
            { label: 'VWAP side', points: vwapMatch ? 15 : 0, maxPoints: 15, reason: lastVwap === null ? 'VWAP unavailable for this timeframe.' : vwapMatch ? `Price is on the ${direction.toLowerCase()} side of VWAP.` : 'Price is on the opposing side of VWAP.' },
            { label: 'S/R confirmation', points: signalMatch ? 25 : levelNear ? 12 : 0, maxPoints: 25, reason: signalMatch ? `Confirmed ${direction.toLowerCase()} candle near structure.` : levelNear ? 'Near a level without full candle confirmation.' : 'No nearby confirming level.' },
            { label: 'RSI', points: rsiMatch ? 20 : 0, maxPoints: 20, reason: rsiMatch ? `RSI ${lastRsi.toFixed(1)} supports ${direction.toLowerCase()} conditions.` : `RSI ${lastRsi.toFixed(1)} is outside the directional range.` },
          ];
        };
        const longScoreDetails = directionPoints('Long');
        const shortScoreDetails = directionPoints('Short');
        const longScore = longScoreDetails.reduce((sum, item) => sum + item.points, 0);
        const shortScore = shortScoreDetails.reduce((sum, item) => sum + item.points, 0);
        const signal = bullishSignal ? 'Bullish near support' : bearishSignal ? 'Bearish near resistance' : 'No clear S/R signal';
        const entryIdea = bullishSignal
          ? `Closed candle confirmed near support at ${nearestSupport.price}.`
          : bearishSignal
            ? `Closed candle confirmed near resistance at ${nearestResistance.price}.`
            : nearSupport
              ? `Price is near support at ${nearestSupport.price}, without a closed-candle confirmation.`
              : nearResistance
                ? `Price is near resistance at ${nearestResistance.price}, without a closed-candle confirmation.`
                : 'Wait for a closed candle near a relevant level with trend confirmation.';
        const signalKey = `${yahooSymbol}|${timeframe}|${signalCandles.at(-1)?.time ?? 'none'}`;
        let signalMarkers;
        let backtest;
        if (signalCacheRef.current?.key === signalKey) {
          ({ markers: signalMarkers, backtest } = signalCacheRef.current);
        } else {
          const markersForCandles = [];
          const atrByTime = new Map(calculateATR(signalCandles, 14, { interval: timeframe, timeZone })
            .map((point) => [point.time, point.value]));
          const ema9ByTime = new Map(ema9.map((point) => [point.time, point.value]));
          const ema21ByTime = new Map(ema21.map((point) => [point.time, point.value]));
          signalCandles.forEach((candle, index) => {
            if (index < 20) return;
            const history = signalCandles.slice(Math.max(0, index - 119), index + 1);
            const historyLevels = findSupportResistance(history, 120, { interval: timeframe, timeZone });
            const historyAtr = atrByTime.get(candle.time) || 0;
            const ema9AtTime = ema9ByTime.get(candle.time);
            const ema21AtTime = ema21ByTime.get(candle.time);
            const support = historyLevels.supports[0];
            const resistance = historyLevels.resistances[0];
            const longSignal = support && candle.close > candle.open &&
              ema9AtTime >= ema21AtTime &&
              candle.close - support.price <= Math.max(historyAtr * 0.5, candle.close * 0.002);
            const shortSignal = resistance && candle.close < candle.open &&
              ema9AtTime <= ema21AtTime &&
              resistance.price - candle.close <= Math.max(historyAtr * 0.5, candle.close * 0.002);
            if (longSignal) markersForCandles.push({ time: candle.time, position: 'belowBar', shape: 'arrowUp', text: '▲ Long' });
            if (shortSignal) markersForCandles.push({ time: candle.time, position: 'aboveBar', shape: 'arrowDown', text: '▼ Short' });
          });
          signalMarkers = markersForCandles;
          backtest = backtestSignals(signalCandles, { interval: timeframe, timeZone });
          signalCacheRef.current = { key: signalKey, markers: signalMarkers, backtest };
        }
        const visibleTrades = latestTradeHistoryRef.current.filter(
          (trade) => trade.symbol === yahooSymbol && trade.interval === timeframe,
        );
        const markers = buildAllMarkers(signalMarkers, visibleTrades, candles);
        const chartState = chartStateRef.current;
        const volume = candles.map((candle) => ({
          time: candle.time,
          value: candle.volume,
          color: candle.close >= candle.open ? themeColor('--volume-up') : themeColor('--volume-down'),
        }));
        const chartData = {
          candles, ema9, ema21, vwap, volume, rsi: rsiValues, levels, dailyLevels,
          signalMarkers, markers, timeZone,
          symbol: yahooSymbol, interval: timeframe,
        };
        latestChartDataRef.current = chartData;
        setTradeHistory((current) => updateTradeHistory(
          current, signalCandles, yahooSymbol, timeframe,
        ));
        if (chartState) {
          chartState.candleSeries.setData(candles);
          chartState.ema9Series.setData(ema9);
          chartState.ema21Series.setData(ema21);
          chartState.vwapSeries.setData(vwap);
          chartState.volumeSeries.setData(volume);
          chartState.rsiSeries.setData(rsiValues);
          markerPluginRef.current?.setMarkers(markers.map((marker) => ({ ...marker, color: resolveMarkerColor(marker) })));
          const formatTime = (time) => formatExchangeTime(time, timeZone);
          chartState.chart.applyOptions({
            localization: { timeFormatter: formatTime },
            timeScale: { tickMarkFormatter: (time) => formatTime(time) },
          });
          if (fitContentKeyRef.current !== initialChartKey) {
            chartState.chart.timeScale().fitContent();
            fitContentKeyRef.current = initialChartKey;
          }
        }
        const activeScore = longScore >= shortScore ? longScore : shortScore;
        const activeDirection = Math.max(longScore, shortScore) < 40
          ? 'No clear setup'
          : longScore >= shortScore ? 'Long' : 'Short';
        setAnalysis({
          price: lastClose.toFixed(2),
          currency: selectedStock.currency || (market === 'India' ? 'INR' : 'USD'),
          trend: currentTrend,
          higherTrend,
          higherLabel,
          rsi: lastRsi.toFixed(1),
          rsiStatus: lastRsi >= 70 ? 'Overbought' : lastRsi <= 30 ? 'Oversold' : 'Neutral',
          atr: lastAtr.toFixed(2),
          supports: levels.supports,
          resistances: levels.resistances,
          dailyLevels,
          ema9: lastEma9.toFixed(2),
          ema21: lastEma21.toFixed(2),
          vwap: lastVwap?.toFixed(2) || null,
          signal,
          setupScore: activeScore,
          setupDirection: activeDirection === 'No clear setup' ? null : activeDirection,
          longScore,
          shortScore,
          longScoreDetails,
          shortScoreDetails,
          entryIdea,
          stopDistance: lastAtr * 1.5,
          dailyUnavailable: higherTrend === 'Unavailable',
          dailyBiasError: higherError,
        });
        setLastUpdated(Date.now());
        setBacktestResult(backtest);
      } catch (error) {
        if (isCancelled()) return;
        if (!error.message?.includes('(HTTP 429)')) console.error(error);
        setChartError(error.name === 'TypeError' && /fetch/i.test(error.message)
          ? 'Could not reach Yahoo Finance. Check your internet connection and confirm the Vite development server is running.'
          : error.message || 'Failed to load chart data.');
      } finally {
        if (chartLoadGenerationRef.current === requestGeneration) setLoading(false);
      }
    };
    loadChartData();
    return () => {
      if (chartLoadGenerationRef.current === requestGeneration) {
        chartLoadGenerationRef.current += 1;
        setLoading(false);
      }
    };
  }, [isAuthenticated, activeTab, selectedStock, market, timeframe, yahooApiBaseUrl, refreshKey, setTradeHistory]);

  useEffect(() => {
    const chartData = latestChartDataRef.current;
    if (!chartData || !markerPluginRef.current) return;
    const symbol = getYahooSymbol(selectedStock, market);
    if (chartData.symbol !== symbol || chartData.interval !== timeframe) return;
    const markers = buildAllMarkers(
      chartData.signalMarkers,
      tradeHistory.filter((trade) => trade.symbol === symbol && trade.interval === timeframe),
      chartData.candles,
    );
    latestChartDataRef.current = { ...chartData, markers };
    markerPluginRef.current.setMarkers(markers.map((marker) => ({ ...marker, color: resolveMarkerColor(marker) })));
  }, [tradeHistory, selectedStock, market, timeframe, theme]);

  useEffect(() => {
    if (!isAuthenticated || !['home', 'chart'].includes(activeTab)) return undefined;
    const generation = ++watchlistLoadGenerationRef.current;
    const isCancelled = () => watchlistLoadGenerationRef.current !== generation;
    const loadWatchlistQuotes = async () => {
      for (const stock of watchlists[market] || []) {
        const yahooSymbol = getYahooSymbol(stock, market);
        const cached = watchlistQuoteCacheRef.current.get(yahooSymbol);
        if (cached && cached.expiresAt > Date.now()) {
          setWatchlistQuotes((current) => ({ ...current, [yahooSymbol]: cached.quote }));
          continue;
        }
        try {
          const params = new URLSearchParams({ interval: '1d', range: '5d', events: 'div,splits' });
          const data = await fetchYahooJson(`/api/yahoo/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?${params}`, yahooApiBaseUrl);
          if (isCancelled()) return;
          const result = data.chart?.result?.[0];
          const candles = parseYahooCandles(result);
          const meta = result?.meta || {};
          const price = Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : candles.at(-1)?.close;
          const previousClose = candles.at(-2)?.close;
          if (!Number.isFinite(price)) continue;
          const quote = {
            price,
            changePercent: Number.isFinite(previousClose) && previousClose !== 0 ? (price - previousClose) / previousClose * 100 : null,
          };
          watchlistQuoteCacheRef.current.set(yahooSymbol, { quote, expiresAt: Date.now() + 60_000 });
          setWatchlistQuotes((current) => ({ ...current, [yahooSymbol]: quote }));
        } catch (error) {
          if (!isCancelled()) console.error(`Unable to load watchlist quote for ${yahooSymbol}.`, error);
          if (error.message?.includes('(HTTP 429)')) break;
        }
      }
    };
    loadWatchlistQuotes();
    return () => {
      if (watchlistLoadGenerationRef.current === generation) watchlistLoadGenerationRef.current += 1;
    };
  }, [isAuthenticated, activeTab, market, watchlists, yahooApiBaseUrl]);

  function changeActiveTab(nextTab) {
    if (nextTab !== activeTab) {
      cancelScan();
      setScannerLoading(false);
      setScannerProgress('');
      setActiveTab(nextTab);
    }
  }

  function changeMarket(nextMarket) {
    cancelScan();
    setScannerLoading(false);
    setScannerProgress('');
    setMarket(nextMarket);
    setSearchResults([]);
    setSearchError('');
    const nextStock = watchlists[nextMarket]?.[0] || DEFAULT_WATCHLISTS[nextMarket][0];
    setSearchQuery(nextStock.symbol);
    setSelectedStock(nextStock);
  }

  function addToWatchlist(stock = selectedStock) {
    setWatchlists((current) => {
      const currentList = current[market] || [];
      if (currentList.some((item) => item.symbol === stock.symbol && item.exchange === stock.exchange)) return current;
      return { ...current, [market]: [...currentList, stock] };
    });
  }

  function saveTradeToHistory() {
    if (
      !analysis ||
      !Number.isFinite(shareCount) ||
      shareCount < 1 ||
      !Number.isFinite(riskPerShare) ||
      riskPerShare <= 0 ||
      !Number.isFinite(stopPrice) ||
      !Number.isFinite(targetPrice)
    ) {
      setHistoryMessage('Enter valid capital, risk, and price levels to save this scenario.');
      return;
    }

    setTradeHistory((current) => [{
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      symbol: getYahooSymbol(selectedStock, market),
      ticker: selectedStock.symbol,
      instrumentName: selectedStock.instrument_name || selectedStock.symbol,
      currency: analysis.currency,
      direction: tradeDirection,
      interval: timeframe,
      entryPrice,
      entryZoneLow,
      entryZoneHigh,
      stopPrice,
      target1Price,
      target2Price: targetPrice,
      shares: shareCount,
      investment: investmentAmount,
      estimatedCosts: tradingCosts,
      moveStopToBreakeven,
      createdAt: new Date().toISOString(),
      outcome: 'pending',
      hitAt: null,
    }, ...current]);
    setHistoryMessage(`Saved ${selectedStock.symbol} scenario to its history.`);
  }

  const selectedStockHistory = tradeHistory.filter(
    (trade) => trade.symbol === getYahooSymbol(selectedStock, market),
  );
  const currencySymbol = analysis?.currency === 'INR' ? '₹' : '$';
  const investmentAmount = Number(sizingMode === 'capital' ? investment : capital);
  const entryPrice = Number(analysis?.price || 0);
  const tradeLevels = analysis
    ? buildTradeLevels({
      direction: tradeDirection,
      entry: entryPrice,
      atr: Number(analysis.atr || 0),
      supports: analysis.supports,
      resistances: analysis.resistances,
    })
    : { stop: 0, stopDistance: 0, target1: 0, target2: 0, method: 'ATR fallback' };
  const riskPerShare = tradeLevels.stopDistance;
  const maxCapitalShares = entryPrice > 0 && investmentAmount > 0 ? Math.floor(investmentAmount / entryPrice) : 0;
  const riskBudget = Number(capital) * Number(riskPercent) / 100;
  const riskSizedShares = riskPerShare > 0 ? Math.floor(riskBudget / riskPerShare) : 0;
  const shareCount = Math.max(0, Math.min(
    sizingMode === 'risk' ? riskSizedShares : maxCapitalShares,
    maxCapitalShares,
  ));
  const rawPotentialLoss = shareCount * riskPerShare;
  const brokerageCost = Math.max(0, Number(brokeragePerOrder) || 0) * 2;
  const slippagePerShare = entryPrice * Math.max(0, Number(slippagePercent) || 0) / 100;
  const tradingCosts = brokerageCost + shareCount * slippagePerShare * 2;
  const potentialLoss = rawPotentialLoss + tradingCosts;
  const potentialTarget1Gain = shareCount * Math.abs(tradeLevels.target1 - entryPrice) - tradingCosts;
  const potentialTarget2Gain = shareCount * Math.abs(tradeLevels.target2 - entryPrice) - tradingCosts;
  const stopPrice = tradeLevels.stop;
  const targetPrice = tradeLevels.target2;
  const entryZoneWidth = Number(analysis?.atr || 0) * 0.25;
  const entryZoneLow = Math.max(0, entryPrice - entryZoneWidth);
  const entryZoneHigh = entryPrice + entryZoneWidth;
  const target1Price = tradeLevels.target1;
  const marketOpen = getMarketStatus(market, marketTradingPeriod, marketClock);
  const displayedCandidates = intradayCandidates
    .filter((candidate) => !showOnlyQualified || candidate.qualified)
    .sort((first, second) => (
      scannerSort === 'relativeVolume'
        ? (second.relativeVolume || -1) - (first.relativeVolume || -1)
        : scannerSort === 'atrPercent'
          ? (second.atrPercent || -1) - (first.atrPercent || -1)
          : (second.score || -1) - (first.score || -1)
    ));

  if (!isAuthenticated) {
    return (
      <main className="login-page">
        <div className="login-decoration" aria-hidden="true">
          <span className="login-candle candle-one" />
          <span className="login-candle candle-two" />
          <span className="login-candle candle-three" />
          <span className="login-trend-line" />
        </div>
        <section className="login-card" aria-labelledby="login-title">
          <div className="login-brand">
            <span className="brand-mark" aria-hidden="true">T</span>
            <span>TECHSTOCK</span>
          </div>
          <p className="login-eyebrow">MARKET WORKSPACE</p>
          <h1 id="login-title">Welcome back</h1>
          <p className="login-description">Sign in to open your charts, watchlists, and intraday tools.</p>
          <form className="login-form" onSubmit={handleLogin}>
            <label htmlFor="login-id">Login ID</label>
            <input
              id="login-id"
              name="username"
              type="text"
              autoComplete="username"
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              placeholder="Enter your login ID"
              required
            />
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              placeholder="Enter your password"
              required
            />
            {loginError && <p className="login-error" role="alert">{loginError}</p>}
            <button type="submit" className="login-submit">Sign in</button>
          </form>
          <p className="login-demo">Demo login: ID <strong>hd</strong> · Password <strong>hd</strong></p>
          <p className="login-security-note">Demo access only. This front-end login is not secure authentication.</p>
        </section>
        <p className="login-footer">Market data and analysis workspace</p>
      </main>
    );
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <header className="app-header">
        <div>
          <h1 className="app-title">Stock Technical Analysis</h1>
          <p className="app-summary">
            Yahoo Finance search and chart data, with intraday intervals, saved watchlists, and options links.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="settings-button"
            onClick={() => setShowPreferences((current) => !current)}
            aria-expanded={showPreferences}
            aria-controls="app-preferences"
          >
            <span aria-hidden="true">⚙</span>
            Settings
          </button>
          <button type="button" className="logout-button" onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      {showPreferences && (
        <section id="app-preferences" className="scanner-panel preferences-panel" aria-label="App settings">
          <div className="preferences-heading">
            <div>
              <h2>App settings</h2>
              <p>Choose a comfortable theme and configure the market-data proxy used by this device.</p>
            </div>
            <button type="button" className="preferences-close" onClick={() => setShowPreferences(false)} aria-label="Close settings">×</button>
          </div>
          <div className="preferences-grid">
            <label className="preference-field">
              Theme
              <select value={theme} onChange={(event) => setTheme(event.target.value)}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="ocean">Ocean</option>
              </select>
              <small>Your choice is saved on this device and also updates the chart colors.</small>
            </label>
            <label className="preference-field">
              Yahoo API proxy URL
              <input
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                placeholder="https://your-server.com"
                value={apiBaseDraft}
                onChange={(event) => setApiBaseDraft(event.target.value)}
              />
              <small>
                Required in a packaged APK. Enter your HTTPS proxy server URL, not query1.finance.yahoo.com. The app adds /api/yahoo to proxy requests automatically.
              </small>
            </label>
          </div>
          <div className="preferences-actions">
            <button type="button" className="scan-button" onClick={savePreferences}>Save settings</button>
            <button type="button" className="secondary-button" onClick={testYahooConnection}>Test market-data connection</button>
          </div>
          {preferencesMessage && <p className="history-message" role="status">{preferencesMessage}</p>}
          {apiTestStatus && (
            <p className={apiTestStatus.startsWith('Proxy connected') ? 'connection-status success' : 'connection-status'} role="status">
              {apiTestStatus}
            </p>
          )}
          <p className="subtle-note preferences-note">
            The project includes a development proxy, not a production data server. To use the APK, deploy an HTTPS proxy endpoint first, then enter its URL above. Direct Yahoo Finance requests from a packaged app are not configured here.
          </p>
        </section>
      )}

      <div className="dashboard-layout">
        <WorkspaceSidebar activeTab={activeTab} onNavigate={changeActiveTab} stock={selectedStock} />

        <main className="dashboard-main">
      {/* Controls */}
      <div className="controls">
        <select
          value={market}
          onChange={(e) => changeMarket(e.target.value)}
          aria-label="Stock market"
          className="market-select"
        >
          <option value="India">India</option>
          <option value="United States">United States</option>
        </select>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') searchStocks();
          }}
          placeholder={market === 'India' ? 'Company or ticker (e.g. TCS)' : 'Company or ticker (e.g. AAPL)'}
          aria-label="Search stocks"
          className="stock-search-input"
        />

        <button
          onClick={searchStocks}
          disabled={searching}
          className="primary-button"
        >
          {searching ? 'Searching...' : 'Search'}
        </button>

        <a
          href={`https://finance.yahoo.com/lookup/?query=${encodeURIComponent(searchQuery)}`}
          target="_blank"
          rel="noreferrer"
          className="external-link"
        >
          Yahoo search
        </a>

        <div className="timeframe-control" role="group" aria-label="Chart timeframe">
          {[['1min', '1m'], ['5min', '5m'], ['15min', '15m'], ['1h', '1h'], ['1day', '1D'], ['1week', '1W']].map(([value, label]) => (
            <button type="button" key={value} aria-pressed={timeframe === value} className={timeframe === value ? 'timeframe-button selected' : 'timeframe-button'} onClick={() => setTimeframe(value)}>
              {label}
            </button>
          ))}
          <label className="sr-only" htmlFor="more-timeframes">More timeframes</label>
          <select id="more-timeframes" value={timeframe} onChange={(event) => setTimeframe(event.target.value)} aria-label="More timeframes">
            <option value="" disabled>More…</option>
            <option value="1min">More: 1 Min</option>
            <option value="2min">2 Min</option>
            <option value="5min">5 Min</option>
            <option value="15min">15 Min</option>
            <option value="30min">30 Min</option>
            <option value="1h">1 Hour</option>
            <option value="90min">90 Min</option>
            <option value="1day">Daily</option>
            <option value="1week">Weekly</option>
            <option value="1month">Monthly</option>
          </select>
        </div>

        <button
          onClick={() => addToWatchlist()}
          className="secondary-button"
        >
          + Add to watchlist
        </button>

        <label className="control-toggle">
          <input type="checkbox" checked={showVolume} onChange={(e) => setShowVolume(e.target.checked)} />
          Volume
        </label>

        <label className="control-toggle">
          <input type="checkbox" checked={showSR} onChange={(e) => setShowSR(e.target.checked)} />
          S/R Lines
        </label>

        <span className={marketOpen ? 'market-status is-open' : 'market-status'}>
          {marketOpen ? 'Market open' : 'Market closed'}
        </span>
        {marketClock > 0 && <span className="market-clock" aria-label="Exchange local time">
          {new Intl.DateTimeFormat(undefined, {
            timeZone: market === 'India' ? 'Asia/Kolkata' : 'America/New_York',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
          }).format(marketClock)}
        </span>}
        <label className="control-toggle">
          <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
          Auto-refresh
        </label>
        <select aria-label="Auto-refresh interval" value={autoRefreshSeconds} onChange={(event) => setAutoRefreshSeconds(Number(event.target.value))}>
          <option value={30}>30 sec</option>
          <option value={60}>60 sec</option>
        </select>
        {lastUpdated && <span className="last-updated">Last updated {new Date(lastUpdated).toLocaleTimeString()}</span>}
        {loading && <span className="updating-indicator" role="status">Updating…</span>}
      </div>

      <WorkspaceTabs activeTab={activeTab} onNavigate={changeActiveTab} />

      {activeTab === 'home' && (
        <DashboardHome
          market={market}
          stock={selectedStock}
          analysis={analysis}
          loading={loading}
          tradesCount={selectedStockHistory.length}
          watchlist={(watchlists[market] || []).map((stock) => ({
            stock,
            yahooSymbol: getYahooSymbol(stock, market),
          }))}
          quotes={watchlistQuotes}
          onSelectStock={(stock) => {
            setSelectedStock(stock);
            setSearchQuery(stock.symbol);
          }}
          onAddStock={() => addToWatchlist()}
          onOpenChart={() => changeActiveTab('chart')}
          onOpenReport={() => changeActiveTab('report')}
        />
      )}

      {activeTab !== 'options' && searchError && (
        <p className="search-error" role="status">
          {searchError}
        </p>
      )}

      {activeTab !== 'options' && searchResults.length > 0 && (
        <div className="search-results" aria-label="Stock search results">
          {searchResults.map((stock, index) => (
            <div className="search-result" key={`${stock.symbol}-${stock.exchange}-${index}`}>
              <button
                type="button"
                onClick={() => {
                  setSelectedStock(stock);
                  setSearchQuery(stock.symbol);
                  setSearchResults([]);
                  setSearchError('');
                  changeActiveTab('chart');
                }}
              >
                <span>
                  <strong>{stock.symbol}</strong>
                  <span>{stock.instrument_name}</span>
                </span>
                <span className="search-result-exchange">{stock.exchange}</span>
              </button>
              <button
                type="button"
                className="add-scan-stock"
                onClick={() => addToIntradayList(stock)}
                disabled={(customScannerStocks[market] || []).some(
                  (item) => getYahooSymbol(item, market) === getYahooSymbol(stock, market),
                )}
              >
                {(customScannerStocks[market] || []).some(
                  (item) => getYahooSymbol(item, market) === getYahooSymbol(stock, market),
                ) ? 'Added' : '+ Intraday list'}
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'ideas' && (
        <section id="panel-ideas" aria-labelledby="tab-ideas" className="scanner-panel" role="tabpanel">
          <div className="scanner-heading">
            <div>
              <h2>{market} intraday candidates</h2>
              <p>Screen liquid large-cap names using recent Yahoo daily candles, then confirm candidates on the 5-minute chart.</p>
            </div>
            <button type="button" className="scan-button" onClick={scanIntradayStocks} disabled={scannerLoading}>
              {scannerLoading ? scannerProgress || 'Scanning…' : 'Scan candidates'}
            </button>
          </div>
          <div className="scanner-rules">
            <span>Avg volume ≥ 500k shares</span>
            <span>Last completed daily volume ≥ 1.2× 20-day avg</span>
            <span>ATR ≥ 1.2%</span>
            <span>Bull RSI 50–70 · Bear RSI 30–50</span>
            <span>Price must align with EMA 21</span>
          </div>
          <div className="scanner-manage">
            <h3>My added stocks</h3>
            <p className="subtle-note">Add stocks from search results. They are saved in this browser and included in future scans.</p>
            <div className="scanner-manage-list">
              {(customScannerStocks[market] || []).map((stock) => (
                <span className="scanner-stock-chip" key={getYahooSymbol(stock, market)}>
                  {stock.symbol}
                  <button type="button" onClick={() => removeFromIntradayList(stock)} aria-label={`Remove ${stock.symbol} from intraday scan list`}>×</button>
                </span>
              ))}
              {(customScannerStocks[market] || []).length === 0 && <span className="subtle-note">No extra stocks added yet.</span>}
            </div>
          </div>
          {scannerError && <p className="scanner-error" role="alert">{scannerError}</p>}
          <div className="scanner-tools">
            <label>Sort by
              <select value={scannerSort} onChange={(event) => setScannerSort(event.target.value)}>
                <option value="score">Score</option>
                <option value="relativeVolume">Relative volume</option>
                <option value="atrPercent">ATR%</option>
              </select>
            </label>
            <label className="control-toggle"><input type="checkbox" checked={showOnlyQualified} onChange={(event) => setShowOnlyQualified(event.target.checked)} />Show only qualified</label>
          </div>
          {intradayCandidates.length > 0 && (
            <div className="candidate-list">
              {displayedCandidates.map((candidate) => (
                <article className="candidate-card" key={candidate.yahooSymbol}>
                  <div className="candidate-topline">
                    <div>
                      <strong>{candidate.symbol}</strong>
                      <span>{candidate.status === 'skipped' ? `Skipped: ${candidate.skipReason}` : candidate.instrument_name}</span>
                    </div>
                    <span className={candidate.qualified ? 'candidate-badge qualified' : 'candidate-badge'}>
                      {candidate.status === 'skipped'
                        ? 'Skipped'
                        : `${candidate.direction || 'No direction'} · ${candidate.qualified ? 'Qualified' : `${candidate.score}/100`}`}
                    </span>
                  </div>
                  {candidate.status !== 'skipped' && <div className="candidate-stats">
                    <span>Price <strong>{candidate.currency === 'INR' ? '₹' : '$'}{candidate.price.toFixed(2)}</strong></span>
                    <span>Direction <strong className={`tone-${candidate.trend.toLowerCase()}`}>{candidate.trend === 'Bullish' ? '▲ Bullish' : candidate.trend === 'Bearish' ? '▼ Bearish' : candidate.trend}</strong></span>
                    <span>RSI <strong>{candidate.rsi.toFixed(0)}</strong></span>
                    <span>ATR <strong>{candidate.atrPercent.toFixed(2)}%</strong></span>
                    <span>Rel. volume <strong>{candidate.relativeVolume.toFixed(2)}×</strong></span>
                    <span>Avg volume <strong>{Math.round(candidate.averageVolume).toLocaleString()}</strong></span>
                  </div>}
                  {candidate.checks && <div className="check-chips">
                    {Object.entries({ Liquidity: candidate.checks.liquid, Volume: candidate.checks.volume, Volatility: candidate.checks.volatility, RSI: candidate.checks.rsi, Trend: candidate.checks.trend, Level: candidate.checks.level }).map(([label, passed]) => (
                      <span className={passed ? 'check-chip pass' : 'check-chip fail'} key={label}>{passed ? '✓' : '×'} {label}</span>
                    ))}
                  </div>}
                  {candidate.status !== 'skipped' && <button
                    type="button"
                    className="candidate-chart-button"
                    onClick={() => {
                      setSelectedStock(candidate);
                      setSearchQuery(candidate.symbol);
                      setTimeframe('5min');
                      changeActiveTab('chart');
                      setChartError('');
                    }}
                  >
                    Open 5-minute chart
                  </button>}
                </article>
              ))}
            </div>
          )}
          {intradayCandidates.length > 0 && !displayedCandidates.length && (
            <p className="subtle-note">No candidates match the current filter.</p>
          )}
          {intradayCandidates.length > 0 && !intradayCandidates.some((candidate) => candidate.qualified) && (
            <p className="subtle-note">No stock met all the core filters. The list is still ranked by matching conditions; avoid forcing a trade.</p>
          )}
          <p className="subtle-note scanner-disclaimer">
            Relative volume uses the last completed daily candle (excluding a currently forming daily candle while the market is open) against the previous 20 completed daily candles. It is not time-of-day-adjusted. This is a screening aid, not a recommendation or probability of profit.
          </p>
        </section>
      )}

      {activeTab === 'report' && (
        <div id="panel-report" role="tabpanel" aria-labelledby="tab-report">
          <TradeReportPanel
            trades={selectedStockHistory}
            ticker={selectedStock.symbol}
            currency={analysis?.currency || selectedStock.currency}
          />
        </div>
      )}

      {activeTab === 'history' && (
        <TradeHistoryPanel
          trades={selectedStockHistory}
          ticker={selectedStock.symbol}
          instrumentName={selectedStock.instrument_name}
          currency={selectedStock.currency}
          message={historyMessage}
          onOpenChart={() => changeActiveTab('chart')}
          onDelete={(tradeId) => setTradeHistory((current) => current.filter((trade) => trade.id !== tradeId))}
        />
      )}

      {activeTab === 'paper' && (
        <PaperTradingPanel
          stock={selectedStock}
          currency={analysis?.currency || selectedStock.currency || (market === 'India' ? 'INR' : 'USD')}
          currentPrice={analysis?.price || watchlistQuotes[getYahooSymbol(selectedStock, market)]?.price}
        />
      )}

      {activeTab === 'options' && (
        <section id="panel-options" aria-labelledby="tab-options" className="scanner-panel options-panel" role="tabpanel">
          <div className="scanner-heading">
            <div>
              <h2>Indian index options</h2>
              <p>Choose an index to open its official exchange option chain. Contract prices and open interest are shown by the exchange, not estimated by this app.</p>
            </div>
          </div>
          <div className="index-option-grid">
            {INDEX_OPTIONS.map((index) => (
              <button
                type="button"
                key={index.id}
                className={selectedOptionsIndex === index.id ? 'index-option-card selected' : 'index-option-card'}
                onClick={() => setSelectedOptionsIndex(index.id)}
                aria-pressed={selectedOptionsIndex === index.id}
              >
                <strong>{index.name}</strong>
                <span>{index.exchange} · {index.symbol}</span>
              </button>
            ))}
          </div>
          {(() => {
            const selectedIndex = INDEX_OPTIONS.find((index) => index.id === selectedOptionsIndex);
            return (
              <div className="option-chain-info">
                <h3>{selectedIndex.name} option chain</h3>
                <p>On the exchange page, review expiry, strike, Call (CE) / Put (PE), last price, change, volume, open interest, and implied volatility where available.</p>
                <a className="scan-button option-chain-link" href={selectedIndex.url} target="_blank" rel="noreferrer">
                  Open official {selectedIndex.exchange} option chain
                </a>
                <p className="subtle-note">The exchange page shows the current contracts and prices. Live option rows are not embedded in this app because it has no authorized exchange options feed; showing delayed or invented values here would be misleading.</p>
              </div>
            );
          })()}
        </section>
      )}

      {activeTab === 'chart' && (
        <>
      <div id="panel-chart" role="tabpanel" aria-labelledby="tab-chart">
      <section className="watchlist-panel" aria-label={`${market} watchlist`}>
        <div className="watchlist-heading">
          <strong>{market} watchlist</strong>
          <span>Saved in this browser</span>
        </div>
        <div className="watchlist-items">
          {(watchlists[market] || []).map((stock) => (
            <div className="watchlist-item" key={`${stock.symbol}-${stock.exchange}`}>
              <button
                type="button"
                className="watchlist-select"
                onClick={() => {
                  setSelectedStock(stock);
                  setSearchQuery(stock.symbol);
                  setChartError('');
                }}
                aria-pressed={selectedStock.symbol === stock.symbol && selectedStock.exchange === stock.exchange}
              >
                <strong>{stock.symbol}</strong>
                <span className="watchlist-exchange">{stock.exchange}</span>
                {watchlistQuotes[getYahooSymbol(stock, market)] && (
                  <span className="watchlist-quote">
                    {stock.currency === 'INR' ? '₹' : '$'}{watchlistQuotes[getYahooSymbol(stock, market)].price.toFixed(2)}
                    {watchlistQuotes[getYahooSymbol(stock, market)].changePercent !== null && (
                      <small className={watchlistQuotes[getYahooSymbol(stock, market)].changePercent >= 0 ? 'tone-bullish' : 'tone-bearish'}>
                        {watchlistQuotes[getYahooSymbol(stock, market)].changePercent >= 0 ? '▲' : '▼'} {Math.abs(watchlistQuotes[getYahooSymbol(stock, market)].changePercent).toFixed(2)}%
                      </small>
                    )}
                  </span>
                )}
              </button>
              <a
                className="watchlist-link"
                href={`https://finance.yahoo.com/quote/${encodeURIComponent(getYahooSymbol(stock, market))}/options/`}
                target="_blank"
                rel="noreferrer"
              >
                Options
              </a>
              <button
                type="button"
                className="watchlist-remove"
                aria-label={`Remove ${stock.symbol} from watchlist`}
                onClick={() => setWatchlists((current) => ({
                  ...current,
                  [market]: (current[market] || []).filter((item) => item.symbol !== stock.symbol || item.exchange !== stock.exchange),
                }))}
              >
                ×
              </button>
            </div>
          ))}
          {(watchlists[market] || []).length === 0 && (
            <span className="subtle-note">Your watchlist is empty. Add the selected stock to get started.</span>
          )}
        </div>
      </section>

      {chartError && (
        <div className="chart-error" role="alert">
          <span>{chartError}</span>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              forceRefreshRef.current = true;
              setRefreshKey((current) => current + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Analysis Card */}
      {analysis && (
        <div className="analysis-layout">
          <section className="analysis-panel verdict-card">
            <h2>Verdict</h2>
            <div className="verdict-grid">
              <strong className={analysis.setupDirection === 'Long' ? 'tone-bullish' : analysis.setupDirection === 'Short' ? 'tone-bearish' : ''}>
                {analysis.setupDirection ? `${analysis.setupDirection} setup ${analysis.setupScore}/100` : 'No clear setup'}
              </strong>
              {analysis.setupDirection && (
                <>
                  <span>Nearest S/R: {currencySymbol}{analysis.setupDirection === 'Long' ? analysis.supports[0]?.price ?? '—' : analysis.resistances[0]?.price ?? '—'}</span>
                  <span>Entry {currencySymbol}{entryPrice.toFixed(2)} · Stop {currencySymbol}{verdictTradeLevels.stop.toFixed(2)}</span>
                  <span>T1 {currencySymbol}{verdictTradeLevels.target1.toFixed(2)} · T2 {currencySymbol}{verdictTradeLevels.target2.toFixed(2)}</span>
                </>
              )}
              <p>{analysis.entryIdea}</p>
            </div>
          </section>
          <section className="analysis-panel">
            <h2>Market read</h2>
            <div className="metrics-grid">
              <div className="metric"><span>Last price</span><strong>{currencySymbol}{analysis.price}</strong></div>
              <div className="metric"><span>Current chart bias</span><strong className={`tone-${analysis.trend.toLowerCase()}`}>{analysis.trend}</strong></div>
              <div className="metric"><span>Higher-timeframe bias ({analysis.higherLabel})</span><strong className={`tone-${analysis.higherTrend.toLowerCase()}`}>{analysis.higherTrend}</strong></div>
              <div className="metric"><span>RSI (14)</span><strong>{analysis.rsi} · {analysis.rsiStatus}</strong></div>
              <div className="metric"><span>EMA 9</span><strong>{currencySymbol}{analysis.ema9}</strong></div>
              <div className="metric"><span>EMA 21</span><strong>{currencySymbol}{analysis.ema21}</strong></div>
              <div className="metric"><span>Session VWAP</span><strong>{analysis.vwap ? `${currencySymbol}${analysis.vwap}` : 'Intraday only'}</strong></div>
              <div className="metric">
                <span>Directional alignment score</span>
                <strong>{analysis.setupDirection ? `${analysis.setupDirection} setup ${analysis.setupScore}/100` : 'No clear setup'}</strong>
                <small>Heuristic component score, not a win probability.</small>
              </div>
            </div>
            <div className="score-breakdown">
              {[['Long', analysis.longScore, analysis.longScoreDetails], ['Short', analysis.shortScore, analysis.shortScoreDetails]].map(([direction, score, details]) => (
                <div className="quality-reasons" key={direction}>
                  <strong>{direction} setup {score}/100</strong>
                  <ul>
                    {details.map((detail) => (
                      <li key={detail.label}>
                        <span>{detail.label}: {detail.reason}</span>
                        <small>{detail.points}/{detail.maxPoints}</small>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {analysis.dailyUnavailable && (
              <p className="subtle-note">
                Higher-timeframe context unavailable{analysis.dailyBiasError ? `: ${analysis.dailyBiasError}` : ' because Yahoo returned too few candles'}.
              </p>
            )}
          </section>

          <section className="analysis-panel">
            <h2>Support &amp; resistance</h2>
            <div className="levels-columns">
              <div>
                <h3 className="support-heading">Support</h3>
                {analysis.supports.map((level, index) => (
                  <div className="level-row" key={`support-${level.price}`}>
                    <span>S{index + 1}</span><strong>{currencySymbol}{level.price}</strong><small>{level.touches} pivot touch{level.touches === 1 ? '' : 'es'}</small>
                  </div>
                ))}
              </div>
              <div>
                <h3 className="resistance-heading">Resistance</h3>
                {analysis.resistances.map((level, index) => (
                  <div className="level-row" key={`resistance-${level.price}`}>
                    <span>R{index + 1}</span><strong>{currencySymbol}{level.price}</strong><small>{level.touches} pivot touch{level.touches === 1 ? '' : 'es'}</small>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="analysis-panel signal-panel">
            <h2>Signal &amp; entry explanation</h2>
            <strong className={analysis.signal.startsWith('Bullish') ? 'tone-bullish' : analysis.signal.startsWith('Bearish') ? 'tone-bearish' : ''}>
              {analysis.signal}
            </strong>
            <p>{analysis.entryIdea}</p>
            <p className="subtle-note">Signals are technical observations for education, not personalized investment advice.</p>
          </section>

          <details className="analysis-panel calculator-panel calculator-details" open>
            <summary><h2>Trade scenario calculator</h2></summary>
            <div className="calculator-inputs">
              <label>Position sizing
                <select value={sizingMode} onChange={(event) => setSizingMode(event.target.value)}>
                  <option value="capital">Capital-based</option>
                  <option value="risk">Risk-based</option>
                </select>
              </label>
              {sizingMode === 'capital' ? (
                <label>Investment amount ({analysis.currency})
                  <input type="number" min="0" step="any" value={investment} onChange={(event) => setInvestment(event.target.value)} inputMode="decimal" />
                </label>
              ) : (
                <>
                  <label>Capital ({analysis.currency})
                    <input type="number" min="0" step="any" value={capital} onChange={(event) => setCapital(event.target.value)} inputMode="decimal" />
                  </label>
                  <label>Risk per trade (%)
                    <input type="number" min="0" max="100" step="0.1" value={riskPercent} onChange={(event) => setRiskPercent(event.target.value)} inputMode="decimal" />
                  </label>
                </>
              )}
              <label>
                Direction
                <select value={tradeDirection} onChange={(event) => setTradeDirection(event.target.value)}>
                  <option value="Long">Long</option>
                  <option value="Short">Short</option>
                </select>
              </label>
              <label>Brokerage per order ({analysis.currency})
                <input type="number" min="0" step="any" value={brokeragePerOrder} onChange={(event) => setBrokeragePerOrder(event.target.value)} inputMode="decimal" />
              </label>
              <label>Slippage (%)
                <input type="number" min="0" step="0.01" value={slippagePercent} onChange={(event) => setSlippagePercent(event.target.value)} inputMode="decimal" />
              </label>
            </div>
            <div className="pnl-grid">
              <div className="metric"><span>Whole shares</span><strong>{shareCount}</strong></div>
              <div className="metric"><span>Entry zone · ±0.25 ATR</span><strong>{currencySymbol}{entryZoneLow.toFixed(2)}–{currencySymbol}{entryZoneHigh.toFixed(2)}</strong></div>
              <div className="metric"><span>Reference entry</span><strong>{currencySymbol}{entryPrice.toFixed(2)}</strong></div>
              <div className="metric"><span>Stop loss</span><strong>{currencySymbol}{stopPrice.toFixed(2)}</strong></div>
              <div className="metric"><span>Target 1</span><strong>{currencySymbol}{target1Price.toFixed(2)}</strong></div>
              <div className="metric"><span>Target 2</span><strong>{currencySymbol}{targetPrice.toFixed(2)}</strong></div>
              <div className="metric"><span>Net possible loss at stop</span><strong className="tone-bearish">−{currencySymbol}{potentialLoss.toFixed(2)}</strong></div>
              <div className="metric"><span>Net possible gain at target 1</span><strong className={potentialTarget1Gain >= 0 ? 'tone-bullish' : 'tone-bearish'}>{potentialTarget1Gain >= 0 ? '+' : '−'}{currencySymbol}{Math.abs(potentialTarget1Gain).toFixed(2)}</strong></div>
              <div className="metric"><span>Net possible gain at target 2</span><strong className={potentialTarget2Gain >= 0 ? 'tone-bullish' : 'tone-bearish'}>{potentialTarget2Gain >= 0 ? '+' : '−'}{currencySymbol}{Math.abs(potentialTarget2Gain).toFixed(2)}</strong></div>
            </div>
            <div className="trade-plan-reasons">
              <strong>How these levels are set</strong>
              <ul>
                <li>Entry zone is centered on the latest chart price, with a buffer of 0.25 ATR; the reference entry is the current price.</li>
                <li>Stop method: {tradeLevels.method}; stop distance is bounded between 0.75 and 2.5 ATR when structure is available, otherwise 1.5 ATR.</li>
                <li>Targets use opposing structure when available, with a minimum 1R for T1 and at least 2R for T2.</li>
                <li>{analysis.entryIdea}</li>
              </ul>
            </div>
            <label className="control-toggle breakeven-toggle">
              <input
                type="checkbox"
                checked={moveStopToBreakeven}
                onChange={(event) => setMoveStopToBreakeven(event.target.checked)}
              />
              Move stop to breakeven after T1 (history tracking)
            </label>
            <button type="button" className="scan-button history-save-button" onClick={saveTradeToHistory}>
              Save entry, stop &amp; targets to {selectedStock.symbol} history
            </button>
            {historyMessage && activeTab === 'chart' && <p className="history-message" role="status">{historyMessage}</p>}
            <p className="subtle-note">Illustrative analytical levels, not a forecast or probability. Costs include the entered brokerage and slippage only; taxes are not estimated.</p>
          </details>
          <section className="analysis-panel backtest-panel">
            <h2>Historical signal simulation</h2>
            <p className="subtle-note">Statistics are calculated only from the loaded historical candles using the current signal rules. They describe this sample and do not predict future results.</p>
            {backtestResult && (
              <>
                <div className="metrics-grid">
                  <div className="metric"><span>Trades</span><strong>{backtestResult.numberOfTrades}</strong></div>
                  <div className="metric"><span>Gross P&amp;L</span><strong>{backtestResult.gross?.totalPnl?.toFixed(2) ?? '0.00'}</strong></div>
                  <div className="metric"><span>Net P&amp;L</span><strong>{backtestResult.net?.totalPnl?.toFixed(2) ?? '0.00'}</strong></div>
                  <div className="metric"><span>Win rate</span><strong>{backtestResult.winRate.toFixed(1)}%</strong></div>
                  <div className="metric"><span>Average R</span><strong>{backtestResult.averageR.toFixed(2)}R</strong></div>
                  <div className="metric"><span>Expectancy</span><strong>{backtestResult.expectancy.toFixed(2)}R</strong></div>
                  <div className="metric"><span>Max drawdown</span><strong>{backtestResult.maxDrawdownR.toFixed(2)}R</strong></div>
                  <div className="metric"><span>Symbols</span><strong>{backtestResult.symbolsTested ?? 1}</strong></div>
                </div>
                {backtestResult.inSample && backtestResult.outOfSample && (
                  <div className="metrics-grid">
                    <div className="metric"><span>In-sample net</span><strong>{(backtestResult.inSample?.net?.totalPnl ?? 0).toFixed(2)}</strong></div>
                    <div className="metric"><span>Out-of-sample net</span><strong>{(backtestResult.outOfSample?.net?.totalPnl ?? 0).toFixed(2)}</strong></div>
                    <div className="metric"><span>In-sample avg R</span><strong>{(backtestResult.inSample?.averageR ?? 0).toFixed(2)}R</strong></div>
                    <div className="metric"><span>Out-of-sample avg R</span><strong>{(backtestResult.outOfSample?.averageR ?? 0).toFixed(2)}R</strong></div>
                  </div>
                )}
                {(backtestResult.numberOfTrades < 30 || (backtestResult.symbolsTested ?? 1) < 30) && <p className="subtle-note" role="note">Warning: fewer than 30 trades in this sample; this result is too small for reliable conclusions.</p>}
                {backtestResult.inSample && backtestResult.outOfSample &&
                  (backtestResult.outOfSample.averageR ?? 0) < (backtestResult.inSample.averageR ?? 0) * (TRADING_THRESHOLDS.muchWorseOutOfSampleRatio ?? 0.5) && (
                    <p className="subtle-note" role="alert">Warning: out-of-sample results are much worse than in-sample results, which suggests possible overfitting.</p>
                  )}
              </>
            )}
          </section>
        </div>
      )}

      <div className="chart-external-links">
        <a
          href={`https://finance.yahoo.com/chart/${encodeURIComponent(getYahooSymbol(selectedStock, market))}`}
          target="_blank"
          rel="noreferrer"
          className="external-link"
        >
          Open {selectedStock.symbol} chart on Yahoo Finance
        </a>
        <a
          href={`https://finance.yahoo.com/quote/${encodeURIComponent(getYahooSymbol(selectedStock, market))}/options/`}
          target="_blank"
          rel="noreferrer"
          className="external-link"
        >
          View options chain
        </a>
      </div>
      <div className="chart-legend" aria-label="Chart indicator legend">
        <span ref={crosshairLegendRef} className="ohlc-legend" hidden />
        <span><i className="legend-ema9" /> EMA 9</span>
        <span><i className="legend-ema21" /> EMA 21</span>
        {analysis?.vwap && <span><i className="legend-vwap" /> Session VWAP</span>}
        <span><i className="legend-support" /> Support</span>
        <span><i className="legend-resistance" /> Resistance</span>
      </div>

      {/* Chart */}
      <ChartView containerRef={chartContainerRef} loading={loading} hasAnalysis={Boolean(analysis)} />
      </div>
        </>
      )}
        </main>
        <MarketInspector
          marketOpen={marketOpen}
          stock={selectedStock}
          analysis={analysis}
          onOpenHistory={() => changeActiveTab('history')}
          onOpenReport={() => changeActiveTab('report')}
        />
      </div>
    </div>
  );
}

export default App;