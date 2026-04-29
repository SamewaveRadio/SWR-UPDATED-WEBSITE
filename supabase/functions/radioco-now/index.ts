import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STATION_ID = "seda2500f1";
const CACHE_DURATION = 10000;

let cache: {
  data: any;
  timestamp: number;
} | null = null;

function parseTrackInfo(titleString: string): { title: string; artist: string } {
  if (!titleString) {
    return { title: "Unknown Track", artist: "Unknown Artist" };
  }

  const separator = " - ";
  const separatorIndex = titleString.indexOf(separator);

  if (separatorIndex === -1) {
    return { title: titleString, artist: "Unknown Artist" };
  }

  const artist = titleString.substring(0, separatorIndex).trim();
  const title = titleString.substring(separatorIndex + separator.length).trim();

  return {
    title: title || "Unknown Track",
    artist: artist || "Unknown Artist",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const now = Date.now();
    
    if (cache && now - cache.timestamp < CACHE_DURATION) {
      return new Response(JSON.stringify(cache.data), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const statusRes = await fetch(
      `https://public.radio.co/stations/${STATION_ID}/status`
    );

    if (!statusRes.ok) {
      throw new Error("Failed to fetch Radio.co data");
    }

    const data = await statusRes.json();

    const trackInfo = data.current_track
      ? parseTrackInfo(data.current_track.title)
      : { title: "Unknown Track", artist: "Unknown Artist" };

    const response = {
      isLive: data.status === "online",
      track: data.current_track ? {
        title: trackInfo.title,
        artist: trackInfo.artist,
        artworkUrl: data.current_track.artwork_url_large || data.current_track.artwork_url,
        startedAt: data.current_track.start_time,
      } : null,
      dj: {
        name: null,
      },
      artworkUrl: data.current_track?.artwork_url_large || data.current_track?.artwork_url,
    };

    cache = {
      data: response,
      timestamp: now,
    };

    return new Response(JSON.stringify(response), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error fetching Radio.co now playing:", error);
    
    return new Response(
      JSON.stringify({
        error: "Failed to fetch station metadata",
        isLive: false,
        track: null,
        dj: null,
        artworkUrl: null,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});