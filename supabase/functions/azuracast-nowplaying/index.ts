import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const AZURACAST_API_BASE = (
  Deno.env.get("AZURACAST_API_BASE") || "https://azuracast.samewaveradio.com/api"
).replace(/\/$/, "");

const AZURACAST_STATION_ID = (
  Deno.env.get("AZURACAST_STATION_ID") || "samewave_radio"
).toLowerCase().trim();

const CACHE_DURATION = 10000;

let cache: { data: unknown; timestamp: number } | null = null;

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
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && "url" in value) {
    const u = (value as { url?: unknown }).url;
    return typeof u === "string" && u.trim() ? u.trim() : undefined;
  }
  return undefined;
}

function toIso(value?: number | string | null): string | null {
  if (typeof value === "number" && value > 0) return new Date(value * 1000).toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

function pick(data: RawNowPlaying | RawNowPlaying[]): RawNowPlaying | null {
  const arr = Array.isArray(data) ? data : [data];
  if (!arr.length) return null;

  const match = arr.find((item) => {
    const s = item.station;
    return (
      String(s?.id ?? "").toLowerCase() === AZURACAST_STATION_ID ||
      s?.shortcode?.toLowerCase() === AZURACAST_STATION_ID ||
      s?.name?.toLowerCase() === AZURACAST_STATION_ID
    );
  });

  return match ?? arr[0];
}

function transform(raw: RawNowPlaying) {
  const currentSong = raw.now_playing?.song ?? raw.playing_next?.song ?? null;

  const listenUrl =
    resolveStr(raw.station?.listen_url) ||
    raw.station?.mounts?.map((m) => resolveStr(m.url)).find(Boolean) ||
    null;

  const historyItems = (raw.song_history || []).map((item) => {
    const song = item.song || {};
    return {
      title: song.title || song.text || "Unknown Track",
      artist: song.artist || "",
      artworkUrl: song.art && typeof song.art === "string" && song.art.startsWith("https://")
        ? song.art
        : null,
      startedAt: toIso(item.played_at),
    };
  });

  const artUrl = currentSong?.art;
  const artworkUrl =
    artUrl && typeof artUrl === "string" && artUrl.startsWith("https://")
      ? artUrl
      : null;

  return {
    isLive: raw.is_online === true,
    stationName: raw.station?.name || "Samewave Radio",
    listenUrl,
    track: currentSong
      ? {
          title: currentSong.title || currentSong.text || "Samewave Radio",
          artist: currentSong.artist || "",
          artworkUrl,
          startedAt: toIso(raw.now_playing?.played_at),
        }
      : null,
    dj: raw.live?.is_live && raw.live?.streamer_name
      ? { name: raw.live.streamer_name }
      : null,
    history: { items: historyItems },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const now = Date.now();

    if (cache && now - cache.timestamp < CACHE_DURATION) {
      return new Response(JSON.stringify(cache.data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch(`${AZURACAST_API_BASE}/nowplaying`, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`AzuraCast returned ${response.status}`);
    }

    const data = (await response.json()) as RawNowPlaying | RawNowPlaying[];
    const payload = pick(data);

    if (!payload) {
      throw new Error("No station data in AzuraCast response");
    }

    const result = transform(payload);
    cache = { data: result, timestamp: now };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[azuracast-nowplaying]", error);
    return new Response(
      JSON.stringify({
        isLive: false,
        stationName: "Samewave Radio",
        listenUrl: null,
        track: null,
        dj: null,
        history: { items: [] },
        error: "Failed to fetch station data",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
