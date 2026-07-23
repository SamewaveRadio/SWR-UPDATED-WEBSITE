import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@17.7.0";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const FULFILLMENT_ENABLED = Deno.env.get("FULFILLMENT_ENABLED") === "true";

const PRINTIFY_API_TOKEN = Deno.env.get("PRINTIFY_API_TOKEN");
const PRINTIFY_SHOP_ID = Deno.env.get("PRINTIFY_SHOP_ID");
const PRINTIFY_API_BASE = "https://api.printify.com/v1";

function printifyAuthHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${PRINTIFY_API_TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "SamewaveRadio-Webhook/1.0",
  };
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const stripe = new Stripe(STRIPE_SECRET_KEY!, {
  apiVersion: "2025-01-27.acacia" as any,
  httpClient: Stripe.createFetchHttpClient(),
});

// ---------------------------------------------------------------------------
// Idempotency: check / mark Stripe event as processed
// ---------------------------------------------------------------------------

async function isEventProcessed(eventId: string): Promise<boolean> {
  const { data } = await supabase
    .from("processed_webhook_events")
    .select("id")
    .eq("stripe_event_id", eventId)
    .maybeSingle();
  return data !== null;
}

async function markEventProcessed(eventId: string, eventType: string): Promise<void> {
  // Insert; if the event was already processed by a concurrent request,
  // the unique constraint on stripe_event_id will reject the duplicate,
  // which is fine — the caller already processed it.
  await supabase
    .from("processed_webhook_events")
    .insert({
      stripe_event_id: eventId,
      event_type: eventType,
    });
}

// ---------------------------------------------------------------------------
// Order helpers
// ---------------------------------------------------------------------------

interface OrderRow {
  id: string;
  status: string;
  stripe_checkout_session_id: string | null;
  email: string;
  currency: string;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  has_printify: boolean;
  has_manual: boolean;
  fulfillment_status: string | null;
  shipping_name: string | null;
  shipping_address_line1: string | null;
  shipping_address_line2: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_postal_code: string | null;
  shipping_country: string | null;
  shipping_rule_applied: string | null;
  has_printify_items: boolean;
  all_manual_items_free: boolean;
  free_shipping_applied: boolean;
  free_shipping_threshold_snapshot_cents: number;
  flat_shipping_rate_snapshot_cents: number;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  product_source: string;
  product_id: string;
  variant_id: string;
  product_title: string;
  variant_title: string;
  sku: string | null;
  unit_price_cents: number;
  quantity: number;
}

async function getOrder(orderId: string): Promise<OrderRow | null> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !data) return null;
  return data as OrderRow;
}

async function getOrderItems(orderId: string): Promise<OrderItemRow[]> {
  const { data, error } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);
  if (error || !data) return [];
  return data as OrderItemRow[];
}

// ---------------------------------------------------------------------------
// Inventory: convert reservations to permanent deductions, or release them
// ---------------------------------------------------------------------------

async function convertInventoryReservations(orderId: string): Promise<void> {
  // Find all inventory_transactions with reason='reserve' and reference=orderId
  const { data: reservations, error } = await supabase
    .from("inventory_transactions")
    .select("id, product_id, variant_id, quantity")
    .eq("reason", "reserve")
    .eq("reference", orderId);

  if (error || !reservations) return;

  // Convert each reservation to a permanent deduction by updating the reason
  for (const r of reservations) {
    await supabase
      .from("inventory_transactions")
      .update({ reason: "order" })
      .eq("id", r.id);
  }
}

async function releaseInventoryReservations(orderId: string): Promise<void> {
  // Delete reservation rows — this returns the reserved stock
  const { error } = await supabase
    .from("inventory_transactions")
    .delete()
    .eq("reason", "reserve")
    .eq("reference", orderId);

  if (error) {
    console.error("Failed to release inventory reservations:", error.message);
  }
}

// ---------------------------------------------------------------------------
// Fulfillment
// ---------------------------------------------------------------------------

async function createFulfillmentRecord(
  orderId: string,
  source: "printify" | "manual",
  status: string,
  lineItemIds: string[],
  printifyOrderId?: string,
  errorMessage?: string,
): Promise<void> {
  await supabase.from("fulfillments").insert({
    order_id: orderId,
    source,
    status,
    line_item_ids: lineItemIds,
    printify_order_id: printifyOrderId ?? null,
    error_message: errorMessage ?? null,
  });
}

async function updateFulfillmentRecord(
  fulfillmentId: string,
  updates: { status?: string; printify_order_id?: string; error_message?: string },
): Promise<void> {
  await supabase
    .from("fulfillments")
    .update(updates)
    .eq("id", fulfillmentId);
}

