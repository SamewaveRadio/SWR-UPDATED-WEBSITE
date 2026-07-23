import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@17.7.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PRINTIFY_API_TOKEN = Deno.env.get("PRINTIFY_API_TOKEN");
const PRINTIFY_SHOP_ID = Deno.env.get("PRINTIFY_SHOP_ID");
const PRINTIFY_API_BASE = "https://api.printify.com/v1";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://samewave.radio";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function printifyAuthHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${PRINTIFY_API_TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "SamewaveRadio-Checkout/1.0",
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckoutItemRequest {
  source: string;
  productId: string | number;
  variantId: number;
  quantity: number;
  internalProductId: string | null;
  internalVariantId: string | null;
  slug: string | null;
  colorwayId: string | null;
  colorwayName: string | null;
  colorwayImageUrl: string | null;
}

interface ShippingAddressRequest {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface CheckoutRequestBody {
  items: CheckoutItemRequest[];
  email: string;
  shippingAddress: ShippingAddressRequest;
}

interface ValidatedLineItem {
  source: "printify" | "manual";
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  unitPriceCents: number;
  quantity: number;
  shippingClass: string;
  internalProductId: string | null;
  internalVariantId: string | null;
  colorwayId: string | null;
  colorwayName: string | null;
  colorwayImageUrl: string | null;
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const MAX_ITEMS = 50;
const MAX_QUANTITY_PER_ITEM = 99;

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function validateShippingAddress(addr: ShippingAddressRequest): string | null {
  if (!addr.name?.trim()) return "Name is required";
  if (!addr.line1?.trim()) return "Address line 1 is required";
  if (!addr.city?.trim()) return "City is required";
  if (!addr.state?.trim()) return "State is required";
  if (!addr.postalCode?.trim()) return "Postal code is required";
  if (!addr.country?.trim() || addr.country.length !== 2) return "Valid 2-letter country code is required";
  return null;
}

function validateItems(items: CheckoutItemRequest[]): string | null {
  if (!items || !Array.isArray(items) || items.length === 0) return "Cart is empty";
  if (items.length > MAX_ITEMS) return `Too many items (max ${MAX_ITEMS})`;
  for (const item of items) {
    if (item.productId === undefined || item.productId === null || item.productId === '') return "Invalid product ID";
    if (!Number.isInteger(item.variantId)) return "Invalid variant ID";
    if (!Number.isInteger(item.quantity) || item.quantity < 1) return "Invalid quantity";
    if (item.quantity > MAX_QUANTITY_PER_ITEM) return `Quantity too high (max ${MAX_QUANTITY_PER_ITEM})`;
    if (item.source !== "printify" && item.source !== "manual") return "Invalid product source";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Printify helpers
// ---------------------------------------------------------------------------

interface PrintifyProduct {
  id: string | number;
  title: string;
  description: string;
  tags: string[];
  images: Array<{ id: number; src: string; position: string; default: boolean }>;
  variants: Array<{
    id: number;
    sku: string;
    price: number;
    title: string;
    is_enabled: boolean;
    is_available: boolean;
    options: Record<string, string | undefined>;
  }>;
  visible: boolean;
  external: Array<{ id: string; handle: string }> | { id: string; handle: string } | null;
}

function isPrintifyPublished(product: PrintifyProduct): boolean {
  if (product.visible !== true) return false;
  const records = Array.isArray(product.external) ? product.external : product.external ? [product.external] : [];
  return records.some((r) => typeof r?.id === "string" && r.id.trim().length > 0 && typeof r?.handle === "string" && r.handle.trim().length > 0);
}

async function fetchAllPrintifyProducts(): Promise<Map<string, PrintifyProduct>> {
  const map = new Map<string, PrintifyProduct>();
  if (!PRINTIFY_API_TOKEN || !PRINTIFY_SHOP_ID) return map;

  const url = `${PRINTIFY_API_BASE}/shops/${PRINTIFY_SHOP_ID}/products.json`;
  const res = await fetch(url, { headers: printifyAuthHeaders() });
  if (!res.ok) return map;

  const data = await res.json();
  const products: PrintifyProduct[] = Array.isArray(data) ? data : data?.data ?? [];
  for (const p of products) {
    if (isPrintifyPublished(p)) map.set(String(p.id), p);
  }
  return map;
}

async function fetchPrintifyShippingEstimate(
  productId: string | number,
  variantId: number,
  quantity: number,
  address: ShippingAddressRequest,
): Promise<number> {
  if (!PRINTIFY_API_TOKEN || !PRINTIFY_SHOP_ID) return 0;

  const url = `${PRINTIFY_API_BASE}/shops/${PRINTIFY_SHOP_ID}/orders/shipping.json`;
  const body = {
    line_items: [
      {
        product_id: productId,
        variant_id: variantId,
        quantity,
      },
    ],
    address_to: {
      first_name: address.name.split(" ")[0] ?? "",
      last_name: address.name.split(" ").slice(1).join(" ") ?? "",
      email: "",
      country: address.country,
      region: address.state,
      city: address.city,
      zip: address.postalCode,
      address1: address.line1,
      address2: address.line2 ?? "",
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: printifyAuthHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    // Printify returns shipping costs grouped; sum them
    const shippingGroups = data?.shipping_options ?? data?.shipping ?? [];
    if (Array.isArray(shippingGroups)) {
      return shippingGroups.reduce((sum: number, group: any) => sum + (group?.cost ?? 0), 0);
    }
    return 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Manual product shipping classes
// ---------------------------------------------------------------------------

const MANUAL_SHIPPING_RATES: Record<string, { firstItemCents: number; additionalItemCents: number }> = {
  standard: { firstItemCents: 495, additionalItemCents: 150 },
  media: { firstItemCents: 395, additionalItemCents: 100 },
  heavy: { firstItemCents: 895, additionalItemCents: 350 },
  free: { firstItemCents: 0, additionalItemCents: 0 },
};

function calculateManualShipping(items: ValidatedLineItem[]): number {
  const manualItems = items.filter((i) => i.source === "manual");
  if (manualItems.length === 0) return 0;

  // Group by shipping class, calculate per-class then sum
  const byClass = new Map<string, number>();
  for (const item of manualItems) {
    const cls = item.shippingClass || "standard";
    byClass.set(cls, (byClass.get(cls) ?? 0) + item.quantity);
  }

  let total = 0;
  for (const [cls, qty] of byClass) {
    const rate = MANUAL_SHIPPING_RATES[cls] ?? MANUAL_SHIPPING_RATES.standard;
    total += rate.firstItemCents + (qty - 1) * rate.additionalItemCents;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    if (!STRIPE_SECRET_KEY) {
      return jsonResponse({ error: "Stripe is not configured" }, 500);
    }

    const body = await req.json() as CheckoutRequestBody;
    const { items, email, shippingAddress } = body;

    // Validate input
    const itemError = validateItems(items);
    if (itemError) return jsonResponse({ error: itemError }, 400);

    if (!email || !validateEmail(email)) {
      return jsonResponse({ error: "Valid email is required" }, 400);
    }

    const addrError = validateShippingAddress(shippingAddress);
    if (addrError) return jsonResponse({ error: addrError }, 400);

    // Rate limit: reject if too many items (defense in depth)
    if (items.length > MAX_ITEMS) {
      return jsonResponse({ error: "Too many items" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2025-01-27.acacia" as any,
      httpClient: Stripe.createFetchHttpClient(),
    });

    // -------------------------------------------------------------------
    // 1. Validate all products server-side
    // -------------------------------------------------------------------

    // Fetch all published Printify products
    const printifyMap = await fetchAllPrintifyProducts();

    // Fetch manual products from Supabase (public or unlisted only)
    const manualSlugs = items
      .filter((i) => i.source === "manual")
      .map((i) => i.slug)
      .filter((s): s is string => Boolean(s));

    const manualProductIds = items
      .filter((i) => i.source === "manual")
      .map((i) => i.internalProductId)
      .filter((s): s is string => Boolean(s));

    let manualProductsMap = new Map<string, any>();
    let manualVariantsMap = new Map<string, any>();

    if (manualSlugs.length > 0 || manualProductIds.length > 0) {
      const { data: manualProducts } = await supabase
        .from("products")
        .select("id, slug, title, source, visibility, shipping_class, track_inventory, allow_backorders, currency")
        .eq("source", "manual")
        .in("visibility", ["public", "unlisted"]);

      for (const p of manualProducts ?? []) {
        manualProductsMap.set(p.slug, p);
        manualProductsMap.set(p.id, p);
      }

      // Fetch variants for manual products
      const productUuids = (manualProducts ?? []).map((p) => p.id);
      if (productUuids.length > 0) {
        const { data: variants } = await supabase
          .from("product_variants")
          .select("id, product_id, sku, title, price_cents, is_enabled, options")
          .in("product_id", productUuids);

        for (const v of variants ?? []) {
          manualVariantsMap.set(v.id, v);
        }
      }
    }

    // Fetch inventory for tracked manual products
    const inventoryMap = new Map<string, number>();
    const trackedProductIds = Array.from(manualProductsMap.values())
      .filter((p: any) => p.track_inventory)
      .map((p: any) => p.id);

    if (trackedProductIds.length > 0) {
      const { data: inventory } = await supabase
        .from("inventory_transactions")
        .select("variant_id, quantity, reason, reference")
        .in("product_id", trackedProductIds);

      for (const tx of inventory ?? []) {
        // Skip existing reservations that are still pending
        if (tx.reason === "reserve") {
          // Check if the referenced order is still pending
          const { data: refOrder } = await supabase
            .from("orders")
            .select("status")
            .eq("id", tx.reference ?? "")
            .maybeSingle();

          if (refOrder?.status === "pending") continue;
        }
        inventoryMap.set(tx.variant_id, (inventoryMap.get(tx.variant_id) ?? 0) + tx.quantity);
      }
    }

    const validatedItems: ValidatedLineItem[] = [];
    const errors: string[] = [];

    for (const item of items) {
      if (item.source === "printify") {
        // Validate Printify product
        const product = printifyMap.get(String(item.productId));
        if (!product) {
          errors.push(`Product ${item.productId} is no longer available`);
          continue;
        }

        const variant = product.variants.find(
          (v) => v.id === item.variantId && v.is_enabled && v.is_available
        );
        if (!variant) {
          errors.push(`Variant ${item.variantId} of product ${item.productId} is no longer available`);
          continue;
        }

        validatedItems.push({
          source: "printify",
          productId: String(product.id),
          variantId: String(variant.id),
          productTitle: product.title,
          variantTitle: variant.title,
          sku: variant.sku || null,
          unitPriceCents: variant.price,
          quantity: item.quantity,
          shippingClass: "printify",
          internalProductId: null,
          internalVariantId: null,
          colorwayId: item.colorwayId ?? null,
          colorwayName: item.colorwayName ?? null,
          colorwayImageUrl: item.colorwayImageUrl ?? null,
        });
      } else if (item.source === "manual") {
        // Validate manual product
        const key = item.slug ?? item.internalProductId ?? "";
        const product = manualProductsMap.get(key);
        if (!product) {
          errors.push(`Product "${item.slug}" is no longer available`);
          continue;
        }

        if (product.visibility !== "public" && product.visibility !== "unlisted") {
          errors.push(`Product "${product.title}" is not available for purchase`);
          continue;
        }

        const variant = item.internalVariantId ? manualVariantsMap.get(item.internalVariantId) : null;
        if (!variant || !variant.is_enabled) {
          errors.push(`Selected variant of "${product.title}" is no longer available`);
          continue;
        }

        // Check inventory if tracked
        if (product.track_inventory && !product.allow_backorders) {
          const stock = inventoryMap.get(variant.id) ?? 0;
          if (stock < item.quantity) {
            errors.push(`Insufficient stock for "${product.title}" — ${variant.title}`);
            continue;
          }
        }

        validatedItems.push({
          source: "manual",
          productId: product.id,
          variantId: variant.id,
          productTitle: product.title,
          variantTitle: variant.title,
          sku: variant.sku || null,
          unitPriceCents: variant.price_cents,
          quantity: item.quantity,
          shippingClass: product.shipping_class || "standard",
          internalProductId: product.id,
          internalVariantId: variant.id,
          colorwayId: item.colorwayId ?? null,
          colorwayName: item.colorwayName ?? null,
          colorwayImageUrl: item.colorwayImageUrl ?? null,
        });
      } else {
        errors.push(`Unknown product source: ${item.source}`);
      }
    }

    if (validatedItems.length === 0) {
      return jsonResponse({
        error: "No valid items in cart",
        details: errors,
      }, 400);
    }

    // -------------------------------------------------------------------
    // 2. Calculate shipping
    // -------------------------------------------------------------------

    const printifyItems = validatedItems.filter((i) => i.source === "printify");
    const hasPrintify = printifyItems.length > 0;
    const hasManual = validatedItems.some((i) => i.source === "manual");

    let printifyShippingCents = 0;
    for (const item of printifyItems) {
      const shipCost = await fetchPrintifyShippingEstimate(
        Number(item.productId),
        Number(item.variantId),
        item.quantity,
        shippingAddress,
      );
      printifyShippingCents += shipCost;
    }

    const manualShippingCents = calculateManualShipping(validatedItems);
    const totalShippingCents = printifyShippingCents + manualShippingCents;

    // -------------------------------------------------------------------
    // 3. Calculate totals
    // -------------------------------------------------------------------

    const subtotalCents = validatedItems.reduce(
      (sum, i) => sum + i.unitPriceCents * i.quantity,
      0
    );
    const totalCents = subtotalCents + totalShippingCents;

    // -------------------------------------------------------------------
    // 4. Create pending order + order_items
    // -------------------------------------------------------------------

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        status: "pending",
        email,
        currency: "USD",
        subtotal_cents: subtotalCents,
        shipping_cents: totalShippingCents,
        total_cents: totalCents,
        shipping_name: shippingAddress.name,
        shipping_address_line1: shippingAddress.line1,
        shipping_address_line2: shippingAddress.line2 ?? null,
        shipping_city: shippingAddress.city,
        shipping_state: shippingAddress.state,
        shipping_postal_code: shippingAddress.postalCode,
        shipping_country: shippingAddress.country,
        has_printify: hasPrintify,
        has_manual: hasManual,
      })
      .select("id")
      .single();

    if (orderError || !order) {
      return jsonResponse({ error: "Failed to create order" }, 500);
    }

    const orderId = order.id;

    // Insert order_items with snapshots
    const orderItemsRows = validatedItems.map((item) => ({
      order_id: orderId,
      product_source: item.source,
      product_id: item.productId,
      variant_id: item.variantId,
      product_title: item.productTitle,
      variant_title: item.variantTitle,
      sku: item.sku,
      unit_price_cents: item.unitPriceCents,
      quantity: item.quantity,
      colorway_id: item.colorwayId ?? null,
      colorway_name: item.colorwayName ?? null,
      colorway_image_url: item.colorwayImageUrl ?? null,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItemsRows);

    if (itemsError) {
      // Clean up the order if items failed
      await supabase.from("orders").delete().eq("id", orderId);
      return jsonResponse({ error: "Failed to create order items" }, 500);
    }

    // -------------------------------------------------------------------
    // 5. Reserve inventory for tracked manual variants
    // -------------------------------------------------------------------

    const inventoryReservations: Array<{ product_id: string; variant_id: string; quantity: number }> = [];
    for (const item of validatedItems) {
      if (item.source !== "manual" || !item.internalProductId || !item.internalVariantId) continue;

      const product = manualProductsMap.get(item.internalProductId);
      if (!product?.track_inventory || product.allow_backorders) continue;

      inventoryReservations.push({
        product_id: item.internalProductId,
        variant_id: item.internalVariantId,
        quantity: -item.quantity,
      });
    }

    if (inventoryReservations.length > 0) {
      const reservationRows = inventoryReservations.map((r) => ({
        product_id: r.product_id,
        variant_id: r.variant_id,
        quantity: r.quantity,
        reason: "reserve",
        reference: orderId,
      }));

      const { error: reserveError } = await supabase
        .from("inventory_transactions")
        .insert(reservationRows);

      if (reserveError) {
        // Clean up order if reservation fails
        await supabase.from("orders").delete().eq("id", orderId);
        return jsonResponse({ error: "Failed to reserve inventory" }, 500);
      }
    }

    // -------------------------------------------------------------------
    // 6. Create Stripe Checkout Session
    // -------------------------------------------------------------------

    // Build line items using price_data (no permanent Stripe Products needed)
    const lineItems = validatedItems.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency: "usd",
        unit_amount: item.unitPriceCents,
        product_data: {
          name: item.productTitle,
          description: item.variantTitle,
        },
      },
    }));

    // Add shipping as a line item
    if (totalShippingCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: totalShippingCents,
          product_data: {
            name: "Shipping",
            description: hasPrintify && hasManual
              ? "Mixed order — items may arrive in separate shipments"
              : "Shipping",
          },
        },
      });
    }

    const successUrl = `${SITE_URL}/shop/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${SITE_URL}/shop`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      customer_email: email,
      shipping_address_collection: {
        allowed_countries: ["US", "CA", "GB", "AU", "DE", "FR", "NL", "JP"],
      },
      metadata: {
        order_id: orderId,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      payment_intent_data: {
        metadata: {
          order_id: orderId,
        },
      },
    } as any);

    // Update order with Stripe session ID
    await supabase
      .from("orders")
      .update({
        stripe_checkout_session_id: session.id,
        status: "pending",
      })
      .eq("id", orderId);

    // -------------------------------------------------------------------
    // 7. Return only the checkout URL
    // -------------------------------------------------------------------

    return jsonResponse({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
