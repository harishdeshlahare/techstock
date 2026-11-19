import { useEffect, useState } from 'react';
import {
  buildGrowwOptionUrl,
  buildOptionsTechnicalSetup,
  calculateOptionExpiryPnl,
  getNextScheduledExpiryDate,
  getOptionLotSize,
  getOptionExpiryStatus,
  getOptionStrikeStep,
  parseGrowwOptionUrl,
} from '../lib/options.js';
import { fetchYahooJson, getClosedCandles, parseYahooCandles } from '../lib/yahoo.js';
import { fetchGrowwOptionQuote } from '../lib/groww.js';
import { INDIAN_INDICES } from '../lib/indices.js';

const OPTION_INDICES = INDIAN_INDICES;
const OPTION_TIMEFRAMES = {
  '1min': { label: '1 minute', interval: '1m', range: '7d' },
  '5min': { label: '5 minutes', interval: '5m', range: '1mo' },
  '15min': { label: '15 minutes', interval: '15m', range: '1mo' },
  '1h': { label: '1 hour', interval: '60m', range: '1mo' },
  '1day': { label: 'Daily', interval: '1d', range: '6mo' },
};

function formatPrice(price) {
  return Number.isFinite(price)
    ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(price)
    : '—';
}

function formatExpiry(date) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatCandleDate(time, timeZone, timeframe) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(timeframe === '1day' ? {} : { hour: '2-digit', minute: '2-digit' }),
    timeZone,
  }).format(new Date(time * 1000));
}

function formatUnderlyingMove(value, baseline) {
  if (!Number.isFinite(value) || !Number.isFinite(baseline) || baseline <= 0) return '—';
  const difference = value - baseline;
  const percent = (difference / baseline) * 100;
  const sign = difference > 0 ? '+' : '';
  return `${sign}${formatPrice(difference)} pts (${sign}${percent.toFixed(2)}%)`;
}

