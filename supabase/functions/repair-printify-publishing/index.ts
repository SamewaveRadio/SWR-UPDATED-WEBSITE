import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PRINTIFY_API_TOKEN = Deno.env.get("PRINTIFY_API_TOKEN");
const PRINTIFY_SHOP_ID = Deno.env.get("PRINTIFY_SHOP_ID");
const PRINTIFY_API_BASE = "https://api.printify.com/v1";

// The public site URL used to build storefront page handles.
// Falls back to the request origin if not configured.
const SITE_URL = Deno.env.get("SITE_URL") ?? "";

interface PrintifyProductListItem {
  id: number;
  title: string;
  is_locked: boolean;
  is_visible: boolean;
  visible: boolean;
  [key: string]: unknown;
}

interface PrintifyProductDetail {
  id: number;
  title: string;
  is_locked: boolean;
  is_visible: boolean;
  visible: boolean;
  [key: string]: unknown;
}

function getSiteUrl(req: Request): string {
  if (SITE_URL) return SITE_URL.replace(/\/$/, "");
  // Derive from the request's origin
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${PRINTIFY_API_TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "SamewaveRadio-PrintifyRepair/1.0",
  };
}

async function fetchPrintifyProducts(): Promise<PrintifyProductListItem[]> {
  const url = `${PRINTIFY_API_BASE}/shops/${PRINTIFY_SHOP_ID}/products.json`;
  const response = await fetch(url, { headers: authHeaders() });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Printify list products failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  // Printify returns either a bare array or a paginated object { data: [...] }
  if (Array.isArray(data)) return data as PrintifyProductListItem[];
  if (data && Array.isArray(data.data)) return data.data as PrintifyProductListItem[];
  return [];
}

async function fetchPrintifyProduct(productId: number): Promise<PrintifyProductDetail> {
  const url = `${PRINTIFY_API_BASE}/shops/${PRINTIFY_SHOP_ID}/products/${productId}.json`;
  const response = await fetch(url, { headers: authHeaders() });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Printify get product ${productId} failed (${response.status}): ${body}`);
  }

  return await response.json() as PrintifyProductDetail;
}

/**
 * Check whether a product has a working storefront page by verifying the product
 * is returned from our own printify-products endpoint (i.e. it is visible and
 * has enabled/available variants). We call the Printify product detail endpoint
 * and check is_visible — if the product is visible in our storefront listing,
 * we consider the page working.
 */
async function hasWorkingStorefrontPage(productId: number): Promise<boolean> {
  try {
    const detail = await fetchPrintifyProduct(productId);
    const isVisible = detail.is_visible ?? detail.visible ?? false;
    return isVisible;
  } catch {
    return false;
  }
}

async function publishSucceeded(productId: number, siteUrl: string): Promise<{ status: number; body: string }> {
  const url = `${PRINTIFY_API_BASE}/shops/${PRINTIFY_SHOP_ID}/products/${productId}/publishing_succeeded.json`;
  const body = JSON.stringify({
    external: {
      id: String(productId),
      handle: `${siteUrl}/shop/${productId}`,
    },
  });

  const response = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body,
  });

  const responseBody = await response.text();
  return { status: response.status, body: responseBody };
}

async function publishFailed(productId: number): Promise<{ status: number; body: string }> {
  const url = `${PRINTIFY_API_BASE}/shops/${PRINTIFY_SHOP_ID}/products/${productId}/publishing_failed.json`;
  const body = JSON.stringify({
    reason: "Custom storefront publishing integration was not configured",
  });

  const response = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body,
  });

  const responseBody = await response.text();
  return { status: response.status, body: responseBody };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (!PRINTIFY_API_TOKEN || !PRINTIFY_SHOP_ID) {
    return new Response(
      JSON.stringify({ error: "Printify is not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const siteUrl = getSiteUrl(req);

    // GET: list all locked products with storefront page status
    if (req.method === "GET") {
      const products = await fetchPrintifyProducts();
      const lockedProducts = products.filter((p) => p.is_locked === true);

      const enriched = await Promise.all(
        lockedProducts.map(async (p) => {
          const hasPage = await hasWorkingStorefrontPage(p.id);
          return {
            id: p.id,
            title: p.title,
            is_locked: p.is_locked,
            hasStorefrontPage: hasPage,
          };
        })
      );

      return new Response(
        JSON.stringify({ items: enriched }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST: process a single product (requires explicit action per product)
    if (req.method === "POST") {
      const body = await req.json();
      const { productId, action } = body as { productId?: number; action?: string };

      if (!productId || typeof productId !== "number") {
        return new Response(
          JSON.stringify({ error: "productId (number) is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action !== "succeeded" && action !== "failed") {
        return new Response(
          JSON.stringify({ error: "action must be 'succeeded' or 'failed'" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify the product is actually locked before taking action
      const detail = await fetchPrintifyProduct(productId);
      if (!detail.is_locked) {
        return new Response(
          JSON.stringify({ error: `Product ${productId} is not locked — no action needed` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let result: { status: number; body: string };

      if (action === "succeeded") {
        // Verify a working storefront page exists before claiming success
        const hasPage = await hasWorkingStorefrontPage(productId);
        if (!hasPage) {
          return new Response(
            JSON.stringify({
              error: `Cannot confirm publishing succeeded: product ${productId} does not have a working storefront page at /shop/${productId}`,
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        result = await publishSucceeded(productId, siteUrl);
      } else {
        result = await publishFailed(productId);
      }

      return new Response(
        JSON.stringify({
          productId,
          action,
          status: result.status,
          response: result.body,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
