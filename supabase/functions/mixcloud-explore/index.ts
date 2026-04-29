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

interface MixcloudResponse {
  data: MixcloudCloudcast[];
  paging: {
    next?: string;
  };
}

interface MixcloudDetailResponse {
  tags: MixcloudTag[];
}

async function enrichWithTags(cloudcast: MixcloudCloudcast): Promise<MixcloudCloudcast> {
  if (cloudcast.tags && cloudcast.tags.length > 0) {
    return cloudcast;
  }

  try {
    const detailUrl = `https://api.mixcloud.com${cloudcast.key}`;
    const response = await fetch(detailUrl, {
      headers: { 'Accept': 'application/json' },
    });

    if (response.ok) {
      const detail: MixcloudDetailResponse = await response.json();
      return {
        ...cloudcast,
        tags: detail.tags.slice(0, 5),
      };
    }
  } catch (error) {
    console.error(`Failed to enrich tags for ${cloudcast.key}:`, error);
  }

  return cloudcast;
}

function matchesTags(
  cloudcastTags: MixcloudTag[],
  selectedTags: string[],
  matchMode: 'any' | 'all'
): boolean {
  if (selectedTags.length === 0) return true;

  const cloudcastTagNames = cloudcastTags.map(t => t.name.toLowerCase());
  const selectedTagsLower = selectedTags.map(t => t.toLowerCase());

  if (matchMode === 'all') {
    return selectedTagsLower.every(tag => cloudcastTagNames.includes(tag));
  } else {
    return selectedTagsLower.some(tag => cloudcastTagNames.includes(tag));
  }
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
    const limit = parseInt(url.searchParams.get('limit') || '24', 10);
    const cursor = url.searchParams.get('cursor');
    const tagsParam = url.searchParams.get('tags');
    const matchMode = (url.searchParams.get('match') || 'any') as 'any' | 'all';

    const selectedTags = tagsParam ? tagsParam.split(',').filter(Boolean) : [];

    let mixcloudUrl = cursor || `https://api.mixcloud.com/${username}/cloudcasts/?limit=${limit}`;

    const response = await fetch(mixcloudUrl, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Mixcloud API error: ${response.status}`);
    }

    const data: MixcloudResponse = await response.json();

    const enrichedCloudcasts = await Promise.all(
      data.data.map(cloudcast => enrichWithTags(cloudcast))
    );

    let filteredCloudcasts = enrichedCloudcasts;
    if (selectedTags.length > 0) {
      filteredCloudcasts = enrichedCloudcasts.filter(cloudcast =>
        matchesTags(cloudcast.tags || [], selectedTags, matchMode)
      );
    }

    const items = filteredCloudcasts.map(cloudcast => ({
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
        items,
        nextCursor: data.paging.next || null,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 's-maxage=120, stale-while-revalidate=600',
        },
      },
    );
  } catch (error) {
    console.error('Error fetching Mixcloud explore:', error);
    return new Response(
      JSON.stringify({
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