export default function OptionsPanel({ selectedIndexId, onSelectIndex, yahooApiBaseUrl }) {
  const [expiryDate, setExpiryDate] = useState(() => getNextScheduledExpiryDate('nifty'));
  const [strike, setStrike] = useState('');
  const [optionType, setOptionType] = useState('CE');
  const [contractUrlInput, setContractUrlInput] = useState('');
  const [analysisTimeframe, setAnalysisTimeframe] = useState('1h');
  const [premiumOverride, setPremiumOverride] = useState(null);
  const [lotCount, setLotCount] = useState('1');
  const [optionQuote, setOptionQuote] = useState(null);
  const [quoteRefreshKey, setQuoteRefreshKey] = useState(0);
  const [currentSpot, setCurrentSpot] = useState(null);
  const [spotLoading, setSpotLoading] = useState(true);
  const [spotError, setSpotError] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedIndex = OPTION_INDICES.find((index) => index.id === selectedIndexId) || OPTION_INDICES[0];

  let generatedUrl = '';
  let builderError = '';
  try {
    generatedUrl = buildGrowwOptionUrl({ indexId: selectedIndexId, expiryDate, strike, optionType });
  } catch (urlError) {
    builderError = urlError.message;
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadCurrentIndexValue() {
      try {
        const params = new URLSearchParams({ interval: '1d', range: '5d', events: 'div,splits' });
        const data = await fetchYahooJson(
          `/api/yahoo/v8/finance/chart/${encodeURIComponent(selectedIndex.yahooSymbol)}?${params}`,
          yahooApiBaseUrl,
          { ttl: 30_000, signal: controller.signal },
        );
        const result = data.chart?.result?.[0];
        const candles = parseYahooCandles(result);
        const quote = Number(result?.meta?.regularMarketPrice);
        const latestClose = getClosedCandles(candles, result, '1day').at(-1)?.close;
        const price = Number.isFinite(quote) && quote > 0 ? quote : latestClose;
        if (data.chart?.error || !Number.isFinite(price)) {
          throw new Error(data.chart?.error?.description || 'No current index value was returned.');
        }
        if (controller.signal.aborted) return;
        setCurrentSpot({
          price,
          source: Number.isFinite(quote) && quote > 0 ? 'Yahoo Finance index quote' : 'Last available daily close',
        });
        const step = getOptionStrikeStep(selectedIndex.id);
        setStrike((currentStrike) => currentStrike || String(Math.round(price / step) * step));
      } catch (quoteError) {
        if (!controller.signal.aborted) setSpotError(quoteError.message || 'Unable to load the current index value.');
      } finally {
        if (!controller.signal.aborted) setSpotLoading(false);
      }
    }

    loadCurrentIndexValue();
    return () => controller.abort();
  }, [selectedIndex.id, selectedIndex.yahooSymbol, yahooApiBaseUrl]);

  useEffect(() => {
    if (!generatedUrl) return undefined;
    const controller = new AbortController();
    let contract;
    try {
      contract = parseGrowwOptionUrl(generatedUrl);
    } catch {
      return undefined;
    }

    fetchGrowwOptionQuote(contract, {
      signal: controller.signal,
      force: quoteRefreshKey > 0,
      baseUrl: yahooApiBaseUrl,
    })
      .then((quote) => setOptionQuote({ url: generatedUrl, quote }))
      .catch((quoteError) => {
        if (!controller.signal.aborted) {
          setOptionQuote({ url: generatedUrl, error: quoteError.message || 'Unable to load the Groww option quote.' });
        }
      });
    return () => controller.abort();
  }, [generatedUrl, quoteRefreshKey, yahooApiBaseUrl]);

  async function analyzeContract(url) {
    setLoading(true);
    setError('');
    setAnalysis(null);
    try {
      const contract = parseGrowwOptionUrl(url);
      onSelectIndex(contract.indexId);
      if (getOptionExpiryStatus(contract.expiryDate) === 'expired') {
        setAnalysis({ contract, expired: true });
        return;
      }

      const selectedTimeframe = OPTION_TIMEFRAMES[analysisTimeframe];
      const params = new URLSearchParams({
        interval: selectedTimeframe.interval,
        range: selectedTimeframe.range,
        events: 'div,splits',
      });
      const data = await fetchYahooJson(
        `/api/yahoo/v8/finance/chart/${encodeURIComponent(contract.yahooSymbol)}?${params}`,
        yahooApiBaseUrl,
        { ttl: 30_000 },
      );
      const result = data.chart?.result?.[0];
      const candles = getClosedCandles(parseYahooCandles(result), result, analysisTimeframe);
      if (data.chart?.error || !candles.length) {
        throw new Error(data.chart?.error?.description || `No completed ${selectedTimeframe.label} index candles were returned.`);
      }
      const setup = buildOptionsTechnicalSetup(candles, contract.optionType, { interval: analysisTimeframe });
      const metaPrice = Number(result?.meta?.regularMarketPrice);
      const candlePrice = candles.at(-1).close;
      const underlyingPrice = Number.isFinite(metaPrice) && metaPrice > 0 ? metaPrice : candlePrice;
      setCurrentSpot({
        price: underlyingPrice,
        source: Number.isFinite(metaPrice) && metaPrice > 0
          ? 'Yahoo Finance index quote'
          : `Last available ${selectedTimeframe.label.toLowerCase()} candle`,
      });
      setAnalysis({
        contract,
        setup,
        expired: false,
        underlyingPrice,
        candleDate: formatCandleDate(
          candles.at(-1).time,
          result.meta?.exchangeTimezoneName || 'Asia/Kolkata',
          analysisTimeframe,
        ),
        timeframe: selectedTimeframe.label,
      });
    } catch (analysisError) {
      setError(analysisError.message || 'Unable to analyze this option contract.');
    } finally {
      setLoading(false);
    }
  }

  async function analyzeOption(event) {
    event.preventDefault();
    if (!generatedUrl) {
      setError(builderError);
      return;
    }
    await analyzeContract(generatedUrl);
  }

  function loadContractFromUrl() {
    setError('');
    try {
      const contract = parseGrowwOptionUrl(contractUrlInput);
      onSelectIndex(contract.indexId);
      setExpiryDate(contract.expiryDate);
      setStrike(String(contract.strike));
      setOptionType(contract.optionType);
      setPremiumOverride(null);
      setAnalysis(null);
    } catch (urlError) {
      setError(urlError.message || 'Enter a supported Groww option contract URL.');
    }
  }

  function handleIndexSelect(indexId) {
    const index = OPTION_INDICES.find((item) => item.id === indexId);
    if (!index || index.id === selectedIndex.id) return;
    setExpiryDate(getNextScheduledExpiryDate(index.id));
    setStrike('');
    setOptionType(index.id === 'sensex' ? 'PE' : 'CE');
    setPremiumOverride(null);
    setLotCount('1');
    setCurrentSpot(null);
    setSpotError('');
    setSpotLoading(true);
    onSelectIndex(index.id);
  }

  const activeOptionQuote = optionQuote?.url === generatedUrl ? optionQuote : null;
  const activePremiumOverride = premiumOverride?.url === generatedUrl ? premiumOverride.value : null;
  const premiumInputValue = activePremiumOverride ?? (
    Number.isFinite(activeOptionQuote?.quote?.ltp) ? String(activeOptionQuote.quote.ltp) : ''
  );
  const premiumValue = premiumInputValue.trim() === '' ? NaN : Number(premiumInputValue);
  const lotCountValue = Number(lotCount);
  const lotSize = getOptionLotSize(selectedIndex.id);
  const quantityValue = lotCountValue * lotSize;
  const hasOptionInputs = Number.isFinite(premiumValue) && premiumValue >= 0 &&
    Number.isInteger(lotCountValue) && lotCountValue >= 1 && lotCountValue <= 10;
  const scenarioLevels = analysis?.setup && currentSpot?.price
    ? [
      { label: 'Current index value', underlying: currentSpot.price },
      { label: 'Technical entry trigger', underlying: analysis.setup.entry },
      { label: 'Index stop reference', underlying: analysis.setup.stop },
      { label: 'Index target 1', underlying: analysis.setup.target1 },
      { label: 'Index target 2', underlying: analysis.setup.target2 },
    ]
    : [];

  return (
    <section id="panel-options" aria-labelledby="tab-options" className="scanner-panel options-panel" role="tabpanel">
      <div className="scanner-heading">
        <div>
          <h2>Indian index options</h2>
          <p>Choose an index, expiry, strike, and CE/PE. Current index value and a nearby strike are loaded when available.</p>
        </div>
      </div>
      <div className="index-option-grid">
        {OPTION_INDICES.map((index) => (
          <button
            type="button"
            key={index.id}
            className={selectedIndexId === index.id ? 'index-option-card selected' : 'index-option-card'}
            onClick={() => handleIndexSelect(index.id)}
            aria-pressed={selectedIndexId === index.id}
          >
            <strong>{index.name}</strong>
            <span>{index.exchange} · {index.symbol}</span>
          </button>
        ))}
      </div>
      <div className="option-chain-info">
        <h3>{selectedIndex.name} option chain</h3>
        <p>Open the Groww chain to choose an available expiry and strike. Enter those values below, then select CE or PE to build and analyze the contract.</p>
        <a className="scan-button option-chain-link" href={`https://groww.in/options/${selectedIndex.id === 'sensex' ? 'sp-bse-sensex' : selectedIndex.id === 'banknifty' ? 'nifty-bank' : 'nifty'}`} target="_blank" rel="noreferrer">
          Open Groww {selectedIndex.name} option chain
        </a>
        <p className="subtle-note">Current index value: {spotLoading ? 'loading…' : currentSpot ? `${formatPrice(currentSpot.price)} (${currentSpot.source})` : 'unavailable'}.</p>
        {spotError && <p className="options-error" role="status">{spotError}</p>}
        <p className="subtle-note">The expiry defaults to the next scheduled monthly expiry and the strike to the nearest standard increment. Confirm contract availability and holiday-adjusted dates on Groww.</p>
      </div>

      <form className="option-analysis-form" onSubmit={analyzeOption}>
        <h3>Build and analyze contract</h3>
        <div className="option-contract-import">
          <label>
            Or paste an existing Groww contract URL
            <input
              type="url"
              value={contractUrlInput}
              onChange={(event) => setContractUrlInput(event.target.value)}
              placeholder="https://groww.in/options/nifty-bank/BANKNIFTY24NOV63100CE"
            />
          </label>
          <button type="button" className="option-quote-refresh" disabled={!contractUrlInput.trim()} onClick={loadContractFromUrl}>
            Load contract from URL
          </button>
        </div>
        <div className="option-builder-fields">
          <label>
            Expiry
            <input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} required />
          </label>
          <label>
            Strike
            <input type="number" min="1000" max="200000" step={getOptionStrikeStep(selectedIndex.id)} value={strike} onChange={(event) => setStrike(event.target.value)} required />
          </label>
        </div>
        <fieldset className="option-type-selector">
          <legend>Option type</legend>
          {['CE', 'PE'].map((type) => (
            <button
              type="button"
              key={type}
              className={optionType === type ? 'selected' : ''}
              aria-pressed={optionType === type}
              onClick={() => setOptionType(type)}
            >
              {type === 'CE' ? 'Call (CE)' : 'Put (PE)'}
            </button>
          ))}
        </fieldset>
        <label>
          Technical setup timeframe
          <select value={analysisTimeframe} onChange={(event) => setAnalysisTimeframe(event.target.value)}>
            {Object.entries(OPTION_TIMEFRAMES).map(([value, timeframe]) => (
              <option value={value} key={value}>{timeframe.label}</option>
            ))}
          </select>
        </label>
        <label>
          Generated Groww contract URL
          <input type="url" value={generatedUrl} readOnly aria-describedby="option-url-help" />
        </label>
        <p id="option-url-help" className="subtle-note">Selecting CE or PE updates the URL using the index, expiry, and strike above.</p>
        <div className="option-builder-fields">
          <label>
            Groww option premium (₹ per unit)
            <input
              type="number"
              min="0"
              step="0.05"
              value={premiumInputValue}
              onChange={(event) => setPremiumOverride({ url: generatedUrl, value: event.target.value })}
              placeholder={activeOptionQuote?.error || 'Loading Groww quote…'}
            />
          </label>
          <label>
            Lots
            <select value={lotCount} onChange={(event) => setLotCount(event.target.value)}>
              {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
                <option value={String(count)} key={count}>{count} {count === 1 ? 'lot' : 'lots'}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="option-quote-status" role="status">
          {activeOptionQuote?.quote
            ? (
              <>
                <span>Groww delayed quote: ₹{formatPrice(activeOptionQuote.quote.ltp)}</span>
                {activeOptionQuote.quote.timestamp && (
                  <span>As of {new Intl.DateTimeFormat('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: 'Asia/Kolkata',
                  }).format(new Date(activeOptionQuote.quote.timestamp))} IST</span>
                )}
              </>
            )
            : activeOptionQuote?.error
              ? <span className="options-error">Groww quote unavailable: {activeOptionQuote.error}</span>
              : <span>Loading Groww delayed option quote…</span>}
          {premiumInputValue !== '' && activePremiumOverride !== null && <span>Premium manually overridden.</span>}
          <span>Lot size: {lotSize} units · Quantity: {quantityValue} units · Premium value: {Number.isFinite(premiumValue) ? `₹${formatPrice(premiumValue * quantityValue)}` : '—'}</span>
          <button type="button" className="option-quote-refresh" onClick={() => setQuoteRefreshKey((key) => key + 1)}>
            Refresh Groww quote
          </button>
          {activePremiumOverride !== null && (
            <button type="button" className="option-quote-refresh" onClick={() => setPremiumOverride(null)}>
              Use Groww quote
            </button>
          )}
        </div>
        {generatedUrl && (
          <a className="option-chain-link" href={generatedUrl} target="_blank" rel="noreferrer">
            Open generated contract on Groww
          </a>
        )}
        <button className="scan-button" type="submit" disabled={loading || (spotLoading && !strike)}>
          {loading ? 'Reading underlying chart…' : 'Analyze selected contract'}
        </button>
        {builderError && !spotLoading && <p className="options-error" role="status">{builderError}</p>}
        {error && <p className="options-error" role="alert">{error}</p>}
      </form>

      {analysis && (
        <section className="option-analysis-result" aria-live="polite">
          <h3>{analysis.contract.symbol}{analysis.expired ? ' · Expired' : ''}</h3>
          <div className="option-analysis-grid">
            <div><span>Contract symbol from URL</span><strong>{analysis.contract.symbol}</strong></div>
            <div><span>Expiry</span><strong>{formatExpiry(analysis.contract.expiryDate)}</strong></div>
            <div><span>Type / strike</span><strong>{analysis.contract.optionType} · {formatPrice(analysis.contract.strike)}</strong></div>
            {!analysis.expired && (
              <>
                <div><span>Underlying index</span><strong>{selectedIndex.name}</strong></div>
                <div><span>Last completed {analysis.timeframe} candle</span><strong>{analysis.candleDate}</strong></div>
                <div><span>Current index value</span><strong>{formatPrice(analysis.underlyingPrice)}</strong></div>
                <div><span>Option premium (Groww delayed)</span><strong>{Number.isFinite(premiumValue) ? `₹${formatPrice(premiumValue)}` : 'Quote unavailable'}</strong></div>
                <div><span>Lots / quantity</span><strong>{lotCountValue} × {lotSize} = {quantityValue} units</strong></div>
                <div><span>Index trend</span><strong>{analysis.setup.trend}</strong></div>
                <div>
                  <span>Technical alignment</span>
                  <strong>{analysis.setup.aligned ? 'Aligned' : 'Not aligned — wait'}</strong>
                </div>
                <div>
                  <span>Entry trigger (index · {analysis.timeframe})</span>
                  <strong>{analysis.setup.setupDirection === 'Short' ? 'Below' : 'Above'} {formatPrice(analysis.setup.entry)}</strong>
                </div>
                <div><span>Stop reference (index)</span><strong>{formatPrice(analysis.setup.stop)}</strong></div>
                <div><span>Target 1 reference (index)</span><strong>{formatPrice(analysis.setup.target1)}</strong></div>
                <div><span>Target 2 reference (index)</span><strong>{formatPrice(analysis.setup.target2)}</strong></div>
              </>
            )}
          </div>
          {!analysis.expired && hasOptionInputs && (
            <div className="option-scenario">
              <h4>Underlying move and option expiry scenarios</h4>
              <p className="subtle-note">
                Shows the underlying-index move from its current value. Option P&amp;L is intrinsic value at expiry minus your entered premium, for the entered quantity; it is not a forecast of the option’s price before expiry.
              </p>
              <div className="option-scenario-table" role="table" aria-label="Underlying and option expiry scenarios">
                <div className="option-scenario-row option-scenario-header" role="row">
                  <span role="columnheader">Scenario</span>
                  <span role="columnheader">Index level</span>
                  <span role="columnheader">Index move</span>
                  <span role="columnheader">Option P&amp;L at expiry</span>
                </div>
                {scenarioLevels.map(({ label, underlying }) => {
                  const pnl = calculateOptionExpiryPnl(
                    analysis.contract.optionType,
                    analysis.contract.strike,
                    premiumValue,
                    underlying,
                    quantityValue,
                  );
                  return (
                    <div className="option-scenario-row" role="row" key={label}>
                      <span role="cell">{label}</span>
                      <span role="cell">{formatPrice(underlying)}</span>
                      <span role="cell">{formatUnderlyingMove(underlying, analysis.underlyingPrice)}</span>
                      <span role="cell">{pnl.totalPnl < 0 ? '−' : '+'}₹{formatPrice(Math.abs(pnl.totalPnl))}</span>
                    </div>
                  );
                })}
              </div>
              {(() => {
                const breakEven = calculateOptionExpiryPnl(
                  analysis.contract.optionType,
                  analysis.contract.strike,
                  premiumValue,
                  analysis.underlyingPrice,
                  quantityValue,
                );
                return (
                  <p className="subtle-note">
                    Expiry break-even: {formatPrice(breakEven.breakEven)} index points. Maximum premium-at-risk: ₹{formatPrice(breakEven.maximumLoss)} for {quantityValue} unit(s), before costs.
                  </p>
                );
              })()}
            </div>
          )}
          {analysis.expired
            ? <p className="options-error" role="status">This contract expired on {formatExpiry(analysis.contract.expiryDate)}. No entry, stop, or target is shown for an expired contract.</p>
            : (
              <p className="subtle-note">
                Levels are technical references on the underlying index, derived from completed {analysis.timeframe.toLowerCase()} candles using {analysis.setup.method.toLowerCase()}.
                They are not option premium entry, stop, or target prices. The trigger is a break of the last completed candle; confirm live data and risk independently.
              </p>
            )}
        </section>
      )}
    </section>
  );
}
