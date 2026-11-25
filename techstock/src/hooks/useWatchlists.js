import { useEffect, useState } from 'react';

const STORAGE_KEY = 'techstock-watchlists';

function loadWatchlists(fallback) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved);
    return {
      India: Array.isArray(parsed.India) ? parsed.India : fallback.India,
      'United States': Array.isArray(parsed['United States']) ? parsed['United States'] : fallback['United States'],
    };
  } catch (error) {
    console.error('Unable to load saved watchlists.', error);
    return fallback;
  }
}

export function useWatchlists(fallback) {
  const [watchlists, setWatchlists] = useState(() => loadWatchlists(fallback));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlists));
    } catch (error) {
      console.error('Unable to save watchlists.', error);
    }
  }, [watchlists]);

  return [watchlists, setWatchlists];
}
