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

interface PrintifyOptionValue {
  id: number;
  title: string;
}

interface PrintifyOption {
  name: string;
  type: string;
  values: PrintifyOptionValue[];
}

interface PrintifyVariant {
  id: number;
  sku: string;
  cost: number;
  price: number;
  title: string;
  is_enabled: boolean;
  is_available: boolean;
  // options is an array of option value IDs, not a color/size object
  options: number[];
}

interface PrintifyExternalRecord {
  id: string;
  handle: string;
  [key: string]: unknown;
}

interface PrintifyProduct {
  id: number;
  title: string;
  description: string;
  tags: string[];
  images: PrintifyImage[];
  variants: PrintifyVariant[];
  options: PrintifyOption[];
  is_visible: boolean;
  visible: boolean;
  external: PrintifyExternalRecord | PrintifyExternalRecord[] | null;
  [key: string]: unknown;
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

interface CartLineItem {
  productId: number;
  variantId: number;
  quantity: number;
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function isPublicProduct(product: PrintifyProduct): boolean {
  if (product.visible !== true) return false;

  const externalRecords: PrintifyExternalRecord[] = Array.isArray(product.external)
    ? product.external
    : product.external
      ? [product.external]
      : [];

  const hasPublishedStorefrontRecord = externalRecords.some(
    (record) =>
      typeof record?.id === "string" &&
      record.id.trim().length > 0 &&
      typeof record?.handle === "string" &&
      record.handle.trim().length > 0
  );

  return hasPublishedStorefrontRecord;
}

function buildOptionLookup(product: PrintifyProduct): {
  colorMap: Map<number, string>;
  sizeMap: Map<number, string>;
} {
  const colorMap = new Map<number, string>();
  const sizeMap = new Map<number, string>();

  for (const opt of product.options ?? []) {
    const isColor = opt.type === "color" || /color/i.test(opt.name);
    const isSize = opt.type === "size" || /size/i.test(opt.name);
    for (const val of opt.values ?? []) {
      if (isColor) colorMap.set(val.id, val.title);
      else if (isSize) sizeMap.set(val.id, val.title);
    }
  }

  return { colorMap, sizeMap };
}

function parseColorSizeFromTitle(title: string): { color: string | null; size: string | null } {
  // Printify variant titles are typically "Color / Size" or just "Color" or just "Size"
  const parts = title.split(" / ").map((p) => p.trim());
  if (parts.length >= 2) {
    return { color: parts[0], size: parts[1] };
  }
  // Single part — can't reliably determine if it's color or size from title alone
  return { color: null, size: null };
}

function normalizeProduct(product: PrintifyProduct): NormalizedProduct | null {
  if (!isPublicProduct(product)) return null;

  const mockupImages = product.images.map((img) => ({
    id: img.id,
    src: img.src,
    position: img.position,
    default: img.default,
  }));

  const { colorMap, sizeMap } = buildOptionLookup(product);

  const variants = product.variants
    .filter((v) => v.is_enabled && v.is_available)
    .map<NormalizedVariant>((v) => {
      // Resolve color/size from the option value IDs in v.options
      let color: string | null = null;
      let size: string | null = null;

      if (Array.isArray(v.options)) {
        for (const optId of v.options) {
          if (colorMap.has(optId)) color = colorMap.get(optId)!;
          else if (sizeMap.has(optId)) size = sizeMap.get(optId)!;
        }
      }

      // Fallback: parse from title if option lookup didn't yield results
      if (!color || !size) {
        const parsed = parseColorSizeFromTitle(v.title);
        if (!color) color = parsed.color;
        if (!size) size = parsed.size;
      }

      return {
        variantId: v.id,
        sku: v.sku,
        title: v.title,
        color,
        size,
        price: formatPrice(v.price),
        priceCents: v.price,
      };
    });

  return {
    id: product.id,
    title: product.title,
    description: product.description,
    tags: product.tags,
    mockupImages,
    variants,
  };
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${PRINTIFY_API_TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "SamewaveRadio-PrintifyProducts/1.0",
  };
}

async function fetchPrintifyProducts(): Promise<PrintifyProduct[]> {
  const url = `${PRINTIFY_API_BASE}/shops/${PRINTIFY_SHOP_ID}/products.json`;
  const response = await fetch(url, { headers: authHeaders() });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Printify API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  if (Array.isArray(data)) return data as PrintifyProduct[];
  if (data && Array.isArray(data.data)) return data.data as PrintifyProduct[];
  return [];
}

async function fetchPrintifyProduct(productId: string): Promise<PrintifyProduct | null> {
  const url = `${PRINTIFY_API_BASE}/shops/${PRINTIFY_SHOP_ID}/products/${productId}.json`;
  const response = await fetch(url, { headers: authHeaders() });

  if (!response.ok) {
    if (response.status === 404) return null;
    const body = await response.text();
    throw new Error(`Printify API error ${response.status}: ${body}`);
  }

  return await response.json() as PrintifyProduct;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (!PRINTIFY_API_TOKEN || !PRINTIFY_SHOP_ID) {
      return jsonResponse({ error: "Printify is not configured" }, 500);
    }

    // GET: product list or single product detail
    if (req.method === "GET") {
      const url = new URL(req.url);
      const productId = url.searchParams.get("productId");

      // Single product detail
      if (productId) {
        const raw = await fetchPrintifyProduct(productId);
        if (!raw || !isPublicProduct(raw)) {
          return jsonResponse({ error: "Product not found" }, 404);
        }
        const normalized = normalizeProduct(raw);
        if (!normalized) {
          return jsonResponse({ error: "Product not found" }, 404);
        }
        return jsonResponse({ item: normalized });
      }

      // Full product list
      const rawProducts = await fetchPrintifyProducts();
      const products = rawProducts
        .map(normalizeProduct)
        .filter((p): p is NormalizedProduct => p !== null);

      return jsonResponse({ items: products });
    }

    // POST: cart validation — verify all items are published and variants exist
    if (req.method === "POST") {
      const body = await req.json();
      const { items } = body as { items?: CartLineItem[] };

      if (!items || !Array.isArray(items) || items.length === 0) {
        return jsonResponse({ error: "items array is required" }, 400);
      }

      const rawProducts = await fetchPrintifyProducts();
      const productMap = new Map<number, PrintifyProduct>();
      for (const p of rawProducts) {
        if (isPublicProduct(p)) productMap.set(p.id, p);
      }

      const validItems: CartLineItem[] = [];
      const rejectedItems: CartLineItem[] = [];

      for (const item of items) {
        const product = productMap.get(item.productId);
        if (!product) {
          rejectedItems.push(item);
          continue;
        }

        const variant = product.variants.find(
          (v) => v.id === item.variantId && v.is_enabled && v.is_available
        );
        if (!variant) {
          rejectedItems.push(item);
          continue;
        }

        validItems.push(item);
      }

      if (rejectedItems.length > 0) {
        return jsonResponse({
          valid: false,
          error: "Some items in your cart are no longer available",
          rejectedItems,
        }, 200);
      }

      return jsonResponse({ valid: true, items: validItems });
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
