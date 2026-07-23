import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PRINTIFY_API_TOKEN = Deno.env.get("PRINTIFY_API_TOKEN");
const PRINTIFY_SHOP_ID = Deno.env.get("PRINTIFY_SHOP_ID");
const PRINTIFY_API_BASE = "https://api.printify.com/v1";
const FULFILLMENT_ENABLED = Deno.env.get("FULFILLMENT_ENABLED") === "true";
const LIVE_FULFILLMENT_ONLY = Deno.env.get("LIVE_FULFILLMENT_ONLY") !== "false";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Fulfillment {
  id: string;
  order_id: string;
  source: string;
  status: string;
  printify_order_id: string | null;
  line_item_ids: string[];
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  submitted_at: string | null;
  notes: string | null;
  error_message: string | null;
}

async function logEvent(
  orderId: string,
  eventType: string,
  message: string,
  metadata: Record<string, unknown>,
  createdBy: string | null,
): Promise<void> {
  await supabase.from("order_events").insert({
    order_id: orderId,
    event_type: eventType,
    event_source: "admin",
    message,
    metadata_json: metadata,
    created_by: createdBy,
  });
}

// Derive the parent order fulfillment_status from its fulfillment groups.
async function recalcOrderFulfillment(orderId: string): Promise<string> {
  const { data: groups } = await supabase
    .from("fulfillments")
    .select("status")
    .eq("order_id", orderId);

  const all = groups ?? [];
  let derived: string;

  if (all.length === 0) {
    derived = "unfulfilled";
  } else {
    const active = all.filter((g) => g.status !== "cancelled");
    if (active.length === 0) {
      derived = "cancelled";
    } else if (active.every((g) => g.status === "test_pending")) {
      derived = "fulfillment_test_pending";
    } else {
      const isDone = (s: string) => s === "shipped" || s === "delivered" || s === "completed";
      const doneCount = active.filter((g) => isDone(g.status)).length;
      const failedCount = active.filter((g) => g.status === "failed").length;

      if (active.every((g) => g.status === "delivered")) {
        derived = "delivered";
      } else if (active.every((g) => isDone(g.status))) {
        derived = "shipped";
      } else if (doneCount > 0) {
        derived = "partially_fulfilled";
      } else if (failedCount > 0) {
        derived = "fulfillment_failed";
      } else if (active.some((g) => g.status === "processing")) {
        derived = "processing";
      } else {
        derived = "awaiting_fulfillment";
      }
    }
  }

  await supabase.from("orders").update({ fulfillment_status: derived }).eq("id", orderId);
  return derived;
}

async function getFulfillment(id: string): Promise<Fulfillment | null> {
  const { data } = await supabase.from("fulfillments").select("*").eq("id", id).maybeSingle();
  return (data as Fulfillment) ?? null;
}

