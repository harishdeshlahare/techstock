import { useCallback, useEffect, useRef } from 'react';

export function useScanner(market, activeTab) {
  const generationRef = useRef(0);

  const cancelScan = useCallback(() => {
    generationRef.current += 1;
  }, []);

  const startScan = useCallback(() => {
    const generation = ++generationRef.current;
    return () => generationRef.current === generation;
  }, []);

  useEffect(() => cancelScan, [market, activeTab, cancelScan]);

  return { startScan, cancelScan };
}
