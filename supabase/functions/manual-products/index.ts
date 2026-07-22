import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { persistSession: false } }
    );

    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    const adminPreview = url.searchParams.get("preview") === "true";

    // For admin preview, authenticate the caller and allow draft/archived products
    let isAdmin = false;
    if (adminPreview) {
      const authHeader = req.headers.get("Authorization");
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "");
        const adminClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          { auth: { persistSession: false } },
        );
        const { data: { user } } = await adminClient.auth.getUser(token);
        isAdmin = Boolean(user);
      }
    }

    // Single product by slug
    if (slug) {
      // Public visitors can only see public and unlisted products.
      // Admins with a valid token can preview draft and archived products.
      const allowedVisibilities = isAdmin
        ? ["public", "unlisted", "draft", "archived"]
        : ["public", "unlisted"];

      const { data: product, error } = await supabase
        .from("products")
        .select("*")
        .eq("slug", slug)
        .in("visibility", allowedVisibilities)
        .maybeSingle();

      if (error) return jsonResponse({ error: error.message }, 500);
      if (!product) return jsonResponse({ error: "Product not found" }, 404);

      const { data: variants } = await supabase
        .from("product_variants")
        .select("*")
        .eq("product_id", product.id)
        .eq("is_enabled", true)
        .order("position", { ascending: true });

      const { data: images } = await supabase
        .from("product_images")
        .select("*")
        .eq("product_id", product.id)
        .order("position", { ascending: true });

      return jsonResponse({ product, variants: variants ?? [], images: images ?? [] });
    }

    // List only public products for the shop
    const { data: products, error } = await supabase
      .from("products")
      .select("id, slug, title, description, source, base_price_cents, currency, category, tags, visibility")
      .eq("visibility", "public")
      .order("updated_at", { ascending: false });

    if (error) return jsonResponse({ error: error.message }, 500);

    const productIds = (products ?? []).map(p => p.id);
    let imagesByProduct: Record<string, Array<{ src: string; position: number }>> = {};
    let variantsByProduct: Record<string, Array<{ id: string; price_cents: number; title: string; options: Record<string, string> }>> = {};

    if (productIds.length > 0) {
      const { data: images } = await supabase
        .from("product_images")
        .select("product_id, src, position")
        .in("product_id", productIds)
        .order("position", { ascending: true });

      for (const img of images ?? []) {
        if (!imagesByProduct[img.product_id]) imagesByProduct[img.product_id] = [];
        imagesByProduct[img.product_id].push({ src: img.src, position: img.position });
      }

      const { data: variants } = await supabase
        .from("product_variants")
        .select("id, product_id, price_cents, title, options")
        .eq("is_enabled", true)
        .in("product_id", productIds)
        .order("position", { ascending: true });

      for (const v of variants ?? []) {
        if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
        variantsByProduct[v.product_id].push(v);
      }
    }

    const items = (products ?? []).map(p => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      description: p.description,
      source: p.source,
      basePriceCents: p.base_price_cents,
      currency: p.currency,
      category: p.category,
      tags: p.tags,
      visibility: p.visibility,
      images: (imagesByProduct[p.id] ?? []).map((img, i) => ({
        id: `img-${i}`,
        src: img.src,
        alt: p.title,
        position: img.position,
      })),
      variants: (variantsByProduct[p.id] ?? []).map(v => ({
        id: v.id,
        variantId: v.id,
        sku: null,
        title: v.title,
        color: v.options?.color ?? null,
        size: v.options?.size ?? null,
        price: new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency || "USD" }).format(v.price_cents / 100),
        priceCents: v.price_cents,
      })),
    }));

    return jsonResponse({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
