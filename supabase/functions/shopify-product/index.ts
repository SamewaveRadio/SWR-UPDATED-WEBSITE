import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const rawStoreDomain = Deno.env.get("SHOPIFY_STORE_DOMAIN") || "";
const SHOPIFY_STORE_DOMAIN = rawStoreDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
const SHOPIFY_STOREFRONT_ACCESS_TOKEN = Deno.env.get("SHOPIFY_STOREFRONT_ACCESS_TOKEN");
const CACHE_TTL = 120;

const cache = new Map<string, { data: unknown; timestamp: number }>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL * 1000) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
}

async function shopifyFetch(query: string, variables: Record<string, unknown> = {}) {
  if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_STOREFRONT_ACCESS_TOKEN) {
    throw new Error("Shopify not configured");
  }

  const response = await fetch(
    `https://${SHOPIFY_STORE_DOMAIN}/api/2025-01/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  const json = await response.json();

  if (json.errors) {
    throw new Error(json.errors[0]?.message || "Shopify API error");
  }

  return json.data;
}

const PRODUCT_QUERY = `
  query GetProduct($handle: String!) {
    productByHandle(handle: $handle) {
      id
      handle
      title
      descriptionHtml
      images(first: 10) {
        edges {
          node {
            url
            altText
          }
        }
      }
      options {
        id
        name
        values
      }
      variants(first: 100) {
        edges {
          node {
            id
            title
            availableForSale
            price {
              amount
              currencyCode
            }
            compareAtPrice {
              amount
              currencyCode
            }
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
  }
`;

interface ShopifyVariant {
  id: string;
  title: string;
  availableForSale: boolean;
  price: { amount: string; currencyCode: string };
  compareAtPrice: { amount: string; currencyCode: string } | null;
  selectedOptions: { name: string; value: string }[];
}

interface ShopifyProductDetail {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  images: { edges: { node: { url: string; altText: string | null } }[] };
  options: { id: string; name: string; values: string[] }[];
  variants: { edges: { node: ShopifyVariant }[] };
}

function normalizeProductDetail(product: ShopifyProductDetail) {
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    descriptionHtml: product.descriptionHtml,
    images: product.images.edges.map((edge) => ({
      url: edge.node.url,
      altText: edge.node.altText || product.title,
    })),
    options: product.options,
    variants: product.variants.edges.map((edge) => {
      const v = edge.node;
      const price = parseFloat(v.price.amount);
      const compareAt = v.compareAtPrice ? parseFloat(v.compareAtPrice.amount) : null;
      return {
        id: v.id,
        title: v.title,
        price,
        compareAtPrice: compareAt && compareAt > price ? compareAt : null,
        currencyCode: v.price.currencyCode,
        availableForSale: v.availableForSale,
        selectedOptions: v.selectedOptions,
      };
    }),
  };
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_STOREFRONT_ACCESS_TOKEN) {
      return new Response(
        JSON.stringify({ error: "Shopify not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const handle = url.searchParams.get("handle");

    if (!handle) {
      return new Response(
        JSON.stringify({ error: "Missing handle parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cacheKey = `product:${handle}`;
    const cached = getCached<unknown>(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    const data = await shopifyFetch(PRODUCT_QUERY, { handle });

    if (!data.productByHandle) {
      return new Response(
        JSON.stringify({ error: "Product not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = normalizeProductDetail(data.productByHandle);
    setCache(cacheKey, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
