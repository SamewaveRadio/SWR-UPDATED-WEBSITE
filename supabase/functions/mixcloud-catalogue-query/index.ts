import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface MixcloudTag {
  name: string;
  url: string;
}

interface CatalogueItem {
  url: string;
  name: string;
  created_time: string;
  pictures: {
    extra_large: string;
    large?: string;
    medium?: string;
    thumbnail?: string;
  };
  tags: MixcloudTag[];
}

function matchesTags(
  itemTags: MixcloudTag[],
  selectedTags: string[],
  matchMode: 'any' | 'all'
): boolean {
  if (selectedTags.length === 0) return true;

  const itemTagNames = itemTags.map(t => t.name.toLowerCase());
  const selectedTagsLower = selectedTags.map(t => t.toLowerCase());

  if (matchMode === 'all') {
    return selectedTagsLower.every(tag => itemTagNames.includes(tag));
  } else {
    return selectedTagsLower.some(tag => itemTagNames.includes(tag));
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
    const limit = parseInt(url.searchParams.get('limit') || '24', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const tagsParam = url.searchParams.get('tags');
    const matchMode = (url.searchParams.get('match') || 'any') as 'any' | 'all';

    const selectedTags = tagsParam ? tagsParam.split(',').filter(Boolean) : [];

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all items (we'll filter in memory for complex tag matching)
    const { data: allItems, error } = await supabase
      .from('mixcloud_catalogue')
      .select('url, name, created_time, pictures, tags')
      .order('created_time', { ascending: false });

    if (error) {
      throw error;
    }

    // Filter by tags
    let filteredItems = allItems || [];
    if (selectedTags.length > 0) {
      filteredItems = filteredItems.filter((item: CatalogueItem) =>
        matchesTags(item.tags || [], selectedTags, matchMode)
      );
    }

    // Calculate pagination
    const total = filteredItems.length;
    const hasMore = offset + limit < total;
    const paginatedItems = filteredItems.slice(offset, offset + limit);

    // Format items
    const items = paginatedItems.map((item: CatalogueItem) => ({
      name: item.name,
      url: item.url,
      created_time: item.created_time,
      pictures: {
        extra_large: item.pictures.extra_large,
      },
      tags: item.tags || [],
    }));

    return new Response(
      JSON.stringify({
        items,
        nextCursor: hasMore ? (offset + limit).toString() : null,
        total,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 's-maxage=120, stale-while-revalidate=600',
        },
      }
    );
  } catch (error) {
    console.error('Error querying catalogue:', error);
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