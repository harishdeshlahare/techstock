import { useEffect, useRef, useState } from 'react';

export default function ChartView({
  containerRef,
  loading,
  hasAnalysis,
  symbol,
  currencySymbol,
  price,
  showVolume,
  showSR,
  showEMA,
  showVWAP,
  showRSI,
  showZones,
  showMarkers,
  onToggle,
}) {
  const frameRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await frameRef.current?.requestFullscreen();
      }
    } catch (error) {
      console.error('Unable to enter fullscreen chart mode.', error);
    }
  }

  return (
    <div
      className={`chart-frame${isFullscreen ? ' is-fullscreen' : ''}`}
      ref={frameRef}
    >
      <div className="chart-toolbar">
        <div>
          <strong>{symbol}</strong>
          {price !== null && price !== undefined && (
            <span>{currencySymbol}{Number(price).toFixed(2)}</span>
          )}
        </div>
        <div className="chart-toolbar-actions">
          <label><input type="checkbox" checked={showVolume} onChange={(event) => onToggle('volume', event.target.checked)} /> Volume</label>
          <label><input type="checkbox" checked={showSR} onChange={(event) => onToggle('sr', event.target.checked)} /> S/R</label>
          <label><input type="checkbox" checked={showEMA} onChange={(event) => onToggle('ema', event.target.checked)} /> EMA</label>
          <label><input type="checkbox" checked={showVWAP} onChange={(event) => onToggle('vwap', event.target.checked)} /> VWAP</label>
          <label><input type="checkbox" checked={showRSI} onChange={(event) => onToggle('rsi', event.target.checked)} /> RSI</label>
          <label><input type="checkbox" checked={showZones} onChange={(event) => onToggle('zones', event.target.checked)} /> Zones</label>
          <label><input type="checkbox" checked={showMarkers} onChange={(event) => onToggle('markers', event.target.checked)} /> Signals</label>
          <button type="button" className="secondary-button chart-fullscreen-button" onClick={toggleFullscreen}>
            {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </div>
      <div className="chart-container" ref={containerRef} aria-busy={loading} />
      {loading && !hasAnalysis && <div className="chart-skeleton" role="status">Loading chart data…</div>}
    </div>
  );
}
