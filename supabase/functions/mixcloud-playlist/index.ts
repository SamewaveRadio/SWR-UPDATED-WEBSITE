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
  pictures: {
    extra_large: string;
    large: string;
    medium: string;
    thumbnail: string;
  };
  tags?: MixcloudTag[];
}

interface MixcloudPlaylistResponse {
  data: MixcloudCloudcast[];
  paging: {
    next?: string;
  };
}

function parsePlaylistUrl(playlistUrl: string): { username: string; playlistSlug: string } | null {
  try {
    const url = new URL(playlistUrl);
    const pathParts = url.pathname.split('/').filter(part => part.length > 0);

    if (pathParts.length >= 3 && pathParts[1] === 'playlists') {
      return {
        username: pathParts[0],
        playlistSlug: pathParts[2],
      };
    }

    return null;
  } catch {
    return null;
  }
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
    const playlistUrl = url.searchParams.get('playlistUrl');
    const limit = url.searchParams.get('limit') || '6';

    if (!playlistUrl) {
      return new Response(
        JSON.stringify({
          error: 'Missing required parameter: playlistUrl',
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        },
      );
    }

    const parsed = parsePlaylistUrl(playlistUrl);

    if (!parsed) {
      return new Response(
        JSON.stringify({
          error: 'Invalid playlist URL format',
          details: 'URL must be in format: https://www.mixcloud.com/{username}/playlists/{slug}/',
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        },
      );
    }

    const { username, playlistSlug } = parsed;
    const requestedLimit = parseInt(limit);
    const batchLimit = 50;

    const mixcloudApiUrl = `https://api.mixcloud.com/${username}/playlists/${playlistSlug}/cloudcasts/?limit=${batchLimit}&offset=0`;

    const response = await fetch(mixcloudApiUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Mixcloud API error: ${response.status}`);
    }

    const data: MixcloudPlaylistResponse = await response.json();

    let allCloudcasts = data.data;

    const sortedCloudcasts = allCloudcasts.sort((a, b) => {
      return new Date(b.created_time).getTime() - new Date(a.created_time).getTime();
    });

    const limitedCloudcasts = sortedCloudcasts.slice(0, requestedLimit);

    const enrichedCloudcasts = await enrichCloudcastsWithTags(limitedCloudcasts);

    const normalizedItems = enrichedCloudcasts.map(cloudcast => ({
      name: cloudcast.name,
      url: `https://www.mixcloud.com${cloudcast.url}`,
      created_time: cloudcast.created_time,
      pictures: {
        extra_large: cloudcast.pictures.extra_large,
      },
      tags: cloudcast.tags || [],
    }));

    return new Response(
      JSON.stringify({
        items: normalizedItems,
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
    console.error('Error fetching Mixcloud playlist:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch playlist',
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