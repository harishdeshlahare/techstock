import { useEffect, useRef, useState } from 'react';
import { createChart, createSeriesMarkers, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
import { calculateATR, calculateEMA, calculateRSI, calculateVWAP, getTrend } from './lib/indicators.js';
import { buildLiquiditySweepTradeLevels, buildTradeLevels, findSupportResistance } from './lib/levels.js';
import { backtestSignals, backtestSymbols } from './lib/backtest.js';
import { updateTradeHistory } from './lib/tradeHistory.js';
import { getMarketStatus } from './lib/marketStatus.js';
import { getPriceActionContext } from './lib/priceAction.js';
import { evaluateEntrySignals, getSignalLevelLookback } from './lib/signalRules.js';
import { DEFAULT_YAHOO_API_BASE_URL, fetchYahooJson, getClosedCandles, getYahooSymbol, normalizeYahooProxyUrl, parseYahooCandles } from './lib/yahoo.js';
import { searchIndianIndices } from './lib/indices.js';
import { TRADING_THRESHOLDS } from './lib/config/costs.js';
import ChartView from './components/ChartView.jsx';
import TradeReportPanel from './components/TradeReportPanel.jsx';
import TradeHistoryPanel from './components/TradeHistoryPanel.jsx';
import DashboardHome from './components/DashboardHome.jsx';
import MarketInspector from './components/MarketInspector.jsx';
import ForexCryptoPanel from './components/ForexCryptoPanel.jsx';
import PaperTradingPanel from './components/PaperTradingPanel.jsx';
import OptionsPanel from './components/OptionsPanel.jsx';
import { WorkspaceSidebar, WorkspaceTabs } from './components/WorkspaceNavigation.jsx';
import { useScanner } from './hooks/useScanner.js';
import { useTradeHistory } from './hooks/useTradeHistory.js';
import { useWatchlists } from './hooks/useWatchlists.js';
import ErrorBoundary from './components/ErrorBoundary.jsx';
const AVAILABLE_THEMES = ['dark', 'light', 'ocean'];
const AVAILABLE_LANGUAGES = ['en', 'hi'];

const UI_TEXT = {
  en: {
    appTitle: 'Stock Technical Analysis',
    appSummary: 'Yahoo Finance search and chart data, with intraday intervals, saved watchlists, and options links.',
    settings: 'Settings',
    signOut: 'Sign out',
    appSettings: 'App settings',
    language: 'Language',
    english: 'English',
    hindi: 'Hindi',
    search: 'Search',
    searching: 'Searching...',
    yahooSearch: 'Yahoo search',
    addWatchlist: '+ Add to watchlist',
    volume: 'Volume',
    supportResistance: 'Support & resistance',
    timeframe: 'Chart timeframe',
    strategy: 'Signal strategy',
  },
  hi: {
    appTitle: 'स्टॉक तकनीकी विश्लेषण',
    appSummary: 'इंट्राडे इंटरवल, सेव्ड वॉचलिस्ट और ऑप्शन लिंक के साथ Yahoo Finance खोज और चार्ट डेटा।',
    settings: 'सेटिंग्स',
    signOut: 'साइन आउट',
    appSettings: 'ऐप सेटिंग्स',
    language: 'भाषा',
    english: 'अंग्रेज़ी',
    hindi: 'हिंदी',
    search: 'खोजें',
    searching: 'खोज रहे हैं...',
    yahooSearch: 'Yahoo खोज',
    addWatchlist: '+ वॉचलिस्ट में जोड़ें',
    volume: 'वॉल्यूम',
    supportResistance: 'सपोर्ट और रेजिस्टेंस',
    timeframe: 'चार्ट टाइमफ्रेम',
    strategy: 'सिग्नल स्ट्रैटजी',
  },
};

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
};

const FOREX_CRYPTO_INSTRUMENTS = [
  { symbol: 'EUR/USD', yahooSymbol: 'EURUSD=X', exchange: 'FX', currency: 'USD', instrument_name: 'Euro / US Dollar', assetClass: 'Forex' },
  { symbol: 'GBP/USD', yahooSymbol: 'GBPUSD=X', exchange: 'FX', currency: 'USD', instrument_name: 'British Pound / US Dollar', assetClass: 'Forex' },
  { symbol: 'USD/JPY', yahooSymbol: 'USDJPY=X', exchange: 'FX', currency: 'JPY', instrument_name: 'US Dollar / Japanese Yen', assetClass: 'Forex' },
  { symbol: 'BTC/USD', yahooSymbol: 'BTC-USD', exchange: 'CRYPTO', currency: 'USD', instrument_name: 'Bitcoin', assetClass: 'Crypto' },
  { symbol: 'ETH/USD', yahooSymbol: 'ETH-USD', exchange: 'CRYPTO', currency: 'USD', instrument_name: 'Ethereum', assetClass: 'Crypto' },
  { symbol: 'SOL/USD', yahooSymbol: 'SOL-USD', exchange: 'CRYPTO', currency: 'USD', instrument_name: 'Solana', assetClass: 'Crypto' },
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

function formatBacktestPrice(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value))
    ? Number(value).toFixed(2)
    : '—';
}

