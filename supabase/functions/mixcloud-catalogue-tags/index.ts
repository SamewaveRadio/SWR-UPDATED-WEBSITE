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

    // Fetch all catalogue items with their tags
    const { data: items, error } = await supabase
      .from('mixcloud_catalogue')
      .select('tags');

    if (error) {
      throw error;
    }

    // Extract unique tag names
    const tagSet = new Set<string>();
    items?.forEach((item: { tags: MixcloudTag[] }) => {
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