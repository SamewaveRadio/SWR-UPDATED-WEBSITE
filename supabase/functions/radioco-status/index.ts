import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STATION_ID = "seda2500f1";
const CACHE_DURATION = 5000;

let cache: {
  data: any;
  timestamp: number;
} | null = null;

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
      throw new Error("Failed to fetch Radio.co status");
    }

    const statusData = await statusRes.json();

    const response = {
      isLive: statusData.status === "online",
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
    console.error("Error fetching Radio.co status:", error);
    
    return new Response(
      JSON.stringify({
        error: "Failed to fetch station status",
        isLive: false,
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