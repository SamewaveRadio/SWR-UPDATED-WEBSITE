import { useState } from 'react';
import { Truck, Package, RotateCw, XCircle, Save, AlertTriangle, ExternalLink } from 'lucide-react';
import {
  FulfillmentRow, OrderItemRow, OrderRow, formatMoney, formatDateTime, groupLabel, groupTone, callOrderAdmin,
} from '../../lib/orders';
import { StatusBadge, CopyButton } from '../OrderUI';

interface Props {
  fulfillment: FulfillmentRow;
  items: OrderItemRow[];
  order: OrderRow;
  onChanged: () => void;
  notify: (message: string, tone: 'success' | 'error') => void;
}

const MANUAL_STATUSES = [
  { value: 'awaiting_fulfillment', label: 'Awaiting fulfillment' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
];

export function FulfillmentGroupCard({ fulfillment: f, items, order, onChanged, notify }: Props) {
  const isManual = f.source === 'manual';
  const [carrier, setCarrier] = useState(f.carrier ?? '');
  const [trackingNumber, setTrackingNumber] = useState(f.tracking_number ?? '');
  const [trackingUrl, setTrackingUrl] = useState(f.tracking_url ?? '');
  const [notes, setNotes] = useState(f.notes ?? '');
  const [busy, setBusy] = useState(false);

  const run = async (body: Record<string, unknown>, successMsg: string) => {
    setBusy(true);
    const { error } = await callOrderAdmin({ ...body, fulfillmentId: f.id });
    setBusy(false);
    if (error) notify(error, 'error');
    else { notify(successMsg, 'success'); onChanged(); }
  };

  const saveTracking = () => run(
    { action: 'update_manual_fulfillment', carrier, tracking_number: trackingNumber, tracking_url: trackingUrl, notes },
    'Fulfillment details saved',
  );

  const setStatus = (status: string) => {
    if (status === 'shipped' && !trackingNumber.trim()) {
      if (!confirm('No tracking number entered. Mark as shipped without tracking?')) return;
    }
    run(
      { action: 'update_manual_fulfillment', status, carrier, tracking_number: trackingNumber, tracking_url: trackingUrl, notes },
      `Marked ${groupLabel(status).toLowerCase()}`,
    );
  };

  const cancel = () => {
    const restock = confirm('Cancel this fulfillment.\n\nClick OK to also RESTOCK the cancelled manual items, or Cancel to skip restocking.');
    run({ action: 'cancel_fulfillment', restock }, 'Fulfillment cancelled');
  };

  const retryPrintify = () => {
    if (!confirm('Retry submitting this fulfillment to Printify?')) return;
    run({ action: 'retry_printify' }, 'Printify submission retried');
  };

  const canRetryPrintify = f.source === 'printify' && f.status === 'failed' && !f.printify_order_id;

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-white/[0.03] border-b border-white/10">
        <div className="flex items-center gap-2">
          {isManual ? <Truck className="w-4 h-4 text-white/50" /> : <Package className="w-4 h-4 text-white/50" />}
          <span className="text-sm font-medium text-white capitalize">{f.source} fulfillment</span>
          <StatusBadge label={groupLabel(f.status)} tone={groupTone(f.status)} />
        </div>
        <span className="text-xs text-white/40">{items.length} item{items.length === 1 ? '' : 's'}</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Items */}
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-3 text-sm">
              {it.colorway_image_url ? (
                <img src={it.colorway_image_url} alt="" className="w-10 h-10 rounded object-cover bg-white/5" />
              ) : (
                <div className="w-10 h-10 rounded bg-white/5 flex items-center justify-center"><Package className="w-4 h-4 text-white/20" /></div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-white/90 truncate">{it.product_title}</div>
                <div className="text-white/40 text-xs truncate">
                  {it.variant_title}{it.colorway_name ? ` · ${it.colorway_name}` : ''}{it.sku ? ` · ${it.sku}` : ''}
                </div>
              </div>
              <div className="text-white/60 text-xs text-right whitespace-nowrap">
                {it.quantity} × {formatMoney(it.unit_price_cents, order.currency)}
              </div>
            </div>
          ))}
        </div>

        {/* Printify details */}
        {f.source === 'printify' && (
          <div className="text-xs space-y-1.5 border-t border-white/5 pt-3">
            <Row label="Printify order ID">
              {f.printify_order_id ? (
                <span className="flex items-center gap-1.5 font-mono text-white/80">{f.printify_order_id}<CopyButton value={f.printify_order_id} label="Printify order ID" /></span>
              ) : <span className="text-white/40">Not submitted</span>}
            </Row>
            {order.printify_fulfillment_cost_cents > 0 && (
              <Row label="Printify shipping cost"><span className="text-white/70">{formatMoney(order.printify_fulfillment_cost_cents, order.currency)}</span></Row>
            )}
            <Row label="Submitted"><span className="text-white/70">{formatDateTime(f.submitted_at ?? f.created_at)}</span></Row>
            {f.error_message && (
              <div className="flex items-start gap-2 text-red-300 bg-red-500/5 border border-red-500/20 rounded p-2 mt-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span className="break-words">{f.error_message}</span>
              </div>
            )}
            {canRetryPrintify ? (
              <button onClick={retryPrintify} disabled={busy} className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-white text-black rounded font-medium hover:bg-white/90 disabled:opacity-50">
                <RotateCw className="w-3.5 h-3.5" /> Retry Printify Submission
              </button>
            ) : (
              <p className="text-white/30 text-[11px] mt-2">
                {f.printify_order_id ? 'A Printify order already exists — retry disabled to prevent duplicates.' : 'Retry becomes available only after a failed submission.'}
              </p>
            )}
          </div>
        )}

        {/* Manual actions */}
        {isManual && f.status !== 'cancelled' && (
          <div className="border-t border-white/5 pt-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="Carrier"><input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="USPS, UPS…" className={inputCls} /></Field>
              <Field label="Tracking number">
                <div className="flex items-center gap-1.5">
                  <input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="1Z…" className={inputCls} />
                  {f.tracking_number && <CopyButton value={f.tracking_number} label="tracking number" />}
                </div>
              </Field>
              <Field label="Tracking URL"><input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://…" className={inputCls} /></Field>
              <Field label="Internal notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className={inputCls} /></Field>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={saveTracking} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-white/15 rounded text-white/80 hover:bg-white/5 disabled:opacity-50">
                <Save className="w-3.5 h-3.5" /> Save details
              </button>
              {MANUAL_STATUSES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStatus(s.value)}
                  disabled={busy || f.status === s.value}
                  className="px-3 py-1.5 text-xs border border-white/15 rounded text-white/80 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {s.value === 'shipped' ? 'Mark shipped' : s.value === 'delivered' ? 'Mark delivered' : s.value === 'processing' ? 'Mark processing' : 'Mark awaiting'}
                </button>
              ))}
              <button onClick={cancel} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-red-500/30 text-red-300 rounded hover:bg-red-500/10 disabled:opacity-50">
                <XCircle className="w-3.5 h-3.5" /> Cancel fulfillment
              </button>
            </div>
          </div>
        )}

        {/* Tracking display */}
        {(f.tracking_number || f.shipped_at || f.delivered_at) && (
          <div className="text-xs space-y-1.5 border-t border-white/5 pt-3">
            {f.carrier && <Row label="Carrier"><span className="text-white/70">{f.carrier}</span></Row>}
            {f.tracking_number && <Row label="Tracking"><span className="font-mono text-white/70">{f.tracking_number}</span></Row>}
            {f.tracking_url && <Row label="Tracking link"><a href={f.tracking_url} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline inline-flex items-center gap-1">Open<ExternalLink className="w-3 h-3" /></a></Row>}
            {f.shipped_at && <Row label="Shipped"><span className="text-white/70">{formatDateTime(f.shipped_at)}</span></Row>}
            {f.delivered_at && <Row label="Delivered"><span className="text-white/70">{formatDateTime(f.delivered_at)}</span></Row>}
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls = 'w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/30';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider text-white/40 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-white/40">{label}</span>
      {children}
    </div>
  );
}