function buildHistoricalMarkersFallback({
  candles,
  interval,
  timeZone,
  strategy,
  levelLookback,
  ema9,
  ema21,
}) {
  const markers = [];
  const atrByTime = new Map(calculateATR(candles, 14, { interval, timeZone }).map((point) => [point.time, point.value]));
  const ema9ByTime = new Map(ema9.map((point) => [point.time, point.value]));
  const ema21ByTime = new Map(ema21.map((point) => [point.time, point.value]));
  candles.forEach((candle, index) => {
    if (index < 20) return;
    const history = candles.slice(Math.max(0, index - levelLookback + 1), index + 1);
    const historyLevels = findSupportResistance(history, levelLookback, { interval, timeZone });
    const historicalPriceAction = strategy === 'price-action'
      ? getPriceActionContext(candles.slice(0, index + 1), index)
      : undefined;
    const historicalSignals = evaluateEntrySignals({
      candles: candles.slice(0, index + 1),
      index,
      ema9: ema9ByTime.get(candle.time),
      ema21: ema21ByTime.get(candle.time),
      atr: atrByTime.get(candle.time) || 0,
      supports: historyLevels.supports,
      resistances: historyLevels.resistances,
      strategy,
      priceAction: historicalPriceAction,
      timeZone,
      levelLookback,
    });
    if (historicalSignals.longSignal) markers.push({
      time: candle.time, position: 'belowBar', shape: 'arrowUp',
      text: strategy === 'liquidity-sweep' ? '▲ Sweep Long' : strategy === 'price-action' ? '▲ FVG/OB Long' : '▲ Long',
    });
    if (historicalSignals.shortSignal) markers.push({
      time: candle.time, position: 'aboveBar', shape: 'arrowDown',
      text: strategy === 'liquidity-sweep' ? '▼ Sweep Short' : strategy === 'price-action' ? '▼ FVG/OB Short' : '▼ Short',
    });
  });
  return markers;
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
  const autoSelectionKeyRef = useRef('');
  const signalCacheRef = useRef(null);
  const priceLinesRef = useRef([]);
  const markerPluginRef = useRef(null);
  const analysisWorkerRef = useRef(null);
  const workerTaskIdRef = useRef(0);
  const workerPendingRef = useRef(new Map());
  function runAnalysisWorker(type, payload) {
    if (typeof Worker === 'undefined') {
      if (type === 'chart') {
        const markers = buildHistoricalMarkersFallback(payload);
        return Promise.resolve({
          markers,
          backtest: backtestSignals(payload.candles, {
            interval: payload.interval,
            timeZone: payload.timeZone,
            strategy: payload.strategy,
            levelLookback: payload.levelLookback,
            brokeragePerOrder: payload.brokeragePerOrder || 0,
            slippagePercent: payload.slippagePercent || 0,
          }),
        });
      }
      if (type === 'backtest') return Promise.resolve(backtestSignals(payload.candles, payload.options));
      if (type === 'backtestSymbols') return Promise.resolve(backtestSymbols(payload.symbolCandles, payload.options));
    }
    if (!analysisWorkerRef.current) {
      analysisWorkerRef.current = new Worker(new URL('./workers/analysisWorker.js', import.meta.url), { type: 'module' });
      analysisWorkerRef.current.addEventListener('message', (event) => {
        const pending = workerPendingRef.current.get(event.data.id);
        if (!pending) return;
        workerPendingRef.current.delete(event.data.id);
        if (event.data.error) pending.reject(new Error(event.data.error));
        else pending.resolve(event.data.result);
      });
      analysisWorkerRef.current.addEventListener('error', (event) => {
        workerPendingRef.current.forEach((pending) => pending.reject(event.error || new Error('Analysis worker failed.')));
        workerPendingRef.current.clear();
      });
    }
    const id = ++workerTaskIdRef.current;
    return new Promise((resolve, reject) => {
      workerPendingRef.current.set(id, { resolve, reject });
      analysisWorkerRef.current.postMessage({ id, type, payload });
    });
  }
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
  const brokeragePerOrderRef = useRef(brokeragePerOrder);
  const slippagePercentRef = useRef(slippagePercent);
  const [moveStopToBreakeven, setMoveStopToBreakeven] = useState(false);
  const [tradeDirection, setTradeDirection] = useState('Long');
  const [selectedStrategy, setSelectedStrategy] = useState(() => {
    const saved = loadPreference('techstock-signal-strategy', 'support-resistance');
    return ['price-action', 'liquidity-sweep'].includes(saved) ? saved : 'support-resistance';
  });
  const [strategyAutoMode, setStrategyAutoMode] = useState(
    () => loadPreference('techstock-signal-strategy-auto', 'auto') === 'auto',
  );
  const [activeTab, setActiveTab] = useState(() => {
    const saved = loadPreference('techstock-workspace-tab', 'home');
    return ['home', 'chart', 'ideas', 'report', 'history', 'paper', 'options', 'forex-crypto'].includes(saved) ? saved : 'home';
  });
  const [showPreferences, setShowPreferences] = useState(false);
  const [tradeHistory, setTradeHistory] = useTradeHistory();
  const [historyMessage, setHistoryMessage] = useState('');
  const [theme, setTheme] = useState(() => {
    const savedTheme = loadPreference('techstock-theme', 'dark');
    return AVAILABLE_THEMES.includes(savedTheme) ? savedTheme : 'dark';
  });
  const [language, setLanguage] = useState(() => {
    const savedLanguage = loadPreference('techstock-language', 'en');
    return AVAILABLE_LANGUAGES.includes(savedLanguage) ? savedLanguage : 'en';
  });
  const text = UI_TEXT[language];
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
  const [watchlistBacktest, setWatchlistBacktest] = useState(null);
  const [watchlistBacktestResult, setWatchlistBacktestResult] = useState(null);
  const [watchlistBacktestLoading, setWatchlistBacktestLoading] = useState(false);
  const [watchlistBacktestIssues, setWatchlistBacktestIssues] = useState([]);
  const watchlistBacktestCacheRef = useRef(new Map());
  const crosshairLegendRef = useRef(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [marketTradingPeriod, setMarketTradingPeriod] = useState(null);
  const [marketClock, setMarketClock] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [autoRefreshSeconds, setAutoRefreshSeconds] = useState(30);
  const [refreshKey, setRefreshKey] = useState(0);
  const [watchlistQuotes, setWatchlistQuotes] = useState({});
  const watchlistQuoteCacheRef = useRef(new Map());
  const [forexCryptoQuotes, setForexCryptoQuotes] = useState({});
  const [forexCryptoRefreshStatus, setForexCryptoRefreshStatus] = useState({ loading: false, error: '', updatedAt: null });
  const [forexCryptoRefreshKey, setForexCryptoRefreshKey] = useState(0);
  const { startScan, cancelScan } = useScanner(market, activeTab);
  const symbolMarketKey = `${getYahooSymbol(selectedStock, market)}|${market}`;
  useEffect(() => {
    if (
      !watchlistBacktest
      || watchlistBacktest.market !== market
      || watchlistBacktest.timeframe !== timeframe
      || watchlistBacktest.strategy !== selectedStrategy
      || watchlistBacktest.selectedSymbol !== getYahooSymbol(selectedStock, market)
    ) {
      setWatchlistBacktestResult(null);
      return undefined;
    }
    let cancelled = false;
    runAnalysisWorker('backtestSymbols', {
      symbolCandles: watchlistBacktest.symbols,
      options: {
        interval: timeframe,
        strategy: selectedStrategy,
        levelLookback: getSignalLevelLookback(timeframe),
        brokeragePerOrder: Number(brokeragePerOrder) || 0,
        slippagePercent: Number(slippagePercent) || 0,
      },
    }).then((result) => {
      if (!cancelled) setWatchlistBacktestResult(result);
    }).catch((error) => {
      if (!cancelled) console.error('Watchlist backtest failed.', error);
    });
    return () => { cancelled = true; };
  }, [watchlistBacktest, market, timeframe, selectedStrategy, selectedStock, brokeragePerOrder, slippagePercent]);
  // Toggles
  const [showVolume, setShowVolume] = useState(true);
  const [showSR, setShowSR] = useState(true);
  const [showEMA, setShowEMA] = useState(true);
  const [showVWAP, setShowVWAP] = useState(true);
  const [showRSI, setShowRSI] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);

  useEffect(() => {
    latestTradeHistoryRef.current = tradeHistory;
  }, [tradeHistory]);

  useEffect(() => {
    brokeragePerOrderRef.current = brokeragePerOrder;
    slippagePercentRef.current = slippagePercent;
  }, [brokeragePerOrder, slippagePercent]);

  useEffect(() => {
    if (analysis?.setupDirection) {
      setTradeDirection(analysis.setupDirection);
    }
  }, [analysis?.setupDirection]);

  useEffect(() => () => {
    analysisWorkerRef.current?.terminate();
  }, []);

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
    document.documentElement.lang = language === 'hi' ? 'hi' : 'en';
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      themeColor('--bg'),
    );
    try {
      localStorage.setItem('techstock-theme', theme);
    } catch (error) {
      console.error('Unable to save theme preference.', error);
    }
  }, [theme, language]);

  useEffect(() => {
    try {
      localStorage.setItem('techstock-language', language);
    } catch (error) {
      console.error('Unable to save language preference.', error);
    }
  }, [language]);

  useEffect(() => {
    try {
      localStorage.setItem('techstock-signal-strategy', selectedStrategy);
    } catch (error) {
      console.error('Unable to save signal strategy preference.', error);
    }
  }, [selectedStrategy]);

  useEffect(() => {
    try {
      localStorage.setItem('techstock-signal-strategy-auto', strategyAutoMode ? 'auto' : 'manual');
    } catch (error) {
      console.error('Unable to save signal strategy mode preference.', error);
    }
  }, [strategyAutoMode]);

  useEffect(() => {
    if (!strategyAutoMode) {
      autoSelectionKeyRef.current = '';
      return;
    }
    const currentSymbol = getYahooSymbol(selectedStock, market);
    if (!analysis?.trend || analysis.symbol !== currentSymbol) return;
    if (autoSelectionKeyRef.current === symbolMarketKey) return;

    autoSelectionKeyRef.current = symbolMarketKey;
    const nextStrategy = analysis.trend === 'Sideways' || analysis.trend === 'Unavailable'
      ? 'support-resistance'
      : 'price-action';
    const nextTimeframe = nextStrategy === 'support-resistance'
      ? '1h'
      : ['Bullish', 'Bearish'].includes(analysis.trend)
        && ['Bullish', 'Bearish'].includes(analysis.higherTrend)
        && analysis.trend !== analysis.higherTrend
        ? '15min'
        : '5min';

    setSelectedStrategy((current) => (current === nextStrategy ? current : nextStrategy));
    setTimeframe((current) => (current === nextTimeframe ? current : nextTimeframe));
  }, [strategyAutoMode, analysis?.trend, analysis?.higherTrend, analysis?.symbol, selectedStock, market, symbolMarketKey]);

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
      const matchingIndices = market === 'India' ? searchIndianIndices(query) : [];
      if (matchingIndices.length) {
        setSearchResults(matchingIndices);
        return;
      }

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
        const nearSupportLevel = nearestSupport &&
          Math.abs(close - nearestSupport.price) <= Math.max(atr * 0.5, close * 0.002);
        const nearResistanceLevel = nearestResistance &&
          Math.abs(close - nearestResistance.price) <= Math.max(atr * 0.5, close * 0.002);
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
      timeScale: {
        borderColor: palette.grid,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
        minBarSpacing: 2,
      },
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: palette.up, downColor: palette.down, borderVisible: false,
      wickUpColor: palette.up, wickDownColor: palette.down,
      priceLineVisible: true,
      priceScaleMargins: { top: 0.08, bottom: 0.08 },
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
    series.ema9Series.applyOptions({ visible: showEMA });
    series.ema21Series.applyOptions({ visible: showEMA });
    series.vwapSeries.applyOptions({ visible: showVWAP });
    series.rsiSeries.applyOptions({ visible: showRSI });
    const panes = series.chart.panes();
    if (panes[1]) panes[1].setStretchFactor(showVolume ? 0.15 : 0.001);
    if (panes[2]) panes[2].setStretchFactor(showRSI ? 0.25 : 0.001);
    if (showMarkers) {
      const data = latestChartDataRef.current;
      markerPluginRef.current?.setMarkers(
        (data?.markers || []).map((marker) => ({ ...marker, color: resolveMarkerColor(marker) })),
      );
    } else {
      markerPluginRef.current?.setMarkers([]);
    }
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
    if (showZones && data.strategy === 'liquidity-sweep') {
      const pools = [
        ...(data.liquidityPools?.supports || []).slice(0, 2),
        ...(data.liquidityPools?.resistances || []).slice(0, 2),
      ];
      pools.forEach((pool) => addLine(series.candleSeries, {
        price: pool.price,
        color: themeColor(pool.price < Number(analysis?.price) ? '--up' : '--down'),
        lineWidth: 1,
        lineStyle: 3,
        axisLabelVisible: true,
        title: pool.type,
      }));
    }
    if (showZones) (data.priceActionZones || []).forEach((zone) => {
      const color = zone.type === 'FVG'
        ? themeColor(zone.direction === 'Long' ? '--accent' : '--warn')
        : themeColor(zone.direction === 'Long' ? '--up' : '--down');
      const prefix = zone.type === 'FVG' ? 'FVG' : 'OB';
      [zone.lower, zone.upper].forEach((price, index) => addLine(series.candleSeries, {
        price,
        color,
        lineWidth: 1,
        lineStyle: 3,
        axisLabelVisible: true,
        title: `${prefix} ${zone.direction === 'Long' ? '↑' : '↓'} ${index ? 'U' : 'L'}`,
      }));
    });
    const lineEntry = Number(analysis?.price || 0);
    const currentLevels = analysis
      ? selectedStrategy === 'liquidity-sweep' && analysis.setupDirection && analysis.liquiditySweep
        ? buildLiquiditySweepTradeLevels({
          direction: analysis.setupDirection,
          entry: lineEntry,
          sweepExtreme: analysis.liquiditySweep.sweepExtreme,
          supports: analysis.liquidityPools?.supports || analysis.supports,
          resistances: analysis.liquidityPools?.resistances || analysis.resistances,
        })
        : buildTradeLevels({
          direction: tradeDirection,
          entry: lineEntry,
          atr: Number(analysis.atr || 0),
          supports: analysis.supports,
          resistances: analysis.resistances,
        })
      : null;
    if (analysis && lineEntry > 0 && currentLevels) {
      if (selectedStrategy === 'liquidity-sweep' && analysis.liquiditySweep) {
        addLine(series.candleSeries, {
          price: analysis.liquiditySweep.level,
          title: analysis.liquiditySweep.poolType,
          color: themeColor('--warn'),
          lineWidth: 2,
          lineStyle: 2,
          axisLabelVisible: true,
        });
      }
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
  }, [showVolume, showSR, showEMA, showVWAP, showRSI, showZones, showMarkers, analysis, tradeDirection, selectedStrategy, theme, isAuthenticated, activeTab]);

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
        if (result?.meta?.symbol && result.meta.symbol !== yahooSymbol) {
          throw new Error(`Yahoo returned ${result.meta.symbol} instead of ${yahooSymbol}.`);
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
        const levelLookback = getSignalLevelLookback(timeframe);
        const levels = findSupportResistance(signalCandles, levelLookback, { interval: timeframe, timeZone });
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
        const priceAction = getPriceActionContext(signalCandles);
        const priceActionZones = [
          priceAction.bullishFvg,
          priceAction.bearishFvg,
          priceAction.bullishOrderBlock,
          priceAction.bearishOrderBlock,
        ].filter(Boolean);
        const entrySignals = evaluateEntrySignals({
          candles: signalCandles,
          ema9: lastEma9,
          ema21: lastEma21,
          atr: lastAtr,
          supports: levels.supports,
          resistances: levels.resistances,
          strategy: selectedStrategy,
          priceAction,
          timeZone,
          levelLookback,
        });
        const { support: nearestSupport, resistance: nearestResistance } = entrySignals;
        const { nearSupport, nearResistance, longSignal: bullishSignal, shortSignal: bearishSignal } = entrySignals;
        const usesPriceAction = selectedStrategy === 'price-action';
        const usesLiquiditySweep = selectedStrategy === 'liquidity-sweep';
        const activeSweep = bullishSignal
          ? entrySignals.liquiditySweep.long
          : bearishSignal
            ? entrySignals.liquiditySweep.short
            : null;
        const directionPoints = (direction) => {
          const isLong = direction === 'Long';
          const trendMatch = currentTrend === (isLong ? 'Bullish' : 'Bearish') && higherTrend === currentTrend;
          const emaMatch = isLong ? lastEma9 > lastEma21 : lastEma9 < lastEma21;
          const vwapMatch = lastVwap === null ? false : isLong ? lastClose > lastVwap : lastClose < lastVwap;
          const levelNear = isLong ? nearSupport : nearResistance;
          const signalMatch = isLong ? bullishSignal : bearishSignal;
          const rsiMatch = isLong ? lastRsi >= 50 && lastRsi <= 70 : lastRsi >= 30 && lastRsi <= 50;
          const fvgRetest = isLong ? priceAction.longFvgRetest : priceAction.shortFvgRetest;
          const orderBlockRetest = isLong ? priceAction.longOrderBlockRetest : priceAction.shortOrderBlockRetest;
          const priceActionPoints = fvgRetest && orderBlockRetest ? 25
            : fvgRetest || orderBlockRetest ? 15
              : 0;
          if (usesLiquiditySweep) {
            return (isLong ? entrySignals.longConditions : entrySignals.shortConditions)
              .map((condition) => ({
                label: condition.label,
                points: condition.passed ? 100 / entrySignals.longConditions.length : 0,
                maxPoints: 100 / entrySignals.longConditions.length,
                reason: condition.passed ? 'Confirmed on the latest completed candle.' : 'Waiting for this condition.',
              }));
          }
          if (!usesPriceAction) {
            return [
              { label: 'Trend alignment', points: trendMatch ? 25 : 0, maxPoints: 25, reason: trendMatch ? `${currentTrend} chart and ${higherLabel} trends agree.` : 'Chart and higher-timeframe trends do not align.' },
              { label: 'EMA alignment', points: emaMatch ? 15 : 0, maxPoints: 15, reason: emaMatch ? `EMA 9 is aligned for ${direction.toLowerCase()}.` : 'EMA 9/21 alignment does not support this direction.' },
              { label: 'VWAP side', points: vwapMatch ? 15 : 0, maxPoints: 15, reason: lastVwap === null ? 'VWAP unavailable for this timeframe.' : vwapMatch ? `Price is on the ${direction.toLowerCase()} side of VWAP.` : 'Price is on the opposing side of VWAP.' },
              { label: 'S/R confirmation', points: signalMatch ? 25 : levelNear ? 12 : 0, maxPoints: 25, reason: signalMatch ? `Confirmed ${direction.toLowerCase()} candle near structure.` : levelNear ? 'Near a level without full candle confirmation.' : 'No nearby confirming level.' },
              { label: 'RSI', points: rsiMatch ? 20 : 0, maxPoints: 20, reason: rsiMatch ? `RSI ${lastRsi.toFixed(1)} supports ${direction.toLowerCase()} conditions.` : `RSI ${lastRsi.toFixed(1)} is outside the directional range.` },
            ];
          }
          return [
            { label: 'Trend alignment', points: trendMatch ? 20 : 0, maxPoints: 20, reason: trendMatch ? `${currentTrend} chart and ${higherLabel} trends agree.` : 'Chart and higher-timeframe trends do not align.' },
            { label: 'EMA alignment', points: emaMatch ? 10 : 0, maxPoints: 10, reason: emaMatch ? `EMA 9 is aligned for ${direction.toLowerCase()}.` : 'EMA 9/21 alignment does not support this direction.' },
            { label: 'VWAP side', points: vwapMatch ? 10 : 0, maxPoints: 10, reason: lastVwap === null ? 'VWAP unavailable for this timeframe.' : vwapMatch ? `Price is on the ${direction.toLowerCase()} side of VWAP.` : 'Price is on the opposing side of VWAP.' },
            { label: 'S/R confirmation', points: signalMatch ? 20 : levelNear ? 10 : 0, maxPoints: 20, reason: signalMatch ? `Confirmed ${direction.toLowerCase()} candle near support/resistance with an FVG or order-block retest.` : levelNear ? 'Near a level without full confirmation.' : 'No nearby confirming level.' },
            { label: 'RSI', points: rsiMatch ? 15 : 0, maxPoints: 15, reason: rsiMatch ? `RSI ${lastRsi.toFixed(1)} supports ${direction.toLowerCase()} conditions.` : `RSI ${lastRsi.toFixed(1)} is outside the directional range.` },
            {
              label: 'FVG / order-block retest',
              points: priceActionPoints,
              maxPoints: 25,
              reason: priceActionPoints
                ? `${fvgRetest ? 'FVG' : ''}${fvgRetest && orderBlockRetest ? ' and ' : ''}${orderBlockRetest ? 'order block' : ''} retest confirmed.`
                : 'No confirmed retest of an active FVG or order block.',
            },
          ];
        };
        const longScoreDetails = directionPoints('Long');
        const shortScoreDetails = directionPoints('Short');
        const longScore = longScoreDetails.reduce((sum, item) => sum + item.points, 0);
        const shortScore = shortScoreDetails.reduce((sum, item) => sum + item.points, 0);
        const entryIdea = usesLiquiditySweep
          ? activeSweep
            ? `${activeSweep.poolType} at ${activeSweep.level} swept and reclaimed; structure shifted. Stop reference: sweep ${activeSweep.direction === 'Long' ? 'low' : 'high'} at ${activeSweep.sweepExtreme}.`
            : 'Wait for price to sweep a swing, equal-high/low, prior-period, or nearby round-number pool, then reclaim it with rejection and close beyond the prior candle extreme.'
          : bullishSignal
          ? usesPriceAction
            ? `Closed candle confirmed near support at ${nearestSupport.price} with an FVG or order-block retest.`
            : `Closed candle confirmed near support at ${nearestSupport.price}.`
          : bearishSignal
            ? usesPriceAction
              ? `Closed candle confirmed near resistance at ${nearestResistance.price} with an FVG or order-block retest.`
              : `Closed candle confirmed near resistance at ${nearestResistance.price}.`
            : nearSupport
              ? usesPriceAction
                ? `Price is near support at ${nearestSupport.price}; wait for a closed-candle FVG or order-block retest.`
                : `Price is near support at ${nearestSupport.price}, without a closed-candle confirmation.`
              : nearResistance
                ? usesPriceAction
                  ? `Price is near resistance at ${nearestResistance.price}; wait for a closed-candle FVG or order-block retest.`
                  : `Price is near resistance at ${nearestResistance.price}, without a closed-candle confirmation.`
                : usesPriceAction
                  ? 'Wait for support/resistance, trend, and a closed-candle FVG or order-block retest to align.'
                  : 'Wait for a closed candle near a relevant level with trend confirmation.';
        const signalKey = `${selectedStrategy}|${yahooSymbol}|${timeframe}|${brokeragePerOrderRef.current}|${slippagePercentRef.current}|${signalCandles.at(-1)?.time ?? 'none'}`;
        let signalMarkers;
        let backtest;
        if (signalCacheRef.current?.key === signalKey) {
          ({ markers: signalMarkers, backtest } = signalCacheRef.current);
        } else {
          const analysisResult = await runAnalysisWorker('chart', {
            candles: signalCandles,
            interval: timeframe,
            timeZone,
            strategy: selectedStrategy,
            levelLookback,
            ema9,
            ema21,
            brokeragePerOrder: Number(brokeragePerOrderRef.current) || 0,
            slippagePercent: Number(slippagePercentRef.current) || 0,
          });
          if (isCancelled()) return;
          signalMarkers = analysisResult.markers;
          backtest = analysisResult.backtest;
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
          liquidityPools: entrySignals.liquidityPools,
          priceActionZones, signalMarkers, markers, timeZone,
          signalCandles, symbol: yahooSymbol, interval: timeframe,
          strategy: selectedStrategy, levelLookback,
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
        const activeDirection = bullishSignal ? 'Long' : bearishSignal ? 'Short' : null;
        const checklistDirection = activeDirection || (longScore >= shortScore ? 'Long' : 'Short');
        const activeScore = checklistDirection === 'Long' ? longScore : shortScore;
        const entryChecklist = checklistDirection === 'Long' ? entrySignals.longConditions : entrySignals.shortConditions;
        setAnalysis({
          symbol: yahooSymbol,
          price: lastClose.toFixed(2),
          currency: result.meta?.currency || selectedStock.currency || (market === 'India' ? 'INR' : 'USD'),
          trend: currentTrend,
          higherTrend,
          higherLabel,
          rsi: lastRsi.toFixed(1),
          rsiStatus: lastRsi >= 70 ? 'Overbought' : lastRsi <= 30 ? 'Oversold' : 'Neutral',
          atr: lastAtr.toFixed(2),
          supports: levels.supports,
          resistances: levels.resistances,
          dailyLevels,
          priceAction,
          ema9: lastEma9.toFixed(2),
          ema21: lastEma21.toFixed(2),
          vwap: lastVwap?.toFixed(2) || null,
          setupScore: activeScore,
          setupDirection: activeDirection,
          checklistDirection,
          entryChecklist,
          strategyName: usesLiquiditySweep
            ? 'Liquidity sweep + structure shift'
            : usesPriceAction ? 'FVG & order-block confluence' : 'Support & resistance',
          liquiditySweep: activeSweep,
          liquidityPools: entrySignals.liquidityPools,
          timeZone,
          timeframe,
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
  }, [isAuthenticated, activeTab, selectedStock, market, timeframe, yahooApiBaseUrl, refreshKey, selectedStrategy, setTradeHistory]);

  useEffect(() => {
    const data = latestChartDataRef.current;
    if (
      !data?.signalCandles
      || data.symbol !== getYahooSymbol(selectedStock, market)
      || data.interval !== timeframe
      || data.strategy !== selectedStrategy
    ) return;
    let cancelled = false;
    runAnalysisWorker('backtest', {
      candles: data.signalCandles,
      options: {
        interval: data.interval,
        timeZone: data.timeZone,
        strategy: data.strategy,
        levelLookback: data.levelLookback,
        brokeragePerOrder: Number(brokeragePerOrder) || 0,
        slippagePercent: Number(slippagePercent) || 0,
      },
    }).then((result) => {
      if (!cancelled) setBacktestResult(result);
    }).catch((error) => console.error('Backtest failed.', error));
    return () => { cancelled = true; };
  }, [brokeragePerOrder, slippagePercent, selectedStock, market, timeframe, selectedStrategy]);

  useEffect(() => {
    const chartData = latestChartDataRef.current;
    if (!chartData || !markerPluginRef.current) return;
    const symbol = getYahooSymbol(selectedStock, market);
    if (chartData.symbol !== symbol || chartData.interval !== timeframe) return;
    const markers = showMarkers ? buildAllMarkers(
      chartData.signalMarkers,
      tradeHistory.filter((trade) => trade.symbol === symbol && trade.interval === timeframe),
      chartData.candles,
    ) : [];
    latestChartDataRef.current = { ...chartData, markers };
    markerPluginRef.current.setMarkers(markers.map((marker) => ({ ...marker, color: resolveMarkerColor(marker) })));
  }, [tradeHistory, selectedStock, market, timeframe, theme, showMarkers]);

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

  useEffect(() => {
    if (!isAuthenticated || activeTab !== 'forex-crypto') return undefined;
    let cancelled = false;
    let intervalId;
    const loadQuotes = async (force = false) => {
      setForexCryptoRefreshStatus((current) => ({ ...current, loading: true, error: '' }));
      const nextQuotes = {};
      let firstError = '';
      for (const instrument of FOREX_CRYPTO_INSTRUMENTS) {
        try {
          const params = new URLSearchParams({ interval: '1d', range: '5d', events: 'div,splits' });
          const data = await fetchYahooJson(
            `/api/yahoo/v8/finance/chart/${encodeURIComponent(instrument.yahooSymbol)}?${params}`,
            yahooApiBaseUrl,
            { force },
          );
          if (cancelled) return;
          const result = data.chart?.result?.[0];
          const candles = parseYahooCandles(result);
          const meta = result?.meta || {};
          const price = Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : candles.at(-1)?.close;
          const previousClose = candles.at(-2)?.close;
          if (Number.isFinite(price)) {
            nextQuotes[instrument.yahooSymbol] = {
              price,
              changePercent: Number.isFinite(previousClose) && previousClose !== 0
                ? (price - previousClose) / previousClose * 100
                : null,
            };
          }
        } catch (error) {
          if (!firstError) firstError = error.message || `Unable to load ${instrument.symbol}.`;
          if (!cancelled && error.message?.includes('(HTTP 429)')) break;
        }
      }
      if (cancelled) return;
      setForexCryptoQuotes((current) => ({ ...current, ...nextQuotes }));
      setForexCryptoRefreshStatus({
        loading: false,
        error: firstError,
        updatedAt: new Date().toISOString(),
      });
    };

    loadQuotes(forexCryptoRefreshKey > 0);
    intervalId = window.setInterval(() => loadQuotes(false), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isAuthenticated, activeTab, yahooApiBaseUrl, forexCryptoRefreshKey]);

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

  async function runWatchlistBacktest() {
    const intervalCode = {
      '1min': '1m', '2min': '2m', '5min': '5m', '15min': '15m',
      '30min': '30m', '1h': '60m', '90min': '90m', '1day': '1d',
      '1week': '1wk', '1month': '1mo',
    }[timeframe];
    const range = {
      '1min': '7d', '2min': '1mo', '5min': '1mo', '15min': '1mo',
      '30min': '1mo', '1h': '1mo', '90min': '1mo', '1day': '1y',
      '1week': '5y', '1month': '10y',
    }[timeframe];
    const selectedSymbol = getYahooSymbol(selectedStock, market);
    const stocks = [selectedStock, ...(watchlists[market] || [])]
      .filter((stock) => stock && stock.instrumentType !== 'INDEX');
    const uniqueStocks = [...new Map(stocks.map((stock) => [getYahooSymbol(stock, market), stock])).values()]
      .slice(0, 5);
    const symbols = [];
    const issues = [];

    setWatchlistBacktest(null);
    setWatchlistBacktestIssues([]);
    setWatchlistBacktestLoading(true);
    try {
      for (const stock of uniqueStocks) {
        const yahooSymbol = getYahooSymbol(stock, market);
        const cacheKey = `${yahooSymbol}|${timeframe}|${range}`;
        const cached = watchlistBacktestCacheRef.current.get(cacheKey);
        try {
          let candles;
          let timeZone;
          const currentChartData = latestChartDataRef.current;
          if (currentChartData?.symbol === yahooSymbol && currentChartData.interval === timeframe) {
            candles = currentChartData.signalCandles;
            timeZone = currentChartData.timeZone;
          } else if (cached && cached.expiresAt > Date.now()) {
            ({ candles, timeZone } = cached);
          } else {
            const params = new URLSearchParams({ interval: intervalCode, range, events: 'div,splits' });
            const data = await fetchYahooJson(
              `/api/yahoo/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?${params}`,
              yahooApiBaseUrl,
            );
            const result = data.chart?.result?.[0];
            if (data.chart?.error || !result) {
              throw new Error(data.chart?.error?.description || 'No chart data was returned.');
            }
            candles = getClosedCandles(parseYahooCandles(result), result, timeframe, Date.now());
            timeZone = result.meta?.exchangeTimezoneName || (market === 'India' ? 'Asia/Kolkata' : 'America/New_York');
            watchlistBacktestCacheRef.current.set(cacheKey, {
              candles,
              timeZone,
              expiresAt: Date.now() + 5 * 60_000,
            });
          }
          if (!Array.isArray(candles) || candles.length < 24) {
            throw new Error('Fewer than 24 closed candles are available.');
          }
          symbols.push({ symbol: stock.symbol, candles, timeZone });
        } catch (error) {
          issues.push(`${stock.symbol}: ${error.message || 'Historical data unavailable.'}`);
          if (error.message?.includes('(HTTP 429)')) break;
        }
      }

      if (symbols.length === 0) {
        issues.push('No symbols had enough historical data to test.');
      }
      setWatchlistBacktest({
        market,
        timeframe,
        strategy: selectedStrategy,
        selectedSymbol,
        symbols,
      });
      setWatchlistBacktestIssues(issues);
    } catch (error) {
      setWatchlistBacktestIssues([error.message || 'Unable to run the watchlist backtest.']);
    } finally {
      setWatchlistBacktestLoading(false);
    }
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
    ? selectedStrategy === 'liquidity-sweep' && analysis.setupDirection && analysis.liquiditySweep
      ? buildLiquiditySweepTradeLevels({
        direction: analysis.setupDirection,
        entry: entryPrice,
        sweepExtreme: analysis.liquiditySweep.sweepExtreme,
        supports: analysis.supports,
        resistances: analysis.resistances,
      })
      : buildTradeLevels({
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
  const stopRiskPercent = entryPrice > 0 ? riskPerShare / entryPrice * 100 : 0;
  const target1Percent = entryPrice > 0 ? Math.abs(tradeLevels.target1 - entryPrice) / entryPrice * 100 : 0;
  const target2Percent = entryPrice > 0 ? Math.abs(tradeLevels.target2 - entryPrice) / entryPrice * 100 : 0;
  const target1RiskReward = riskPerShare > 0 ? Math.abs(tradeLevels.target1 - entryPrice) / riskPerShare : 0;
  const target2RiskReward = riskPerShare > 0 ? Math.abs(tradeLevels.target2 - entryPrice) / riskPerShare : 0;
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
          <h1 className="app-title">{text.appTitle}</h1>
          <p className="app-summary">
            {text.appSummary}
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
            {text.settings}
          </button>
          <button type="button" className="logout-button" onClick={handleLogout}>{text.signOut}</button>
        </div>
      </header>

      {showPreferences && (
        <section id="app-preferences" className="scanner-panel preferences-panel" aria-label="App settings">
          <div className="preferences-heading">
            <div>
              <h2>{text.appSettings}</h2>
              <p>Choose a comfortable theme and configure the market-data proxy used by this device.</p>
            </div>
            <button type="button" className="preferences-close" onClick={() => setShowPreferences(false)} aria-label="Close settings">×</button>
          </div>
          <div className="preferences-grid">
            <label className="preference-field">
              {text.language}
              <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                <option value="en">{text.english}</option>
                <option value="hi">{text.hindi}</option>
              </select>
              <small>{language === 'hi' ? 'मुख्य इंटरफ़ेस अब हिंदी में उपलब्ध है।' : 'Choose the language for the main interface.'}</small>
            </label>
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
          placeholder={market === 'India' ? 'Company, ticker, or index (e.g. TCS, NIFTY)' : 'Company or ticker (e.g. AAPL)'}
          aria-label={market === 'India' ? 'Search stocks and indices' : 'Search stocks'}
          className="stock-search-input"
        />

        <button
          onClick={searchStocks}
          disabled={searching}
          className="primary-button"
        >
          {searching ? text.searching : text.search}
        </button>

        <a
          href={`https://finance.yahoo.com/lookup/?query=${encodeURIComponent(searchQuery)}`}
          target="_blank"
          rel="noreferrer"
          className="external-link"
        >
          {text.yahooSearch}
        </a>

        <div className="timeframe-control" role="group" aria-label={text.timeframe}>
          {[['1min', '1m'], ['2min', '2m'], ['5min', '5m'], ['15min', '15m'], ['30min', '30m'], ['1h', '1h'], ['90min', '90m'], ['1day', '1D'], ['1week', '1W'], ['1month', '1M']].map(([value, label]) => (
            <button type="button" key={value} aria-pressed={timeframe === value} className={timeframe === value ? 'timeframe-button selected' : 'timeframe-button'} onClick={() => {
              setStrategyAutoMode(false);
              setTimeframe(value);
            }}>
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={() => addToWatchlist()}
          className="secondary-button"
        >
          {text.addWatchlist}
        </button>

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

      {activeTab !== 'options' && activeTab !== 'forex-crypto' && searchError && (
        <p className="search-error" role="status">
          {searchError}
        </p>
      )}

      {activeTab !== 'options' && activeTab !== 'forex-crypto' && searchResults.length > 0 && (
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
                onClick={() => stock.instrumentType === 'INDEX' ? addToWatchlist(stock) : addToIntradayList(stock)}
                disabled={stock.instrumentType === 'INDEX'
                  ? (watchlists[market] || []).some((item) => getYahooSymbol(item, market) === getYahooSymbol(stock, market))
                  : (customScannerStocks[market] || []).some((item) => getYahooSymbol(item, market) === getYahooSymbol(stock, market))}
              >
                {stock.instrumentType === 'INDEX'
                  ? (watchlists[market] || []).some((item) => getYahooSymbol(item, market) === getYahooSymbol(stock, market))
                    ? 'Added'
                    : '+ Watchlist'
                  : (customScannerStocks[market] || []).some((item) => getYahooSymbol(item, market) === getYahooSymbol(stock, market))
                    ? 'Added'
                    : '+ Intraday list'}
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'ideas' && (
        <ErrorBoundary>
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
                      setStrategyAutoMode(false);
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
        </ErrorBoundary>
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
          key={market}
          stock={selectedStock}
          currency={analysis?.currency || selectedStock.currency || (market === 'India' ? 'INR' : 'USD')}
          currentPrice={analysis?.price || watchlistQuotes[getYahooSymbol(selectedStock, market)]?.price}
          market={market}
          yahooApiBaseUrl={yahooApiBaseUrl}
        />
      )}

      {activeTab === 'options' && (
        <OptionsPanel
          selectedIndexId={selectedOptionsIndex}
          onSelectIndex={setSelectedOptionsIndex}
          yahooApiBaseUrl={yahooApiBaseUrl}
        />
      )}

      {activeTab === 'forex-crypto' && (
        <ForexCryptoPanel
          instruments={FOREX_CRYPTO_INSTRUMENTS}
          quotes={forexCryptoQuotes}
          refreshStatus={forexCryptoRefreshStatus}
          onRefresh={() => setForexCryptoRefreshKey((current) => current + 1)}
          onOpenChart={(instrument) => {
            setMarket('United States');
            setSelectedStock({ ...instrument, symbol: instrument.symbol.replace('/', '') });
            setSearchQuery(instrument.symbol);
            setSearchResults([]);
            setSearchError('');
            changeActiveTab('chart');
          }}
        />
      )}

      {activeTab === 'chart' && (
        <ErrorBoundary>
        <>
      <div id="panel-chart" role="tabpanel" aria-labelledby="tab-chart">
      <fieldset className="strategy-selector">
        <legend>{text.strategy}</legend>
        <label className="control-toggle strategy-auto-toggle">
          <input
            type="checkbox"
            checked={strategyAutoMode}
            onChange={(event) => setStrategyAutoMode(event.target.checked)}
          />
          Automatically select strategy and timeframe
        </label>
        <small className="subtle-note strategy-auto-note">
          Major trend: 1D or 1H · key levels/liquidity: 1H · trend reversal: 15m · FVG/order-block setup: 5m
        </small>
        <label>
          <input
            type="radio"
            name="signal-strategy"
            value="support-resistance"
            checked={selectedStrategy === 'support-resistance'}
            onChange={() => {
              setStrategyAutoMode(false);
              setSelectedStrategy('support-resistance');
            }}
          />
          {language === 'hi' ? 'सपोर्ट और रेजिस्टेंस' : 'Support & resistance'}
          <small>{language === 'hi' ? 'पिवट लेवल के पास बंद होने वाली कैंडल और EMA अलाइनमेंट।' : 'Closed candle near a pivot level with EMA alignment.'}</small>
        </label>
        <label>
          <input
            type="radio"
            name="signal-strategy"
            value="price-action"
            checked={selectedStrategy === 'price-action'}
            onChange={() => {
              setStrategyAutoMode(false);
              setSelectedStrategy('price-action');
            }}
          />
          {language === 'hi' ? 'FVG और ऑर्डर-ब्लॉक कॉन्फ्लुएंस' : 'FVG & order-block confluence'}
          <small>{language === 'hi' ? 'मूल जांच के साथ FVG/OB रिटेस्ट पुष्टि।' : 'Original checks plus a confirmed FVG/OB retest.'}</small>
        </label>
        <label>
          <input
            type="radio"
            name="signal-strategy"
            value="liquidity-sweep"
            checked={selectedStrategy === 'liquidity-sweep'}
            onChange={() => {
              setStrategyAutoMode(false);
              setSelectedStrategy('liquidity-sweep');
            }}
          />
          {language === 'hi' ? 'लिक्विडिटी स्वीप + स्ट्रक्चर शिफ्ट' : 'Liquidity sweep + structure shift'}
          <small>{language === 'hi' ? 'पूल स्वीप, रिक्लेम, रिजेक्शन और स्ट्रक्चर शिफ्ट का इंतजार करें।' : 'Wait for pool sweep, reclaim, rejection, and structure shift.'}</small>
        </label>
      </fieldset>
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
            <h2>Entry check · {analysis.timeframe}</h2>
            <div className="verdict-grid">
              <strong className={`entry-status ${analysis.setupDirection === 'Long' ? 'tone-bullish' : analysis.setupDirection === 'Short' ? 'tone-bearish' : ''}`}>
                {analysis.setupDirection
                  ? `${analysis.setupDirection} conditions met`
                  : `Wait · ${analysis.checklistDirection} conditions incomplete`}
              </strong>
              <span className="entry-strategy-name">{analysis.strategyName}</span>
              <ul className="entry-checklist">
                {analysis.entryChecklist.map((condition) => (
                  <li className={condition.passed ? 'is-passed' : 'is-pending'} key={condition.label}>
                    <span>{condition.passed ? 'Passed' : 'Waiting'}</span>
                    {condition.label}
                  </li>
                ))}
              </ul>
              <span className="entry-reference">
                Plan reference: {currencySymbol}{entryPrice.toFixed(2)} · stop {currencySymbol}{stopPrice.toFixed(2)} · target 1 {currencySymbol}{target1Price.toFixed(2)} · target 2 {currencySymbol}{targetPrice.toFixed(2)}
              </span>
              <p className="subtle-note">{analysis.entryIdea}</p>
              <p className="subtle-note">The checklist confirms a chart setup only; it is not a guaranteed entry or a probability of profit.</p>
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
                <span>Confluence score · heuristic</span>
                <strong>Long {analysis.longScore}/100 · Short {analysis.shortScore}/100</strong>
                <small>Context score only; the entry checklist above decides whether conditions are met.</small>
              </div>
            </div>
            <details className="score-breakdown-details">
              <summary>Show score details</summary>
              <p className="subtle-note">The score is a heuristic summary of context, not a win probability.</p>
              <div className="score-breakdown">
                {[['Long', analysis.longScore, analysis.longScoreDetails], ['Short', analysis.shortScore, analysis.shortScoreDetails]].map(([direction, score, details]) => (
                  <div className="quality-reasons" key={direction}>
                    <strong>{direction} context {score}/100</strong>
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
            </details>
            {analysis.dailyUnavailable && (
              <p className="subtle-note">
                Higher-timeframe context unavailable{analysis.dailyBiasError ? `: ${analysis.dailyBiasError}` : ' because Yahoo returned too few candles'}.
              </p>
            )}
          </section>

          <section className="analysis-panel">
            <h2>FVG &amp; order-block zones</h2>
            <p className="subtle-note">
              Heuristic zones: FVGs mark three-candle price gaps; order blocks mark the last opposing candle before a strong close beyond a recent swing. Confluence mode requires a confirmed zone retest, matching candle/EMA direction, and nearby pivot support or resistance.
            </p>
            <div className="levels-columns">
              {[
                ['Bullish FVG', analysis.priceAction.bullishFvg, analysis.priceAction.longFvgRetest],
                ['Bearish FVG', analysis.priceAction.bearishFvg, analysis.priceAction.shortFvgRetest],
                ['Bullish order block', analysis.priceAction.bullishOrderBlock, analysis.priceAction.longOrderBlockRetest],
                ['Bearish order block', analysis.priceAction.bearishOrderBlock, analysis.priceAction.shortOrderBlockRetest],
              ].map(([label, zone, retested]) => (
                <div className="level-row" key={label}>
                  <span>{label}</span>
                  {zone
                    ? <><strong>{currencySymbol}{zone.lower.toFixed(2)}–{currencySymbol}{zone.upper.toFixed(2)}</strong><small>{retested ? 'Confirmed retest' : 'Active zone'}</small></>
                    : <small>No active zone</small>}
                </div>
              ))}
            </div>
          </section>

          <section className="analysis-panel support-resistance-panel">
            <h2>Support &amp; resistance</h2>
            <div className="levels-columns">
              <div>
                <h3 className="support-heading">Support</h3>
                {analysis.supports.map((level, index) => (
                  <div className="level-row" key={`support-${level.price}`}>
                    <span>S{index + 1}</span><strong>{currencySymbol}{level.price.toFixed(2)}</strong><small>{level.touches} pivot touch{level.touches === 1 ? '' : 'es'}</small>
                  </div>
                ))}
              </div>
              <div>
                <h3 className="resistance-heading">Resistance</h3>
                {analysis.resistances.map((level, index) => (
                  <div className="level-row" key={`resistance-${level.price}`}>
                    <span>R{index + 1}</span><strong>{currencySymbol}{level.price.toFixed(2)}</strong><small>{level.touches} pivot touch{level.touches === 1 ? '' : 'es'}</small>
                  </div>
                ))}
              </div>
            </div>
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
              <div className="metric"><span>Reference price · not an order</span><strong>{currencySymbol}{entryPrice.toFixed(2)}</strong></div>
              <div className="metric"><span>Stop plan · {stopRiskPercent.toFixed(2)}% risk/share</span><strong>{currencySymbol}{stopPrice.toFixed(2)}</strong></div>
              <div className="metric"><span>Target 1 · {target1Percent.toFixed(2)}% · {target1RiskReward.toFixed(2)}R</span><strong>{currencySymbol}{target1Price.toFixed(2)}</strong></div>
              <div className="metric"><span>Target 2 · {target2Percent.toFixed(2)}% · {target2RiskReward.toFixed(2)}R</span><strong>{currencySymbol}{targetPrice.toFixed(2)}</strong></div>
              <div className="metric"><span>Net possible loss at stop</span><strong className="tone-bearish">−{currencySymbol}{potentialLoss.toFixed(2)}</strong></div>
              <div className="metric"><span>Net possible gain at target 1</span><strong className={potentialTarget1Gain >= 0 ? 'tone-bullish' : 'tone-bearish'}>{potentialTarget1Gain >= 0 ? '+' : '−'}{currencySymbol}{Math.abs(potentialTarget1Gain).toFixed(2)}</strong></div>
              <div className="metric"><span>Net possible gain at target 2</span><strong className={potentialTarget2Gain >= 0 ? 'tone-bullish' : 'tone-bearish'}>{potentialTarget2Gain >= 0 ? '+' : '−'}{currencySymbol}{Math.abs(potentialTarget2Gain).toFixed(2)}</strong></div>
            </div>
            <div className="trade-plan-reasons">
              <strong>How to read this plan</strong>
              <ul>
                <li>Reference price is the latest completed candle close, not an instruction to place an order.</li>
                <li>Stop uses {tradeLevels.method.toLowerCase()}; targets use nearby structure when available and otherwise use risk multiples.</li>
                <li>Percentages and R multiples are price distances before brokerage, slippage, taxes, and gaps.</li>
                <li>Current chart timeframe: {analysis.timeframe}. The market may change before an order is placed.</li>
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
          <ErrorBoundary>
          <section className="analysis-panel backtest-panel">
            <h2>Historical signal simulation</h2>
            <p className="subtle-note">
              {selectedStrategy === 'price-action'
                ? 'This simulation requires a confirmed FVG or order-block retest together with the existing EMA, candle, and nearby support/resistance checks.'
                : selectedStrategy === 'liquidity-sweep'
                  ? 'This simulation tests swing and equal highs/lows, previous-session/week/month extremes, and nearby round numbers. It requires a sweep, reclaim with rejection, and a close beyond the prior candle extreme; volume expansion is context, not a required filter. Entry is next candle open, stop is the sweep extreme, and targets use a nearby opposing pool when it is within a defined risk range, otherwise 1R/2R.'
                  : 'This simulation uses the original EMA, candle, and nearby support/resistance rules.'}
              {' '}The chart simulation uses loaded historical candles; the optional watchlist test below fetches data for up to five symbols. These are simplified heuristics, not predictions.
            </p>
            <button type="button" className="scan-button" onClick={runWatchlistBacktest} disabled={watchlistBacktestLoading}>
              {watchlistBacktestLoading ? 'Testing watchlist…' : 'Test selected stock + watchlist (up to 5)'}
            </button>
            {watchlistBacktestIssues.length > 0 && (
              <p className="subtle-note" role="alert">{watchlistBacktestIssues.join(' ')}</p>
            )}
            {watchlistBacktestResult && (
              <>
                <p className="subtle-note">Tested: {watchlistBacktest.symbols.map((item) => item.symbol).join(', ') || 'none'}.</p>
                <div className="metrics-grid">
                  <div className="metric"><span>Symbols tested</span><strong>{watchlistBacktestResult.symbolsTested}</strong></div>
                  <div className="metric"><span>Combined trades</span><strong>{watchlistBacktestResult.numberOfTrades}</strong></div>
                  <div className="metric"><span>Combined net P&amp;L</span><strong>{watchlistBacktestResult.net.totalPnl.toFixed(2)}</strong></div>
                  <div className="metric"><span>Out-of-sample net P&amp;L</span><strong>{watchlistBacktestResult.outOfSample.net.totalPnl.toFixed(2)}</strong></div>
                  <div className="metric"><span>Out-of-sample expectancy</span><strong>{watchlistBacktestResult.outOfSample.averageR.toFixed(2)}R</strong></div>
                  <div className="metric"><span>Out-of-sample win rate</span><strong>{watchlistBacktestResult.outOfSample.winRate.toFixed(1)}%</strong></div>
                </div>
                <p className="subtle-note">
                  Each symbol is tested independently with its own chronological 70/30 split. Up to five stocks are included; combined P&amp;L assumes two shares per trade and is not capital-weighted or a portfolio simulation. Results can overlap in time and are not broad-market proof.
                </p>
              </>
            )}
            {backtestResult && (
              <>
                <div className="metrics-grid">
                  <div className="metric"><span>Trades</span><strong>{backtestResult.numberOfTrades}</strong></div>
                  <div className="metric"><span>Gross P&amp;L</span><strong>{backtestResult.gross?.totalPnl?.toFixed(2) ?? '0.00'}</strong></div>
                  <div className="metric"><span>Net P&amp;L</span><strong>{backtestResult.net?.totalPnl?.toFixed(2) ?? '0.00'}</strong></div>
                  <div className="metric"><span>Trading costs</span><strong>{backtestResult.totalCosts?.toFixed(2) ?? '0.00'}</strong></div>
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
                {selectedStrategy === 'liquidity-sweep' && backtestResult.trades.length > 0 && (
                  <div className="liquidity-backtest">
                    <h3>Recent simulated sweep trades</h3>
                    <div className="liquidity-backtest-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Entry time</th>
                            <th>Side</th>
                            <th>Entry</th>
                            <th>Liquidity pool</th>
                            <th>Pool level</th>
                            <th>Sweep extreme</th>
                            <th>Sweep stop</th>
                            <th>Target 1</th>
                            <th>Exit</th>
                            <th>Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...backtestResult.trades].slice(-15).reverse().map((trade) => (
                            <tr key={`${trade.entryTime}-${trade.exitTime}`}>
                              <td>{formatExchangeTime(trade.entryTime, analysis.timeZone || 'UTC')}</td>
                              <td>{trade.direction}</td>
                              <td>{formatBacktestPrice(trade.entryPrice)}</td>
                              <td>{trade.liquidityPoolType || '—'}</td>
                              <td>{formatBacktestPrice(trade.liquidityLevel)}</td>
                              <td>{formatBacktestPrice(trade.sweepExtreme)}</td>
                              <td>{formatBacktestPrice(trade.stopPrice)}</td>
                              <td>{formatBacktestPrice(trade.target1Price)}</td>
                              <td>{formatBacktestPrice(trade.exitPrice)}</td>
                              <td>{formatBacktestPrice(trade.rMultiple)}R · {trade.outcome || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="subtle-note">
                      Showing up to 15 recent trades. Entries are simulated at the next candle open; the stop is the sweep extreme. Results are underlying-price simulations, not option-premium returns. Liquidity pools and volume expansion are inferred from OHLCV bars; they do not reveal actual resting orders, volume-profile nodes, or institutional intent.
                    </p>
                  </div>
                )}
                <p className="subtle-note">
                  Costs use the brokerage and slippage entered above. Each simulated trade represents two shares (half exits at target 1); brokerage is charged per fill and slippage on each side. Gap-through stops use the candle open; trades still open at a sample boundary close at its last candle. Taxes are excluded. This is one symbol split chronologically 70/30, not broad-market validation.
                </p>
                {(backtestResult.numberOfTrades < 30 || (backtestResult.symbolsTested ?? 1) < 30) && <p className="subtle-note" role="note">Warning: fewer than 30 trades in this sample; this result is too small for reliable conclusions.</p>}
                {backtestResult.inSample && backtestResult.outOfSample &&
                  (backtestResult.outOfSample.averageR ?? 0) < (backtestResult.inSample.averageR ?? 0) * (TRADING_THRESHOLDS.muchWorseOutOfSampleRatio ?? 0.5) && (
                    <p className="subtle-note" role="alert">Warning: out-of-sample results are much worse than in-sample results, which suggests possible overfitting.</p>
                  )}
              </>
            )}
          </section>
          </ErrorBoundary>
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
        <span><i className="legend-fvg" /> FVG zone bounds</span>
        <span><i className="legend-order-block" /> Order-block zone bounds</span>
      </div>

      {/* Chart */}
      <ChartView
        containerRef={chartContainerRef}
        loading={loading}
        hasAnalysis={Boolean(analysis)}
        symbol={getYahooSymbol(selectedStock, market)}
        currencySymbol={currencySymbol}
        price={analysis?.price ?? null}
        showVolume={showVolume}
        showSR={showSR}
        showEMA={showEMA}
        showVWAP={showVWAP}
        showRSI={showRSI}
        showZones={showZones}
        showMarkers={showMarkers}
        onToggle={(setting, checked) => {
          if (setting === 'volume') setShowVolume(checked);
          else if (setting === 'sr') setShowSR(checked);
          else if (setting === 'ema') setShowEMA(checked);
          else if (setting === 'vwap') setShowVWAP(checked);
          else if (setting === 'rsi') setShowRSI(checked);
          else if (setting === 'zones') setShowZones(checked);
          else if (setting === 'markers') setShowMarkers(checked);
        }}
      />
      </div>
        </>
        </ErrorBoundary>
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