import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Rebuild-Secret",
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
        tags: detail.tags,
      };
    }
  } catch (error) {
    console.error(`Failed to enrich tags for ${cloudcast.key}:`, error);
  }

  return cloudcast;
}

async function fetchAllCloudcasts(username: string): Promise<MixcloudCloudcast[]> {
  const allCloudcasts: MixcloudCloudcast[] = [];
  let nextUrl: string | null = `https://api.mixcloud.com/${username}/cloudcasts/?limit=100`;
  let pageCount = 0;

  while (nextUrl) {
    pageCount++;
    console.log(`Fetching page ${pageCount}...`);

    const response = await fetch(nextUrl, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Mixcloud API error: ${response.status}`);
    }

    const data: MixcloudResponse = await response.json();
    allCloudcasts.push(...data.data);

    nextUrl = data.paging.next || null;

    if (nextUrl) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`Fetched ${allCloudcasts.length} cloudcasts in ${pageCount} pages`);
  return allCloudcasts;
}

async function enrichCloudcastsWithTags(
  cloudcasts: MixcloudCloudcast[],
  concurrency: number = 5
): Promise<MixcloudCloudcast[]> {
  const results: MixcloudCloudcast[] = [];
  const queue = [...cloudcasts];

  const workers = Array(concurrency).fill(null).map(async () => {
    while (queue.length > 0) {
      const cloudcast = queue.shift();
      if (!cloudcast) break;

      const enriched = await enrichWithTags(cloudcast);
      results.push(enriched);

      if (results.length % 50 === 0) {
        console.log(`Enriched ${results.length}/${cloudcasts.length} cloudcasts`);
      }
    }
  });

  await Promise.all(workers);
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
    const token = req.headers.get('X-Rebuild-Secret');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: metadata, error: metadataError } = await supabase
      .from('mixcloud_index_metadata')
      .select('rebuild_secret')
      .single();

    if (metadataError || !metadata) {
      throw new Error('Failed to retrieve metadata');
    }

    if (token !== metadata.rebuild_secret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const url = new URL(req.url);
    const username = url.searchParams.get('username') || 'samewaveradio';

    console.log(`Starting catalogue rebuild for ${username}...`);

    const cloudcasts = await fetchAllCloudcasts(username);
    console.log(`Enriching ${cloudcasts.length} cloudcasts with tags...`);

    const enriched = await enrichCloudcastsWithTags(cloudcasts, 3);

    console.log('Clearing existing catalogue...');
    await supabase.from('mixcloud_catalogue').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    console.log(`Inserting ${enriched.length} items into database...`);
    const batchSize = 100;
    for (let i = 0; i < enriched.length; i += batchSize) {
      const batch = enriched.slice(i, i + batchSize);
      const records = batch.map(cloudcast => ({
        url: `https://www.mixcloud.com${cloudcast.url}`,
        name: cloudcast.name,
        created_time: cloudcast.created_time,
        pictures: cloudcast.pictures,
        tags: cloudcast.tags || [],
      }));

      const { error: insertError } = await supabase
        .from('mixcloud_catalogue')
        .insert(records);

      if (insertError) {
        console.error('Batch insert error:', insertError);
        throw insertError;
      }

      console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(enriched.length / batchSize)}`);
    }

    await supabase
      .from('mixcloud_index_metadata')
      .update({
        last_updated: new Date().toISOString(),
        total_count: enriched.length,
        updated_at: new Date().toISOString(),
      })
      .eq('id', metadata.id || '');

    console.log('Rebuild complete!');

    return new Response(
      JSON.stringify({
        success: true,
        total: enriched.length,
        message: 'Catalogue rebuilt successfully',
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error rebuilding catalogue:', error);
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
      }
    );
  }
});
