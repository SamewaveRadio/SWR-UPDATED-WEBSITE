import { useEffect, useState } from 'react';
import { MixcloudPlaylistResponse } from '../types';

interface UseMixcloudPlaylistResult {
  items: MixcloudPlaylistResponse['items'];
  loading: boolean;
  error: string | null;
}

export function useMixcloudPlaylist(playlistUrl: string | null | undefined, limit: number = 6): UseMixcloudPlaylistResult {
  const [items, setItems] = useState<MixcloudPlaylistResponse['items']>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playlistUrl) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }

    const fetchPlaylist = async () => {
      setLoading(true);
      setError(null);

      try {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mixcloud-playlist`;
        const params = new URLSearchParams({
          playlistUrl: playlistUrl,
          limit: limit.toString(),
        });

        const response = await fetch(`${apiUrl}?${params}`, {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch playlist');
        }

        const data: MixcloudPlaylistResponse = await response.json();
        setItems(data.items);
      } catch (err) {
        console.error('Error fetching Mixcloud playlist:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPlaylist();
  }, [playlistUrl, limit]);

  return { items, loading, error };
}
