import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, User, CreditCard, Package, Clock, StickyNote, ExternalLink,
  Ban, Trash2, DollarSign,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import {
  OrderRow, OrderItemRow, FulfillmentRow, OrderNoteRow, OrderEventRow,
  formatMoney, formatDateTime, orderNumber, paymentLabel, paymentTone, fulfillmentLabel, fulfillmentTone,
  sourceSummary, callOrderAdmin, REFUNDS_ENABLED, stripeDashboardUrl,
} from '../lib/orders';
import { StatusBadge, ModeBadge, CopyButton, Toast } from '../components/OrderUI';
import { FulfillmentGroupCard } from '../components/orders/FulfillmentGroupCard';

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { user } = useAdminAuth();
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [fulfillments, setFulfillments] = useState<FulfillmentRow[]>([]);
  const [notes, setNotes] = useState<OrderNoteRow[]>([]);
  const [events, setEvents] = useState<OrderEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [busy, setBusy] = useState(false);

  const notify = (message: string, tone: 'success' | 'error') => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 2500);
  };

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: o, error: oErr } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
      if (oErr) throw new Error(oErr.message);
      if (!o) { setError('Order not found'); setOrder(null); return; }
      setOrder(o as OrderRow);

      const [{ data: its }, { data: fuls }, { data: ns }, { data: evs }] = await Promise.all([
        supabase.from('order_items').select('*').eq('order_id', orderId).order('created_at', { ascending: true }),
        supabase.from('fulfillments').select('*').eq('order_id', orderId).order('created_at', { ascending: true }),
        supabase.from('order_notes').select('*').eq('order_id', orderId).order('created_at', { ascending: false }),
        supabase.from('order_events').select('*').eq('order_id', orderId).order('created_at', { ascending: false }),
      ]);
      setItems((its ?? []) as OrderItemRow[]);
      setFulfillments((fuls ?? []) as FulfillmentRow[]);
      setNotes((ns ?? []) as OrderNoteRow[]);
      setEvents((evs ?? []) as OrderEventRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const itemsForFulfillment = (f: FulfillmentRow) => items.filter((i) => f.line_item_ids.includes(i.id));
  const unassignedItems = items.filter((i) => !fulfillments.some((f) => f.line_item_ids.includes(i.id)));

  const addNote = async () => {
    if (!noteInput.trim()) return;
    setBusy(true);
    const { error } = await callOrderAdmin({ action: 'add_note', orderId, note: noteInput });
    setBusy(false);
    if (error) notify(error, 'error');
    else { setNoteInput(''); notify('Note added', 'success'); load(); }
  };

  const deleteNote = async (noteId: string) => {
    if (!confirm('Delete this note?')) return;
    const { error } = await callOrderAdmin({ action: 'delete_note', noteId });
    if (error) notify(error, 'error');
    else { notify('Note deleted', 'success'); load(); }
  };

  const cancelOrder = async () => {
    if (!confirm('Cancel this unpaid order? Active inventory reservations will be released.')) return;
    setBusy(true);
    const { error } = await callOrderAdmin({ action: 'cancel_order', orderId });
    setBusy(false);
    if (error) notify(error, 'error');
    else { notify('Order cancelled', 'success'); load(); }
  };

  if (loading) {
    return <div className="border border-white/10 rounded-lg p-10 text-center text-white/40 text-sm">Loading order...</div>;
  }
  if (error || !order) {
    return (
      <div className="space-y-4">
        <Link to="/admin/orders" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white"><ArrowLeft className="w-4 h-4" /> Back to orders</Link>
        <div className="border border-red-500/30 bg-red-500/5 text-red-300 rounded-lg p-4 text-sm">{error ?? 'Order not found'}</div>
      </div>
    );
  }

  const o = order;
  const shippingBlock = [o.shipping_address_line1, o.shipping_address_line2, [o.shipping_city, o.shipping_state, o.shipping_postal_code].filter(Boolean).join(', '), o.shipping_country].filter(Boolean).join('\n');
  const dashUrl = stripeDashboardUrl(o);
  const refundable = o.total_cents - (o.amount_refunded_cents ?? 0);

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} tone={toast.tone} />}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link to="/admin/orders" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white mb-2"><ArrowLeft className="w-4 h-4" /> Back to orders</Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-light text-white font-mono">{orderNumber(o.id)}</h1>
            <ModeBadge live={o.stripe_livemode} />
            <StatusBadge label={paymentLabel(o.payment_status)} tone={paymentTone(o.payment_status)} />
            <StatusBadge label={fulfillmentLabel(o.fulfillment_status)} tone={fulfillmentTone(o.fulfillment_status)} />
            <CopyButton value={orderNumber(o.id)} label="order number" />
          </div>
          <p className="text-xs text-white/40 mt-1">Created {formatDateTime(o.created_at)}</p>
        </div>
        {o.payment_status === 'pending' && (
          <button onClick={cancelOrder} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs border border-red-500/30 text-red-300 rounded hover:bg-red-500/10 disabled:opacity-50">
            <Ban className="w-3.5 h-3.5" /> Cancel order
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order summary */}
          <Section icon={<Package className="w-4 h-4" />} title="Order summary">
            <div className="space-y-1.5 text-sm">
              <SummaryRow label="Merchandise subtotal" value={formatMoney(o.subtotal_cents, o.currency)} />
              {o.discount_cents > 0 && <SummaryRow label="Discount" value={`- ${formatMoney(o.discount_cents, o.currency)}`} />}
              <SummaryRow label={`Shipping${o.free_shipping_applied ? ' (free)' : ''}`} value={formatMoney(o.shipping_cents, o.currency)} />
              <SummaryRow label="Tax" value={formatMoney(o.tax_cents, o.currency)} />
              <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/10 text-white font-medium">
                <span>Total</span><span>{formatMoney(o.total_cents, o.currency)}</span>
              </div>
              {o.shipping_rule_applied && <p className="text-white/30 text-xs pt-1">Shipping rule: {o.shipping_rule_applied}</p>}
              {o.customer_note && <p className="text-white/50 text-xs pt-1">Customer note: {o.customer_note}</p>}
            </div>
          </Section>

          {/* Order items */}
          <Section icon={<Package className="w-4 h-4" />} title={`Order items (${items.length})`}>
            <div className="space-y-3">
              {items.map((it) => (
                <div key={it.id} className="flex gap-3">
                  {it.colorway_image_url ? (
                    <img src={it.colorway_image_url} alt="" className="w-14 h-14 rounded object-cover bg-white/5 flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded bg-white/5 flex items-center justify-center flex-shrink-0"><Package className="w-5 h-5 text-white/20" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-white/90 text-sm">{it.product_title}</div>
                    <div className="text-white/40 text-xs">
                      {it.variant_title}
                      {it.colorway_name ? ` · ${it.colorway_name}` : ''}
                      {it.sku ? ` · SKU ${it.sku}` : ''}
                    </div>
                    <div className="text-white/30 text-[11px] mt-0.5">
                      <span className="capitalize">{it.product_source}</span>
                      {it.product_source === 'manual' && it.shipping_class_snapshot ? ` · shipping: ${it.shipping_class_snapshot}` : ''}
                      {` · product ${it.product_id} / variant ${it.variant_id}`}
                    </div>
                  </div>
                  <div className="text-right text-sm whitespace-nowrap">
                    <div className="text-white/80">{formatMoney(it.unit_price_cents, o.currency)}</div>
                    <div className="text-white/40 text-xs">× {it.quantity}</div>
                    <div className="text-white font-medium">{formatMoney(it.unit_price_cents * it.quantity, o.currency)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Fulfillment groups */}
          <Section icon={<Package className="w-4 h-4" />} title="Fulfillment groups">
            <div className="space-y-4">
              {fulfillments.length === 0 && <p className="text-white/40 text-sm">No fulfillment groups yet.</p>}
              {fulfillments.map((f) => (
                <FulfillmentGroupCard key={f.id} fulfillment={f} items={itemsForFulfillment(f)} order={o} onChanged={load} notify={notify} />
              ))}
              {unassignedItems.length > 0 && (
                <div className="text-xs text-white/40 border border-white/10 rounded p-3">
                  {unassignedItems.length} item(s) not yet assigned to a fulfillment group.
                </div>
              )}
            </div>
          </Section>

          {/* Internal notes */}
          <Section icon={<StickyNote className="w-4 h-4" />} title="Internal notes">
            <p className="text-white/30 text-[11px] mb-3">Never visible to customers.</p>
            <div className="flex gap-2 mb-4">
              <textarea
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                rows={2}
                placeholder="Add an internal note…"
                className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/30 resize-none"
              />
              <button onClick={addNote} disabled={busy || !noteInput.trim()} className="px-3 py-2 bg-white text-black text-sm rounded font-medium hover:bg-white/90 self-start disabled:opacity-50">Add</button>
            </div>
            <div className="space-y-2">
              {notes.length === 0 && <p className="text-white/40 text-sm">No notes yet.</p>}
              {notes.map((n) => (
                <div key={n.id} className="border border-white/10 rounded p-3">
                  <p className="text-sm text-white/80 whitespace-pre-wrap">{n.note}</p>
                  <div className="flex items-center justify-between mt-2 text-[11px] text-white/40">
                    <span>{n.created_by_email ?? 'admin'} · {formatDateTime(n.created_at)}</span>
                    {n.created_by === user?.id && (
                      <button onClick={() => deleteNote(n.id)} className="inline-flex items-center gap-1 text-red-300/70 hover:text-red-300"><Trash2 className="w-3 h-3" /> Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Customer */}
          <Section icon={<User className="w-4 h-4" />} title="Customer">
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-white/40 text-[11px] uppercase tracking-wider mb-0.5">Name</div>
                <div className="text-white/80">{o.shipping_name || '—'}</div>
              </div>
              <div>
                <div className="text-white/40 text-[11px] uppercase tracking-wider mb-0.5 flex items-center gap-2">Email <CopyButton value={o.email} label="email" /></div>
                <div className="text-white/80 break-all">{o.email}</div>
              </div>
              {o.customer_phone && (
                <div>
                  <div className="text-white/40 text-[11px] uppercase tracking-wider mb-0.5">Phone</div>
                  <div className="text-white/80">{o.customer_phone}</div>
                </div>
              )}
              <div>
                <div className="text-white/40 text-[11px] uppercase tracking-wider mb-0.5 flex items-center gap-2">Shipping address <CopyButton value={`${o.shipping_name}\n${shippingBlock}`} label="shipping address" /></div>
                <div className="text-white/80 whitespace-pre-wrap">{shippingBlock || '—'}</div>
              </div>
            </div>
          </Section>

          {/* Payment */}
          <Section icon={<CreditCard className="w-4 h-4" />} title="Payment details">
            <div className="space-y-2 text-sm">
              <KV label="Payment status"><StatusBadge label={paymentLabel(o.payment_status)} tone={paymentTone(o.payment_status)} /></KV>
              <KV label="Stripe mode"><ModeBadge live={o.stripe_livemode} /></KV>
              <KV label="Amount paid"><span className="text-white/80">{o.payment_status === 'paid' ? formatMoney(o.total_cents, o.currency) : formatMoney(0, o.currency)}</span></KV>
              <KV label="Amount refunded"><span className="text-white/80">{formatMoney(o.amount_refunded_cents, o.currency)}</span></KV>
              <KV label="Paid at"><span className="text-white/60">{formatDateTime(o.paid_at)}</span></KV>
              <KV label="Checkout session">
                {o.stripe_checkout_session_id ? (
                  <span className="flex items-center gap-1.5 font-mono text-white/70 text-xs truncate max-w-[150px]">{o.stripe_checkout_session_id.slice(0, 18)}…<CopyButton value={o.stripe_checkout_session_id} label="session ID" /></span>
                ) : <span className="text-white/40">—</span>}
              </KV>
              <KV label="Payment intent">
                {o.stripe_payment_intent_id ? (
                  <span className="flex items-center gap-1.5 font-mono text-white/70 text-xs truncate max-w-[150px]">{o.stripe_payment_intent_id.slice(0, 18)}…<CopyButton value={o.stripe_payment_intent_id} label="payment intent ID" /></span>
                ) : <span className="text-white/40">—</span>}
              </KV>
              {dashUrl && (
                <a href={dashUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sky-300 hover:underline text-xs pt-1">
                  Open in Stripe <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </Section>

          {/* Refunds */}
          <Section icon={<DollarSign className="w-4 h-4" />} title="Refund">
            <p className="text-white/50 text-xs mb-2">Refundable balance: {formatMoney(refundable, o.currency)}</p>
            {REFUNDS_ENABLED ? (
              <button className="w-full px-3 py-2 text-sm border border-white/15 rounded text-white/80 hover:bg-white/5">Issue refund…</button>
            ) : (
              <button disabled className="w-full px-3 py-2 text-sm border border-white/10 rounded text-white/40 cursor-not-allowed" title="No secure Stripe refund workflow is connected">
                Refund integration not yet enabled
              </button>
            )}
          </Section>

          {/* Meta */}
          <Section icon={<Package className="w-4 h-4" />} title="Order info">
            <div className="space-y-2 text-sm">
              <KV label="Source"><span className="text-white/70">{sourceSummary(o)}</span></KV>
              <KV label="Currency"><span className="text-white/70">{o.currency}</span></KV>
              <KV label="Items"><span className="text-white/70">{items.reduce((s, i) => s + i.quantity, 0)}</span></KV>
            </div>
          </Section>
        </div>
      </div>

      {/* Timeline */}
      <Section icon={<Clock className="w-4 h-4" />} title="Order timeline">
        {events.length === 0 ? (
          <p className="text-white/40 text-sm">No events recorded.</p>
        ) : (
          <ol className="space-y-3">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3 text-sm">
                <div className="flex flex-col items-center">
                  <span className="w-2 h-2 rounded-full bg-white/40 mt-1.5" />
                  <span className="flex-1 w-px bg-white/10 my-1" />
                </div>
                <div className="pb-1">
                  <div className="text-white/80">{e.message || e.event_type}</div>
                  <div className="text-white/30 text-[11px]">{e.event_source} · {formatDateTime(e.created_at)}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="border border-white/10 rounded-lg p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-medium text-white/90 mb-4">{icon} {title}</h2>
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between text-white/60"><span>{label}</span><span className="text-white/80">{value}</span></div>;
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-white/40">{label}</span>{children}</div>;
}
