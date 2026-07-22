import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PRINTIFY_API_TOKEN = Deno.env.get("PRINTIFY_API_TOKEN");
const PRINTIFY_SHOP_ID = Deno.env.get("PRINTIFY_SHOP_ID");
const PRINTIFY_API_BASE = "https://api.printify.com/v1";

interface PrintifyImage {
  id: number;
  variant_ids: number[];
  position: string;
  src: string;
  default: boolean;
}

interface PrintifyVariant {
  id: number;
  sku: string;
  cost: number;
  price: number;
  title: string;
  is_enabled: boolean;
  is_available: boolean;
  options: {
    color?: string;
    size?: string;
    [key: string]: string | undefined;
  };
}

interface PrintifyProduct {
  id: number;
  title: string;
  description: string;
  tags: string[];
  images: PrintifyImage[];
  variants: PrintifyVariant[];
  is_visible: boolean;
  visible: boolean;
}

interface NormalizedVariant {
  variantId: number;
  sku: string;
  title: string;
  color: string | null;
  size: string | null;
  price: string;
  priceCents: number;
}

interface NormalizedProduct {
  id: number;
  title: string;
  description: string;
  tags: string[];
  mockupImages: { id: number; src: string; position: string; default: boolean }[];
  variants: NormalizedVariant[];
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function normalizeProduct(product: PrintifyProduct): NormalizedProduct | null {
  const isVisible = product.is_visible ?? product.visible ?? false;
  if (!isVisible) return null;

  const mockupImages = product.images.map((img) => ({
    id: img.id,
    src: img.src,
    position: img.position,
    default: img.default,
  }));

  const variants = product.variants
    .filter((v) => v.is_enabled && v.is_available)
    .map<NormalizedVariant>((v) => ({
      variantId: v.id,
      sku: v.sku,
      title: v.title,
      color: v.options.color ?? null,
      size: v.options.size ?? null,
      price: formatPrice(v.price),
      priceCents: v.price,
    }));

  return {
    id: product.id,
    title: product.title,
    description: product.description,
    tags: product.tags,
    mockupImages,
    variants,
  };
}

async function fetchPrintifyProducts(): Promise<PrintifyProduct[]> {
  const url = `${PRINTIFY_API_BASE}/shops/${PRINTIFY_SHOP_ID}/products.json`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${PRINTIFY_API_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Printify API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  return data as PrintifyProduct[];
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (!PRINTIFY_API_TOKEN || !PRINTIFY_SHOP_ID) {
      return new Response(
        JSON.stringify({ error: "Printify is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method !== "GET") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawProducts = await fetchPrintifyProducts();
    const products = rawProducts
      .map(normalizeProduct)
      .filter((p): p is NormalizedProduct => p !== null);

    return new Response(JSON.stringify({ items: products }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