async function checkAllFulfillmentsComplete(orderId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("fulfillments")
    .select("status")
    .eq("order_id", orderId);

  if (error || !data) return false;
  if (data.length === 0) return false;

  // All fulfillment groups must be completed or awaiting_fulfillment counts as done
  // from the system's perspective (manual items are handled offline)
  return data.every((f: { status: string }) =>
    f.status === "completed" || f.status === "awaiting_fulfillment"
  );
}

// ---------------------------------------------------------------------------
// Printify order submission
// ---------------------------------------------------------------------------

async function submitPrintifyOrder(
  order: OrderRow,
  printifyItems: OrderItemRow[],
): Promise<{ printifyOrderId: string } | { error: string }> {
  if (!PRINTIFY_API_TOKEN || !PRINTIFY_SHOP_ID) {
    return { error: "Printify is not configured" };
  }

  const lineItems = printifyItems.map((item) => ({
    product_id: Number(item.product_id),
    variant_id: Number(item.variant_id),
    quantity: item.quantity,
  }));

  const body = {
    external_id: order.id,
    label: `Samewave Order ${order.id.slice(0, 8)}`,
    line_items: lineItems,
    shipping_method: "standard",
    is_printify_shipping: true,
    send_shipping_notification: true,
    address_to: {
      first_name: order.shipping_name?.split(" ")[0] ?? "",
      last_name: order.shipping_name?.split(" ").slice(1).join(" ") ?? "",
      email: order.email,
      country: order.shipping_country ?? "US",
      region: order.shipping_state ?? "",
      city: order.shipping_city ?? "",
      zip: order.shipping_postal_code ?? "",
      address1: order.shipping_address_line1 ?? "",
      address2: order.shipping_address_line2 ?? "",
    },
  };

  try {
    const res = await fetch(`${PRINTIFY_API_BASE}/shops/${PRINTIFY_SHOP_ID}/orders.json`, {
      method: "POST",
      headers: printifyAuthHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return { error: `Printify API error ${res.status}: ${text}` };
    }

    const data = await res.json();
    return { printifyOrderId: String(data.id) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to submit to Printify" };
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.metadata?.order_id;
  if (!orderId) {
    console.error("No order_id in session metadata");
    return;
  }

  const order = await getOrder(orderId);
  if (!order) {
    console.error(`Order ${orderId} not found`);
    return;
  }

  // Confirm the session belongs to this order
  if (order.stripe_checkout_session_id !== session.id) {
    console.error(`Session ID mismatch: order has ${order.stripe_checkout_session_id}, event has ${session.id}`);
    return;
  }

  // Confirm payment_status is paid
  if (session.payment_status !== "paid") {
    console.error(`Payment not paid for order ${orderId}: ${session.payment_status}`);
    return;
  }

  // -----------------------------------------------------------------
  // Validate Stripe totals against stored order snapshots.
  // The webhook does NOT recalculate shipping from current product
  // settings — it uses the snapshots stored when Checkout was created.
  // -----------------------------------------------------------------
  const stripeAmountTotal = session.amount_total ?? 0;
  const stripeCurrency = (session.currency ?? "usd").toUpperCase();
  const stripeSubtotal = session.amount_subtotal ?? 0;
  const stripeShipping = (session as any).shipping_cost?.amount_subtotal
    ?? (session as any).total_details?.shipping?.amount
    ?? 0;
  const stripeTax = (session as any).total_details?.tax?.amount ?? 0;
  const stripeDiscount = (session as any).total_details?.discount?.amount ?? 0;

  // Shipping must match the stored snapshot exactly
  if (stripeShipping !== order.shipping_cents) {
    console.error(
      `Shipping mismatch: Stripe=${stripeShipping}, DB=${order.shipping_cents}, rule=${order.shipping_rule_applied}`,
    );
    return;
  }

  // Subtotal must match
  if (stripeSubtotal !== order.subtotal_cents) {
    console.error(`Subtotal mismatch: Stripe=${stripeSubtotal}, DB=${order.subtotal_cents}`);
    return;
  }

  // Total must match (subtotal + shipping + tax - discount)
  if (stripeAmountTotal !== order.total_cents) {
    console.error(`Amount mismatch: Stripe=${stripeAmountTotal}, DB=${order.total_cents}`);
    return;
  }

  if (stripeCurrency !== order.currency.toUpperCase()) {
    console.error(`Currency mismatch: Stripe=${stripeCurrency}, DB=${order.currency}`);
    return;
  }

  // If order is already paid, this is a duplicate — skip (idempotent)
  if (order.status === "paid") {
    return;
  }

  // Mark order as paid
  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (updateError) {
    console.error(`Failed to mark order ${orderId} as paid:`, updateError.message);
    return;
  }

  // Convert manual inventory reservations to permanent deductions
  await convertInventoryReservations(orderId);

  // Get order items
  const orderItems = await getOrderItems(orderId);
  const printifyItems = orderItems.filter((i) => i.product_source === "printify");
  const manualItems = orderItems.filter((i) => i.product_source === "manual");

  // Create fulfillment records
  if (FULFILLMENT_ENABLED) {
    let allComplete = true;

    // Submit Printify items to Printify
    if (printifyItems.length > 0) {
      const printifyItemIds = printifyItems.map((i) => i.id);

      // Create initial fulfillment record as pending
      await createFulfillmentRecord(orderId, "printify", "pending", printifyItemIds);

      const result = await submitPrintifyOrder(order, printifyItems);

      if ("printifyOrderId" in result) {
        // Update fulfillment record with Printify order ID
        const { data: fulfillment } = await supabase
          .from("fulfillments")
          .select("id")
          .eq("order_id", orderId)
          .eq("source", "printify")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fulfillment) {
          await updateFulfillmentRecord(fulfillment.id, {
            status: "submitted",
            printify_order_id: result.printifyOrderId,
          });
        }
      } else {
        // Mark fulfillment as failed
        const { data: fulfillment } = await supabase
          .from("fulfillments")
          .select("id")
          .eq("order_id", orderId)
          .eq("source", "printify")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fulfillment) {
          await updateFulfillmentRecord(fulfillment.id, {
            status: "failed",
            error_message: result.error,
          });
        }
        allComplete = false;
      }
    }

    // Manual items go into awaiting_fulfillment (handled offline)
    if (manualItems.length > 0) {
      const manualItemIds = manualItems.map((i) => i.id);
      await createFulfillmentRecord(orderId, "manual", "awaiting_fulfillment", manualItemIds);
    }

    // Update order fulfillment status
    if (allComplete && await checkAllFulfillmentsComplete(orderId)) {
      await supabase
        .from("orders")
        .update({ fulfillment_status: "fulfilled" })
        .eq("id", orderId);
    } else {
      await supabase
        .from("orders")
        .update({ fulfillment_status: "awaiting_fulfillment" })
        .eq("id", orderId);
    }
  } else {
    // FULFILLMENT_ENABLED is false — do not submit to Printify
    // Mark as fulfillment_test_pending, preserve all info
    if (printifyItems.length > 0) {
      await createFulfillmentRecord(
        orderId,
        "printify",
        "test_pending",
        printifyItems.map((i) => i.id),
      );
    }
    if (manualItems.length > 0) {
      await createFulfillmentRecord(
        orderId,
        "manual",
        "test_pending",
        manualItems.map((i) => i.id),
      );
    }

    await supabase
      .from("orders")
      .update({ fulfillment_status: "fulfillment_test_pending" })
      .eq("id", orderId);
  }
}

async function handleAsyncPaymentSucceeded(session: Stripe.Checkout.Session): Promise<void> {
  // Same as checkout.session.completed for paid sessions
  await handleCheckoutCompleted(session);
}

async function handleAsyncPaymentFailed(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.metadata?.order_id;
  if (!orderId) return;

  // Mark order appropriately
  await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .in("status", ["pending"]); // Only update if still pending

  // Release inventory reservations
  await releaseInventoryReservations(orderId);
}

async function handleSessionExpired(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.metadata?.order_id;
  if (!orderId) return;

  // Mark order as cancelled if still pending
  await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .in("status", ["pending"]);

  // Release inventory reservations
  await releaseInventoryReservations(orderId);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Verify webhook signature using the raw body
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return new Response("Missing signature", { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        STRIPE_WEBHOOK_SECRET!,
      );
    } catch {
      return new Response("Invalid signature", { status: 400 });
    }

    // Idempotency: check if this event was already processed
    const alreadyProcessed = await isEventProcessed(event.id);
    if (alreadyProcessed) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Process the event
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleAsyncPaymentSucceeded(session);
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleAsyncPaymentFailed(session);
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleSessionExpired(session);
        break;
      }
      default:
        // Unhandled event type — acknowledge but don't process
        break;
    }

    // Mark event as processed
    await markEventProcessed(event.id, event.type);

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error instanceof Error ? error.message : "Unknown error");
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
