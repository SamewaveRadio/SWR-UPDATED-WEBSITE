import type { VercelRequest, VercelResponse } from '@vercel/node';

const AZURACAST_API_BASE = (process.env.AZURACAST_API_BASE || 'https://azuracast.samewaveradio.com/api').replace(/\/$/, '');
const AZURACAST_STATION_ID = process.env.AZURACAST_STATION_ID?.trim();

interface RawSong {
  title?: string;
  artist?: string;
  text?: string;
  art?: unknown;
  custom_fields?: Record<string, unknown>;
}

interface RawNowPlaying {
  station?: {
    id?: number | string;
    name?: string;
    shortcode?: string;
    listen_url?: unknown;
    mounts?: Array<{ url?: unknown }>;
  };
  now_playing?: {
    played_at?: number | string | null;
    song?: RawSong;
  };
  playing_next?: { song?: RawSong };
  song_history?: Array<{
    played_at?: number | string | null;
    song?: RawSong;
  }>;
  live?: { is_live?: boolean; streamer_name?: string };
  is_online?: boolean;
}

function resolveStr(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && 'url' in value) {
    const u = (value as { url?: unknown }).url;
    return typeof u === 'string' && u.trim() ? u.trim() : undefined;
  }
  return undefined;
}

function toIso(value?: number | string | null): string | null {
  if (typeof value === 'number' && value > 0) return new Date(value * 1000).toISOString();
  if (typeof value === 'string' && value.trim()) return value;
  return null;
}

function normalizeArtUrl(raw: unknown): string | null {
  const url = resolveStr(raw);
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('//') || url.startsWith('/')) {
    return `/api/azuracast/art?url=${encodeURIComponent(url)}`;
  }
  return url;
}

function pick(data: RawNowPlaying | RawNowPlaying[]): RawNowPlaying | null {
  const arr = Array.isArray(data) ? data : [data];
  if (!arr.length) return null;
  if (AZURACAST_STATION_ID) {
    const id = AZURACAST_STATION_ID.toLowerCase();
    const match = arr.find((item) => {
      const s = item.station;
      return (
        String(s?.id ?? '').toLowerCase() === id ||
        s?.shortcode?.toLowerCase() === id ||
        s?.name?.toLowerCase() === id
      );
    });
    if (match) return match;
  }
  return arr[0];
}

function transform(raw: RawNowPlaying) {
  const currentSong = raw.now_playing?.song || raw.playing_next?.song || null;
  const listenUrl =
    resolveStr(raw.station?.listen_url) ||
    raw.station?.mounts?.map((m) => resolveStr(m.url)).find(Boolean) ||
    null;

  const artworkUrl = normalizeArtUrl(
    currentSong?.art ?? currentSong?.custom_fields?.art
  );

  const historyItems = (raw.song_history || []).map((item) => {
    const song = item.song || {};
    return {
      title: song.title || song.text || 'Unknown Track',
      artist: song.artist || '',
      artworkUrl: normalizeArtUrl(song.art),
      startedAt: toIso(item.played_at),
    };
  });

  return {
    isLive: raw.is_online === true,
    stationName: raw.station?.name || '',
    listenUrl,
    track: currentSong
      ? {
          title: currentSong.title || currentSong.text || 'Samewave Radio',
          artist: currentSong.artist || '',
          artworkUrl,
          startedAt: toIso(raw.now_playing?.played_at),
        }
      : null,
    dj: raw.live?.streamer_name ? { name: raw.live.streamer_name } : null,
    history: { items: historyItems },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const response = await fetch(`${AZURACAST_API_BASE}/nowplaying`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`AzuraCast returned ${response.status}`);
    }

    const data = (await response.json()) as RawNowPlaying | RawNowPlaying[];
    const payload = pick(data);

    if (!payload) {
      return res.status(502).json({ error: 'No station data returned from AzuraCast' });
    }

    return res.status(200).json(transform(payload));
  } catch (err) {
    console.error('[azuracast/nowplaying]', err);
    return res.status(502).json({ error: 'Failed to fetch now playing data' });
  }
}
