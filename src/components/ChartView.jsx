export default function ChartView({ containerRef, loading, hasAnalysis }) {
  return (
    <div className="chart-frame">
      <div className="chart-container" ref={containerRef} aria-busy={loading} />
      {loading && !hasAnalysis && <div className="chart-skeleton" role="status">Loading chart data…</div>}
    </div>
  );
}
