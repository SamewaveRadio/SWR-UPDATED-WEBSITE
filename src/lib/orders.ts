import { supabase } from './supabase';

export interface OrderRow {
  id: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_livemode: boolean | null;
  status: string;
  payment_status: string;
  fulfillment_status: string | null;
  email: string;
  customer_phone: string | null;
  customer_note: string | null;
  currency: string;
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  discount_cents: number;
  total_cents: number;
  amount_refunded_cents: number;
  shipping_name: string | null;
  shipping_address_line1: string | null;
  shipping_address_line2: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_postal_code: string | null;
  shipping_country: string | null;
  has_printify: boolean;
  has_manual: boolean;
  shipping_rule_applied: string | null;
  free_shipping_applied: boolean;
  printify_fulfillment_cost_cents: number;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
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
  colorway_id: string | null;
  colorway_name: string | null;
  colorway_image_url: string | null;
  shipping_class_snapshot: string | null;
  created_at: string;
}

export interface FulfillmentRow {
  id: string;
  order_id: string;
  source: string;
  status: string;
  printify_order_id: string | null;
  line_item_ids: string[];
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  submitted_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  notes: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderNoteRow {
  id: string;
  order_id: string;
  note: string;
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderEventRow {
  id: string;
  order_id: string;
  event_type: string;
  event_source: string;
  message: string;
  metadata_json: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

// ---- Formatting helpers ----

export function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format((cents ?? 0) / 100);
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function orderNumber(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

// ---- Status presentation ----

export type BadgeTone = 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'gray';

const PAYMENT_LABELS: Record<string, string> = {
  pending: 'Pending payment',
  paid: 'Paid',
  failed: 'Payment failed',
  cancelled: 'Cancelled',
  partially_refunded: 'Partially refunded',
  refunded: 'Refunded',
};

const PAYMENT_TONES: Record<string, BadgeTone> = {
  pending: 'amber',
  paid: 'green',
  failed: 'red',
  cancelled: 'gray',
  partially_refunded: 'amber',
  refunded: 'red',
};

const FULFILLMENT_LABELS: Record<string, string> = {
  unfulfilled: 'Unfulfilled',
  fulfillment_test_pending: 'Test pending',
  awaiting_fulfillment: 'Awaiting fulfillment',
  processing: 'Processing',
  partially_fulfilled: 'Partially fulfilled',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  fulfillment_failed: 'Fulfillment failed',
  fulfilled: 'Fulfilled',
};

const FULFILLMENT_TONES: Record<string, BadgeTone> = {
  unfulfilled: 'gray',
  fulfillment_test_pending: 'blue',
  awaiting_fulfillment: 'amber',
  processing: 'blue',
  partially_fulfilled: 'amber',
  shipped: 'green',
  delivered: 'green',
  cancelled: 'gray',
  fulfillment_failed: 'red',
  fulfilled: 'green',
};

const GROUP_LABELS: Record<string, string> = {
  pending: 'Pending',
  submitted: 'Submitted to Printify',
  completed: 'Completed',
  failed: 'Failed',
  test_pending: 'Test pending',
  awaiting_fulfillment: 'Awaiting fulfillment',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const GROUP_TONES: Record<string, BadgeTone> = {
  pending: 'gray',
  submitted: 'blue',
  completed: 'green',
  failed: 'red',
  test_pending: 'blue',
  awaiting_fulfillment: 'amber',
  processing: 'blue',
  shipped: 'green',
  delivered: 'green',
  cancelled: 'gray',
};

export function paymentLabel(s: string): string { return PAYMENT_LABELS[s] ?? s; }
export function paymentTone(s: string): BadgeTone { return PAYMENT_TONES[s] ?? 'neutral'; }
export function fulfillmentLabel(s: string | null): string { return s ? (FULFILLMENT_LABELS[s] ?? s) : 'Unfulfilled'; }
export function fulfillmentTone(s: string | null): BadgeTone { return s ? (FULFILLMENT_TONES[s] ?? 'neutral') : 'gray'; }
export function groupLabel(s: string): string { return GROUP_LABELS[s] ?? s; }
export function groupTone(s: string): BadgeTone { return GROUP_TONES[s] ?? 'neutral'; }

export const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-white/10 text-white/70 border-white/20',
  blue: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  green: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  amber: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  red: 'bg-red-500/10 text-red-300 border-red-500/30',
  gray: 'bg-white/5 text-white/50 border-white/10',
};

export function sourceSummary(o: { has_printify: boolean; has_manual: boolean }): string {
  if (o.has_printify && o.has_manual) return 'Mixed';
  if (o.has_printify) return 'Printify';
  if (o.has_manual) return 'Manual';
  return '—';
}

// ---- Privileged action caller ----

export async function callOrderAdmin<T = unknown>(body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { data: null, error: 'Not authenticated' };

  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/order-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { data: null, error: json?.error || `Request failed (${res.status})` };
    return { data: json as T, error: null };
  } catch {
    return { data: null, error: 'Network error. Please try again.' };
  }
}

// Whether a secure Stripe refund workflow is connected. No secure refund
// edge function exists yet, so refunds remain intentionally disabled.
export const REFUNDS_ENABLED = false;

export function stripeDashboardUrl(o: OrderRow): string | null {
  if (!o.stripe_payment_intent_id) return null;
  const prefix = o.stripe_livemode ? '' : 'test/';
  return `https://dashboard.stripe.com/${prefix}payments/${o.stripe_payment_intent_id}`;
}
