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

const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      edges {
        node {
          id
          handle
          title
          featuredImage {
            url
            altText
          }
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          compareAtPriceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          availableForSale
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

interface ShopifyProduct {
  id: string;
  handle: string;
  title: string;
  featuredImage: { url: string; altText: string | null } | null;
  priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
  compareAtPriceRange: { minVariantPrice: { amount: string; currencyCode: string } };
  availableForSale: boolean;
}

function normalizeProduct(product: ShopifyProduct) {
  const price = parseFloat(product.priceRange.minVariantPrice.amount);
  const compareAt = parseFloat(product.compareAtPriceRange.minVariantPrice.amount);
  
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    imageUrl: product.featuredImage?.url || null,
    imageAlt: product.featuredImage?.altText || product.title,
    price: price,
    compareAtPrice: compareAt > price ? compareAt : null,
    currencyCode: product.priceRange.minVariantPrice.currencyCode,
    availableForSale: product.availableForSale,
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
    const first = parseInt(url.searchParams.get("first") || "12", 10);
    const after = url.searchParams.get("after") || null;
    const query = url.searchParams.get("query") || null;

    const cacheKey = `products:${first}:${after}:${query}`;
    const cached = getCached<unknown>(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    const data = await shopifyFetch(PRODUCTS_QUERY, { first, after, query });
    
    const result = {
      items: data.products.edges.map((edge: { node: ShopifyProduct }) => normalizeProduct(edge.node)),
      pageInfo: data.products.pageInfo,
    };

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
