import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface MixcloudTag {
  name: string;
  url: string;
}

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
    extra_large: string;
  };
  user: {
    name: string;
    username: string;
  };
  tags?: MixcloudTag[];
}

interface MixcloudResponse {
  data: MixcloudCloudcast[];
  paging: {
    next?: string;
  };
}

async function fetchCloudcastDetails(cloudcastUrl: string): Promise<MixcloudTag[] | null> {
  try {
    const apiUrl = `https://api.mixcloud.com${cloudcastUrl}`;
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.tags || null;
  } catch {
    return null;
  }
}

async function enrichCloudcastsWithTags(
  cloudcasts: MixcloudCloudcast[],
  concurrencyLimit: number = 4
): Promise<MixcloudCloudcast[]> {
  const results: MixcloudCloudcast[] = [];

  for (let i = 0; i < cloudcasts.length; i += concurrencyLimit) {
    const batch = cloudcasts.slice(i, i + concurrencyLimit);
    const batchResults = await Promise.all(
      batch.map(async (cloudcast) => {
        if (cloudcast.tags && cloudcast.tags.length > 0) {
          return {
            ...cloudcast,
            tags: cloudcast.tags.slice(0, 5),
          };
        }

        const tags = await fetchCloudcastDetails(cloudcast.url);
        return {
          ...cloudcast,
          tags: tags ? tags.slice(0, 5) : [],
        };
      })
    );
    results.push(...batchResults);
  }

  return results;
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
    const limit = url.searchParams.get('limit') || '8';

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

    const sortedCloudcasts = data.data.sort((a, b) => {
      return new Date(b.created_time).getTime() - new Date(a.created_time).getTime();
    });

    const enrichedCloudcasts = await enrichCloudcastsWithTags(sortedCloudcasts);

    const items = enrichedCloudcasts.map(cloudcast => ({
      name: cloudcast.name,
      url: `https://www.mixcloud.com${cloudcast.url}`,
      created_time: cloudcast.created_time,
      pictures: {
        extra_large: cloudcast.pictures.extra_large || cloudcast.pictures.large,
      },
      tags: cloudcast.tags || [],
    }));

    return new Response(
      JSON.stringify({
        items,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
        },
      },
    );
  } catch (error) {
    console.error('Error fetching Mixcloud latest uploads:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch latest uploads',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 502,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  }
});