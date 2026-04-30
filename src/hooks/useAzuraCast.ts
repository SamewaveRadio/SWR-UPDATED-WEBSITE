import { useState, useEffect, useRef, useCallback } from 'react';
import { AzuraCastNowPlaying } from '../types';

const NOW_PLAYING_POLL_INTERVAL = 12000;
const API_URL = import.meta.env.VITE_SUPABASE_URL as string;
const API_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export function useAzuraCast() {
  const [nowPlaying, setNowPlaying] = useState<AzuraCastNowPlaying | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNowPlaying = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const response = await fetch(`${API_URL}/functions/v1/azuracast-nowplaying`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
        signal: abortRef.current.signal,
      });

      if (!response.ok) throw new Error(`azuracast-nowplaying returned ${response.status}`);

      const data = (await response.json()) as AzuraCastNowPlaying;
      setNowPlaying(data);
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('[useAzuraCast]', err);
      setError('Failed to load station info');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNowPlaying();
    intervalRef.current = setInterval(fetchNowPlaying, NOW_PLAYING_POLL_INTERVAL);

    return () => {
      abortRef.current?.abort();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchNowPlaying]);

  return {
    nowPlaying,
    history: nowPlaying?.history ?? null,
    isLoading,
    error,
    refetch: fetchNowPlaying,
  };
}
