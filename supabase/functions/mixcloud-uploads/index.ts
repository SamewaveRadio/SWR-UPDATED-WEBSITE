import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface MixcloudCloudcast {
  key: string;
  name: string;
  url: string;
  created_time: string;
  updated_time: string;
  pictures: {
    medium: string;
    large: string;
    thumbnail: string;
  };
  user: {
    name: string;
    username: string;
  };
}

interface MixcloudResponse {
  data: MixcloudCloudcast[];
  paging: {
    next?: string;
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
    const username = url.searchParams.get('username') || 'samewaveradio';
    const limit = url.searchParams.get('limit') || '10';

    const mixcloudUrl = `https://api.mixcloud.com/${username}/cloudcasts/?limit=${limit}`;
    
    const response = await fetch(mixcloudUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Mixcloud API error: ${response.status}`);
    }

    const data: MixcloudResponse = await response.json();

    return new Response(
      JSON.stringify({
        success: true,
        uploads: data.data.map(cloudcast => ({
          id: cloudcast.key,
          name: cloudcast.name,
          url: `https://www.mixcloud.com${cloudcast.url}`,
          createdTime: cloudcast.created_time,
          thumbnail: cloudcast.pictures.medium,
          user: cloudcast.user.name,
        })),
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    console.error('Error fetching Mixcloud uploads:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  }
});