const PAGES = [
  ['home', 'Overview', '⌂'],
  ['chart', 'Chart & analysis', '⌁'],
  ['ideas', 'Intraday ideas', '◈'],
  ['report', 'Trade report', '▤'],
  ['history', 'Stock history', '◷'],
  ['paper', 'Paper trading', '↗'],
  ['options', 'Index options', '◇'],
];

export function WorkspaceSidebar({ activeTab, onNavigate, stock }) {
  return (
    <aside className="dashboard-sidebar" aria-label="Dashboard navigation">
      <div className="sidebar-brand">
        <span className="brand-mark" aria-hidden="true">T</span>
        <span>Workspace</span>
      </div>
      <nav className="sidebar-links" aria-label="Primary">
        {PAGES.map(([page, label, icon]) => (
          <button
            type="button"
            key={page}
            className={activeTab === page ? 'sidebar-link active' : 'sidebar-link'}
            aria-current={activeTab === page ? 'page' : undefined}
            onClick={() => onNavigate(page)}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </button>
        ))}
      </nav>
      <div className="sidebar-stock">
        <span>Selected instrument</span>
        <strong>{stock.symbol}</strong>
        <small>{stock.instrument_name || stock.exchange}</small>
      </div>
    </aside>
  );
}

export function WorkspaceTabs({ activeTab, onNavigate }) {
  function handleKeyDown(event) {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = PAGES.findIndex(([page]) => page === activeTab);
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const next = PAGES[(currentIndex + offset + PAGES.length) % PAGES.length][0];
    onNavigate(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  return (
    <div className="workspace-tabs" role="tablist" aria-label="Stock workspace" onKeyDown={handleKeyDown}>
      {PAGES.map(([page, label, icon]) => (
        <button
          id={`tab-${page}`}
          type="button"
          key={page}
          role="tab"
          aria-controls={`panel-${page}`}
          aria-selected={activeTab === page}
          tabIndex={activeTab === page ? 0 : -1}
          className={activeTab === page ? 'workspace-tab active' : 'workspace-tab'}
          onClick={() => onNavigate(page)}
        >
          <span className="workspace-tab-icon" aria-hidden="true">{icon}</span>
          <span className="workspace-tab-label">{label}</span>
          <span className="workspace-tab-short">{page === 'home' ? 'Home' : page === 'chart' ? 'Chart' : page === 'ideas' ? 'Ideas' : page === 'report' ? 'Report' : page === 'history' ? 'History' : page === 'paper' ? 'Paper' : 'Options'}</span>
        </button>
      ))}
    </div>
  );
}