function printifyHeaders() {
  return {
    Authorization: `Bearer ${PRINTIFY_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // ---- Admin authorization (server-side) ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const payload = await req.json();
    const action = payload?.action as string;
    if (!action) return json({ error: "Missing action" }, 400);

    switch (action) {
      // ------------------------------------------------------------------
      case "add_note": {
        const { orderId, note } = payload;
        if (!orderId || !note?.trim()) return json({ error: "orderId and note required" }, 400);
        const { data, error } = await supabase
          .from("order_notes")
          .insert({
            order_id: orderId,
            note: note.trim(),
            created_by: user.id,
            created_by_email: user.email,
          })
          .select()
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        await logEvent(orderId, "note_added", "Administrator note added", {}, user.id);
        return json({ note: data });
      }

      case "edit_note": {
        const { noteId, note } = payload;
        if (!noteId || !note?.trim()) return json({ error: "noteId and note required" }, 400);
        const existing = await supabase.from("order_notes").select("created_by").eq("id", noteId).maybeSingle();
        if (!existing.data) return json({ error: "Note not found" }, 404);
        if (existing.data.created_by !== user.id) return json({ error: "You can only edit your own notes" }, 403);
        const { data, error } = await supabase
          .from("order_notes")
          .update({ note: note.trim() })
          .eq("id", noteId)
          .select()
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        return json({ note: data });
      }

      case "delete_note": {
        const { noteId } = payload;
        if (!noteId) return json({ error: "noteId required" }, 400);
        const existing = await supabase.from("order_notes").select("created_by").eq("id", noteId).maybeSingle();
        if (!existing.data) return json({ error: "Note not found" }, 404);
        if (existing.data.created_by !== user.id) return json({ error: "You can only delete your own notes" }, 403);
        const { error } = await supabase.from("order_notes").delete().eq("id", noteId);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      // ------------------------------------------------------------------
      case "update_manual_fulfillment": {
        const { fulfillmentId, carrier, tracking_number, tracking_url, notes, status } = payload;
        const f = await getFulfillment(fulfillmentId);
        if (!f) return json({ error: "Fulfillment not found" }, 404);
        if (f.source !== "manual") return json({ error: "Only manual fulfillments can be edited here" }, 400);

        const updates: Record<string, unknown> = {};
        if (carrier !== undefined) updates.carrier = carrier || null;
        if (tracking_number !== undefined) updates.tracking_number = tracking_number || null;
        if (tracking_url !== undefined) updates.tracking_url = tracking_url || null;
        if (notes !== undefined) updates.notes = notes || null;

        if (status !== undefined) {
          const allowed = ["awaiting_fulfillment", "processing", "shipped", "delivered"];
          if (!allowed.includes(status)) return json({ error: "Invalid status transition" }, 400);
          updates.status = status;
          if (status === "shipped" && !f.shipped_at) updates.shipped_at = new Date().toISOString();
          if (status === "delivered") {
            updates.delivered_at = new Date().toISOString();
            if (!f.shipped_at) updates.shipped_at = new Date().toISOString();
          }
        }

        const { error } = await supabase.from("fulfillments").update(updates).eq("id", fulfillmentId);
        if (error) return json({ error: error.message }, 500);

        if (status === "shipped") {
          await logEvent(f.order_id, "order_shipped", "Manual fulfillment marked shipped", { fulfillment_id: fulfillmentId, tracking_number: tracking_number ?? f.tracking_number }, user.id);
        } else if (status === "delivered") {
          await logEvent(f.order_id, "order_delivered", "Manual fulfillment marked delivered", { fulfillment_id: fulfillmentId }, user.id);
        } else if (status === "processing") {
          await logEvent(f.order_id, "fulfillment_processing", "Manual fulfillment marked processing", { fulfillment_id: fulfillmentId }, user.id);
        } else if (tracking_number !== undefined || carrier !== undefined || tracking_url !== undefined) {
          await logEvent(f.order_id, "tracking_added", "Tracking information updated", { fulfillment_id: fulfillmentId }, user.id);
        }

        const derived = await recalcOrderFulfillment(f.order_id);
        return json({ ok: true, fulfillment_status: derived });
      }

      // ------------------------------------------------------------------
      case "cancel_fulfillment": {
        const { fulfillmentId, restock } = payload;
        const f = await getFulfillment(fulfillmentId);
        if (!f) return json({ error: "Fulfillment not found" }, 404);
        if (f.status === "cancelled") return json({ error: "Fulfillment already cancelled" }, 400);
        if (f.source === "printify" && f.printify_order_id) {
          return json({ error: "Cannot cancel a submitted Printify fulfillment from here" }, 400);
        }

        await supabase.from("fulfillments").update({ status: "cancelled" }).eq("id", fulfillmentId);
        await logEvent(f.order_id, "fulfillment_cancelled", "Fulfillment cancelled", { fulfillment_id: fulfillmentId }, user.id);

        if (restock && f.source === "manual" && f.line_item_ids.length > 0) {
          // Guard against double-restock: check for an existing restock txn for this fulfillment
          const restockRef = `restock:${fulfillmentId}`;
          const { data: already } = await supabase
            .from("inventory_transactions")
            .select("id")
            .eq("reference", restockRef)
            .limit(1);
          if (!already || already.length === 0) {
            const { data: items } = await supabase
              .from("order_items")
              .select("product_id, variant_id, quantity, product_source")
              .in("id", f.line_item_ids);
            for (const item of items ?? []) {
              if (item.product_source !== "manual") continue;
              await supabase.from("inventory_transactions").insert({
                product_id: item.product_id,
                variant_id: item.variant_id,
                quantity: item.quantity,
                reason: "restock",
                reference: restockRef,
                created_by: user.id,
              });
            }
            await logEvent(f.order_id, "inventory_released", "Cancelled items restocked", { fulfillment_id: fulfillmentId }, user.id);
          }
        }

        const derived = await recalcOrderFulfillment(f.order_id);
        return json({ ok: true, fulfillment_status: derived });
      }

      // ------------------------------------------------------------------
      case "retry_printify": {
        const { fulfillmentId } = payload;
        const f = await getFulfillment(fulfillmentId);
        if (!f) return json({ error: "Fulfillment not found" }, 404);
        if (f.source !== "printify") return json({ error: "Not a Printify fulfillment" }, 400);
        if (!FULFILLMENT_ENABLED) return json({ error: "Fulfillment is disabled (FULFILLMENT_ENABLED is false)" }, 400);
        if (f.printify_order_id) return json({ error: "A Printify order already exists for this fulfillment" }, 400);
        if (f.status !== "failed") return json({ error: "Retry is only allowed for failed submissions" }, 400);
        if (!PRINTIFY_API_TOKEN || !PRINTIFY_SHOP_ID) return json({ error: "Printify is not configured" }, 400);

        const { data: order } = await supabase.from("orders").select("*").eq("id", f.order_id).maybeSingle();
        if (!order) return json({ error: "Order not found" }, 404);
        if (order.payment_status !== "paid") return json({ error: "Order is not paid" }, 400);
        if (LIVE_FULFILLMENT_ONLY && order.stripe_livemode === false) {
          return json({ error: "Live fulfillment is enabled but this is a test-mode order" }, 400);
        }

        const { data: items } = await supabase
          .from("order_items")
          .select("*")
          .in("id", f.line_item_ids);
        const printifyItems = (items ?? []).filter((i) => i.product_source === "printify");
        if (printifyItems.length === 0) return json({ error: "No Printify items in this fulfillment" }, 400);

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

        const res = await fetch(`${PRINTIFY_API_BASE}/shops/${PRINTIFY_SHOP_ID}/orders.json`, {
          method: "POST",
          headers: printifyHeaders(),
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const text = await res.text();
          const msg = `Printify API error ${res.status}: ${text}`;
          await supabase.from("fulfillments").update({ status: "failed", error_message: msg }).eq("id", fulfillmentId);
          await logEvent(f.order_id, "fulfillment_error", "Printify retry failed", { fulfillment_id: fulfillmentId }, user.id);
          return json({ error: msg }, 502);
        }

        const data = await res.json();
        await supabase.from("fulfillments").update({
          status: "submitted",
          printify_order_id: String(data.id),
          submitted_at: new Date().toISOString(),
          error_message: null,
        }).eq("id", fulfillmentId);
        await logEvent(f.order_id, "printify_submitted", "Printify order submitted (retry)", { printify_order_id: String(data.id), fulfillment_id: fulfillmentId }, user.id);

        const derived = await recalcOrderFulfillment(f.order_id);
        return json({ ok: true, printify_order_id: String(data.id), fulfillment_status: derived });
      }

      // ------------------------------------------------------------------
      case "cancel_order": {
        const { orderId } = payload;
        const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
        if (!order) return json({ error: "Order not found" }, 404);
        if (order.payment_status === "paid") {
          return json({ error: "Paid orders cannot be cancelled here. Use the refund workflow." }, 400);
        }
        if (order.payment_status === "cancelled") return json({ error: "Order already cancelled" }, 400);

        await supabase.from("orders").update({
          status: "cancelled",
          payment_status: "cancelled",
        }).eq("id", orderId);

        // Release active manual reservations (guard: only reserve rows still present)
        await supabase.from("inventory_transactions").delete().eq("reason", "reserve").eq("reference", orderId);

        await logEvent(orderId, "order_cancelled", "Order cancelled by administrator", {}, user.id);
        return json({ ok: true });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("order-admin error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
