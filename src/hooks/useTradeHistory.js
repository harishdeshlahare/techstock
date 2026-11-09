import { useEffect, useState } from 'react';

const STORAGE_KEY = 'techstock-trade-history';

function loadTradeHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Unable to load trade history.', error);
    return [];
  }
}

export function useTradeHistory() {
  const [trades, setTrades] = useState(loadTradeHistory);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
    } catch (error) {
      console.error('Unable to save trade history.', error);
    }
  }, [trades]);

  return [trades, setTrades];
}
