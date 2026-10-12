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

const PAGE = 1000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const items: { tags: MixcloudTag[] }[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('mixcloud_catalogue')
        .select('tags')
        .order('created_time', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      items.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }

    const tagSet = new Set<string>();
    items.forEach((item) => {
      if (Array.isArray(item.tags)) {
        item.tags.forEach((tag: MixcloudTag) => {
          if (tag.name) {
            tagSet.add(tag.name);
          }
        });
      }
    });

    // Sort tags alphabetically
    const tags = Array.from(tagSet).sort();

    return new Response(
      JSON.stringify({ tags }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching tags:', error);
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