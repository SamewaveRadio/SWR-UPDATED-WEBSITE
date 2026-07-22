import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PRINTIFY_API_TOKEN = Deno.env.get("PRINTIFY_API_TOKEN");
const PRINTIFY_SHOP_ID = Deno.env.get("PRINTIFY_SHOP_ID");
const PRINTIFY_API_BASE = "https://api.printify.com/v1";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface CartLineItem {
  productId: number;
  variantId: number;
  quantity: number;
  source: string;
  internalProductId: string | null;
  internalVariantId: string | null;
  slug: string | null;
}

interface ValidatedItem {
  productId: number;
  variantId: number;
  quantity: number;
  source: string;
  internalProductId: string | null;
  internalVariantId: string | null;
  slug: string | null;
  title: string;
  variantTitle: string;
  priceCents: number;
}

interface RejectedItem {
  productId: number;
  variantId: number;
  reason: string;
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${PRINTIFY_API_TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "SamewaveRadio-CheckoutValidate/1.0",
  };
}

async function fetchPrintifyProducts(): Promise<Map<number, unknown>> {
  if (!PRINTIFY_API_TOKEN || !PRINTIFY_SHOP_ID) return new Map();

  const url = `${PRINTIFY_API_BASE}/shops/${PRINTIFY_SHOP_ID}/products.json`;
  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) return new Map();

  const data = await response.json();
  const products: any[] = Array.isArray(data) ? data : (data?.data ?? []);
  const map = new Map<number, any>();
  for (const p of products) {
    const external = Array.isArray(p.external) ? p.external : p.external ? [p.external] : [];
    const isPublished = p.visible === true && external.some(
      (r: any) => typeof r?.id === "string" && r.id.trim().length > 0 && typeof r?.handle === "string" && r.handle.trim().length > 0
    );
    if (isPublished) map.set(p.id, p);
  }
  return map;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const body = await req.json();
    const { items } = body as { items?: CartLineItem[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return jsonResponse({ error: "items array is required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Fetch all published Printify products once
    const printifyMap = await fetchPrintifyProducts();

    // Fetch all manual products that are public or unlisted
    const { data: manualProducts } = await supabase
      .from("products")
      .select("id, slug, title, visibility, source")
      .eq("source", "manual")
      .in("visibility", ["public", "unlisted"]);

    const manualMap = new Map<string, any>();
    for (const p of manualProducts ?? []) {
      manualMap.set(p.slug, p);
    }

    // Fetch manual product variants for validation
    const manualProductIds = (manualProducts ?? []).map((p) => p.id);
    const { data: manualVariants } = await supabase
      .from("product_variants")
      .select("id, product_id, price_cents, title, is_enabled")
      .in("product_id", manualProductIds);

    const variantMap = new Map<string, any>();
    for (const v of manualVariants ?? []) {
      variantMap.set(v.id, v);
    }

    // Fetch inventory for manual products with track_inventory
    const { data: inventory } = await supabase
      .from("inventory_transactions")
      .select("variant_id, quantity")
      .in("variant_id", manualProductIds.length > 0 ? Array.from(variantMap.keys()) : ["00000000-0000-0000-0000-000000000000"]);

    const inventoryMap = new Map<string, number>();
    for (const tx of inventory ?? []) {
      inventoryMap.set(tx.variant_id, (inventoryMap.get(tx.variant_id) ?? 0) + tx.quantity);
    }

    const validItems: ValidatedItem[] = [];
    const rejectedItems: RejectedItem[] = [];

    for (const item of items) {
      if (item.source === "manual") {
        // Validate manual product
        const product = item.slug ? manualMap.get(item.slug) : null;
        if (!product) {
          rejectedItems.push({ productId: item.productId, variantId: item.variantId, reason: "Product not found or not visible" });
          continue;
        }

        const variant = item.internalVariantId ? variantMap.get(item.internalVariantId) : null;
        if (!variant || !variant.is_enabled) {
          rejectedItems.push({ productId: item.productId, variantId: item.variantId, reason: "Variant not available" });
          continue;
        }

        // Check inventory if tracked
        const { data: fullProduct } = await supabase
          .from("products")
          .select("track_inventory")
          .eq("id", product.id)
          .maybeSingle();

        if (fullProduct?.track_inventory) {
          const stock = inventoryMap.get(variant.id) ?? 0;
          if (stock < item.quantity) {
            rejectedItems.push({ productId: item.productId, variantId: item.variantId, reason: "Insufficient inventory" });
            continue;
          }
        }

        validItems.push({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          source: "manual",
          internalProductId: product.id,
          internalVariantId: variant.id,
          slug: item.slug,
          title: product.title,
          variantTitle: variant.title,
          priceCents: variant.price_cents,
        });
      } else {
        // Validate Printify product
        const product: any = printifyMap.get(item.productId);
        if (!product) {
          rejectedItems.push({ productId: item.productId, variantId: item.variantId, reason: "Product not found or unpublished" });
          continue;
        }

        const variant = product.variants?.find(
          (v: any) => v.id === item.variantId && v.is_enabled && v.is_available
        );
        if (!variant) {
          rejectedItems.push({ productId: item.productId, variantId: item.variantId, reason: "Variant not available" });
          continue;
        }

        validItems.push({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          source: "printify",
          internalProductId: null,
          internalVariantId: null,
          slug: null,
          title: product.title,
          variantTitle: variant.title,
          priceCents: variant.price,
        });
      }
    }

    if (rejectedItems.length > 0) {
      return jsonResponse({
        valid: false,
        error: "Some items in your cart are no longer available",
        rejectedItems,
        validItems,
      }, 200);
    }

    return jsonResponse({ valid: true, validItems });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
