import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STATION_ID = "seda2500f1";
const CACHE_DURATION = 30000;

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
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);
    
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
      throw new Error("Failed to fetch Radio.co status");
    }

    const data = await statusRes.json();

    const items = (data.history || [])
      .slice(0, limit)
      .map((item: any) => {
        const trackInfo = parseTrackInfo(item.title);
        return {
          title: trackInfo.title,
          artist: trackInfo.artist,
          artworkUrl: item.artwork_url_large || item.artwork_url || null,
          startedAt: item.start_time || new Date().toISOString(),
        };
      });

    const response = { items };

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
    console.error("Error fetching Radio.co history:", error);
    
    return new Response(
      JSON.stringify({
        error: "Failed to fetch track history",
        items: [],
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