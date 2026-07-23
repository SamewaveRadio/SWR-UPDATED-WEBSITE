import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, RefreshCw, ChevronLeft, ChevronRight, PackageSearch, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  OrderRow, FulfillmentRow, formatMoney, formatDateTime, orderNumber, paymentLabel, paymentTone,
  fulfillmentLabel, fulfillmentTone, sourceSummary, groupLabel,
} from '../lib/orders';
import { StatusBadge, ModeBadge } from '../components/OrderUI';

const PAGE_SIZE = 25;

type SortKey = 'newest' | 'oldest' | 'total' | 'payment' | 'fulfillment';

interface Summary {
  today: number; paid: number; needsFulfillment: number;
  partiallyFulfilled: number; shipped: number; failures: number;
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All orders' },
  { value: 'pay:pending', label: 'Pending payment' },
  { value: 'pay:paid', label: 'Paid' },
  { value: 'pay:failed', label: 'Payment failed' },
  { value: 'pay:cancelled', label: 'Cancelled' },
  { value: 'pay:refunded', label: 'Refunded' },
  { value: 'ful:awaiting_fulfillment', label: 'Needs fulfillment' },
  { value: 'ful:processing', label: 'Processing' },
  { value: 'ful:partially_fulfilled', label: 'Partially fulfilled' },
  { value: 'ful:shipped', label: 'Shipped' },
  { value: 'ful:delivered', label: 'Delivered' },
  { value: 'ful:fulfillment_failed', label: 'Fulfillment failed' },
  { value: 'src:printify', label: 'Printify orders' },
  { value: 'src:manual', label: 'Manual orders' },
  { value: 'src:mixed', label: 'Mixed orders' },
  { value: 'mode:test', label: 'Test orders' },
  { value: 'mode:live', label: 'Live orders' },
];

const DATE_FILTERS = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
];

export default function OrdersListPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [fulfillmentsByOrder, setFulfillmentsByOrder] = useState<Record<string, FulfillmentRow[]>>({});
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('any');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [summary, setSummary] = useState<Summary | null>(null);

  const dateBounds = useMemo(() => {
    const now = new Date();
    if (dateFilter === 'today') {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      return { from: start.toISOString(), to: null };
    }
    if (dateFilter === '7d') return { from: new Date(now.getTime() - 7 * 864e5).toISOString(), to: null };
    if (dateFilter === '30d') return { from: new Date(now.getTime() - 30 * 864e5).toISOString(), to: null };
    if (dateFilter === 'custom') {
      return {
        from: customFrom ? new Date(customFrom).toISOString() : null,
        to: customTo ? new Date(new Date(customTo).getTime() + 864e5).toISOString() : null,
      };
    }
    return { from: null, to: null };
  }, [dateFilter, customFrom, customTo]);

  const fetchSummary = useCallback(async () => {
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const c = (q: any) => q.then((r: any) => r.count ?? 0);
    const base = () => supabase.from('orders').select('id', { count: 'exact', head: true });
    const [today, paid, needsFulfillment, partiallyFulfilled, shipped, failures] = await Promise.all([
      c(base().gte('created_at', startToday.toISOString())),
      c(base().eq('payment_status', 'paid')),
      c(base().eq('payment_status', 'paid').in('fulfillment_status', ['awaiting_fulfillment', 'unfulfilled'])),
      c(base().eq('fulfillment_status', 'partially_fulfilled')),
      c(base().eq('fulfillment_status', 'shipped')),
      c(base().eq('fulfillment_status', 'fulfillment_failed')),
    ]);
    setSummary({ today, paid, needsFulfillment, partiallyFulfilled, shipped, failures });
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from('orders').select('*', { count: 'exact' });

      // Status / source / mode filters
      if (statusFilter.startsWith('pay:')) query = query.eq('payment_status', statusFilter.slice(4));
      else if (statusFilter.startsWith('ful:')) {
        const v = statusFilter.slice(4);
        query = v === 'awaiting_fulfillment'
          ? query.in('fulfillment_status', ['awaiting_fulfillment', 'unfulfilled'])
          : query.eq('fulfillment_status', v);
      } else if (statusFilter === 'src:printify') query = query.eq('has_printify', true).eq('has_manual', false);
      else if (statusFilter === 'src:manual') query = query.eq('has_manual', true).eq('has_printify', false);
      else if (statusFilter === 'src:mixed') query = query.eq('has_printify', true).eq('has_manual', true);
      else if (statusFilter === 'mode:test') query = query.or('stripe_livemode.is.null,stripe_livemode.eq.false');
      else if (statusFilter === 'mode:live') query = query.eq('stripe_livemode', true);

      if (dateBounds.from) query = query.gte('created_at', dateBounds.from);
      if (dateBounds.to) query = query.lt('created_at', dateBounds.to);

      // Search across order-level + child tables
      const term = search.trim();
      if (term) {
        const like = `%${term}%`;
        const childIds = new Set<string>();
        const [{ data: itemMatches }, { data: fulMatches }] = await Promise.all([
          supabase.from('order_items').select('order_id').or(`sku.ilike.${like},product_title.ilike.${like}`).limit(200),
          supabase.from('fulfillments').select('order_id').or(`tracking_number.ilike.${like},printify_order_id.ilike.${like}`).limit(200),
        ]);
        (itemMatches ?? []).forEach((r: any) => childIds.add(r.order_id));
        (fulMatches ?? []).forEach((r: any) => childIds.add(r.order_id));

        const ors = [
          `email.ilike.${like}`,
          `shipping_name.ilike.${like}`,
          `stripe_checkout_session_id.ilike.${like}`,
          `stripe_payment_intent_id.ilike.${like}`,
        ];
        // order-number search (first 8 chars of uuid)
        if (/^[0-9a-fA-F-]{4,}$/.test(term.replace('#', ''))) {
          ors.push(`id.ilike.${term.replace('#', '')}%`);
        }
        if (childIds.size > 0) ors.push(`id.in.(${Array.from(childIds).join(',')})`);
        query = query.or(ors.join(','));
      }

      // Sorting
      if (sort === 'newest') query = query.order('created_at', { ascending: false });
      else if (sort === 'oldest') query = query.order('created_at', { ascending: true });
      else if (sort === 'total') query = query.order('total_cents', { ascending: false });
      else if (sort === 'payment') query = query.order('payment_status', { ascending: true });
      else if (sort === 'fulfillment') query = query.order('fulfillment_status', { ascending: true, nullsFirst: true });

      const from = page * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as OrderRow[];
      setOrders(rows);
      setTotal(count ?? 0);

      const ids = rows.map((r) => r.id);
      if (ids.length > 0) {
        const [{ data: fuls }, { data: items }] = await Promise.all([
          supabase.from('fulfillments').select('*').in('order_id', ids),
          supabase.from('order_items').select('order_id, quantity').in('order_id', ids),
        ]);
        const fMap: Record<string, FulfillmentRow[]> = {};
        (fuls ?? []).forEach((f: any) => { (fMap[f.order_id] ??= []).push(f); });
        setFulfillmentsByOrder(fMap);
        const cMap: Record<string, number> = {};
        (items ?? []).forEach((i: any) => { cMap[i.order_id] = (cMap[i.order_id] ?? 0) + i.quantity; });
        setItemCounts(cMap);
      } else {
        setFulfillmentsByOrder({});
        setItemCounts({});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateBounds, search, sort, page]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { setPage(0); }, [statusFilter, dateFilter, customFrom, customTo, search, sort]);

  const trackingStatus = (orderId: string): string => {
    const fuls = fulfillmentsByOrder[orderId] ?? [];
    if (fuls.length === 0) return '—';
    const withTracking = fuls.find((f) => f.tracking_number);
    if (withTracking) return `${withTracking.carrier ? withTracking.carrier + ' · ' : ''}${withTracking.tracking_number}`;
    const priority = ['delivered', 'shipped', 'submitted', 'processing', 'awaiting_fulfillment', 'failed'];
    const best = fuls.slice().sort((a, b) => priority.indexOf(a.status) - priority.indexOf(b.status))[0];
    return groupLabel(best.status);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const cards = [
    { label: 'Orders today', value: summary?.today, tone: 'text-white' },
    { label: 'Paid orders', value: summary?.paid, tone: 'text-emerald-300' },
    { label: 'Needs fulfillment', value: summary?.needsFulfillment, tone: 'text-amber-300' },
    { label: 'Partially fulfilled', value: summary?.partiallyFulfilled, tone: 'text-amber-300' },
    { label: 'Shipped', value: summary?.shipped, tone: 'text-sky-300' },
    { label: 'Fulfillment failures', value: summary?.failures, tone: 'text-red-300' },
  ];

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="border border-white/10 rounded-lg p-3 bg-white/[0.02]">
            <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1">{c.label}</p>
            <p className={`text-2xl font-light ${c.tone}`}>{c.value ?? '—'}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="space-y-3">
        <form
          onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search order #, name, email, SKU, product, session/payment intent, Printify order, tracking"
              className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-white text-black text-sm rounded font-medium hover:bg-white/90">Search</button>
          {search && (
            <button type="button" onClick={() => { setSearch(''); setSearchInput(''); }} className="px-3 py-2 text-sm text-white/60 border border-white/10 rounded hover:text-white">Clear</button>
          )}
        </form>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1.5 text-white/40 text-xs"><Filter className="w-3.5 h-3.5" /> Filters</div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-white/5 border border-white/10 rounded text-sm text-white px-2 py-1.5 focus:outline-none focus:border-white/30">
            {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value} className="bg-black">{f.label}</option>)}
          </select>
          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="bg-white/5 border border-white/10 rounded text-sm text-white px-2 py-1.5 focus:outline-none focus:border-white/30">
            {DATE_FILTERS.map((f) => <option key={f.value} value={f.value} className="bg-black">{f.label}</option>)}
          </select>
          {dateFilter === 'custom' && (
            <>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="bg-white/5 border border-white/10 rounded text-sm text-white px-2 py-1.5" />
              <span className="text-white/30 text-xs">to</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="bg-white/5 border border-white/10 rounded text-sm text-white px-2 py-1.5" />
            </>
          )}
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="bg-white/5 border border-white/10 rounded text-sm text-white px-2 py-1.5 focus:outline-none focus:border-white/30 ml-auto">
            <option value="newest" className="bg-black">Newest first</option>
            <option value="oldest" className="bg-black">Oldest first</option>
            <option value="total" className="bg-black">Order total</option>
            <option value="payment" className="bg-black">Payment status</option>
            <option value="fulfillment" className="bg-black">Fulfillment status</option>
          </select>
          <button onClick={() => { fetchOrders(); fetchSummary(); }} className="p-2 text-white/50 hover:text-white border border-white/10 rounded" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Results */}
      {error ? (
        <div className="border border-red-500/30 bg-red-500/5 text-red-300 rounded-lg p-4 text-sm">{error}</div>
      ) : loading ? (
        <div className="border border-white/10 rounded-lg p-10 text-center text-white/40 text-sm">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="border border-white/10 rounded-lg p-12 text-center">
          <PackageSearch className="w-10 h-10 mx-auto text-white/20 mb-3" />
          <p className="text-white/50 text-sm">No orders match the current filters.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block border border-white/10 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-white/40">
                  <th className="px-3 py-2.5 font-medium">Order</th>
                  <th className="px-3 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium">Customer</th>
                  <th className="px-3 py-2.5 font-medium">Payment</th>
                  <th className="px-3 py-2.5 font-medium">Fulfillment</th>
                  <th className="px-3 py-2.5 font-medium">Source</th>
                  <th className="px-3 py-2.5 font-medium text-right">Total</th>
                  <th className="px-3 py-2.5 font-medium">Tracking</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                    <td className="px-3 py-3">
                      <Link to={`/admin/orders/${o.id}`} className="font-mono text-white hover:underline">{orderNumber(o.id)}</Link>
                      <div className="mt-1"><ModeBadge live={o.stripe_livemode} /></div>
                    </td>
                    <td className="px-3 py-3 text-white/60 whitespace-nowrap">{formatDateTime(o.created_at)}</td>
                    <td className="px-3 py-3">
                      <div className="text-white/80">{o.shipping_name || '—'}</div>
                      <div className="text-white/40 text-xs">{o.email}</div>
                    </td>
                    <td className="px-3 py-3"><StatusBadge label={paymentLabel(o.payment_status)} tone={paymentTone(o.payment_status)} /></td>
                    <td className="px-3 py-3"><StatusBadge label={fulfillmentLabel(o.fulfillment_status)} tone={fulfillmentTone(o.fulfillment_status)} /></td>
                    <td className="px-3 py-3 text-white/60">
                      {sourceSummary(o)}
                      <span className="text-white/30"> · {itemCounts[o.id] ?? 0} item{(itemCounts[o.id] ?? 0) === 1 ? '' : 's'}</span>
                    </td>
                    <td className="px-3 py-3 text-right text-white font-medium">{formatMoney(o.total_cents, o.currency)}</td>
                    <td className="px-3 py-3 text-white/50 text-xs max-w-[160px] truncate">{trackingStatus(o.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {orders.map((o) => (
              <Link key={o.id} to={`/admin/orders/${o.id}`} className="block border border-white/10 rounded-lg p-4 bg-white/[0.02] hover:bg-white/[0.04]">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-white flex items-center gap-2">{orderNumber(o.id)} <ModeBadge live={o.stripe_livemode} /></span>
                  <span className="text-white font-medium">{formatMoney(o.total_cents, o.currency)}</span>
                </div>
                <div className="text-white/70 text-sm">{o.shipping_name || '—'}</div>
                <div className="text-white/40 text-xs mb-2">{o.email}</div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <StatusBadge label={paymentLabel(o.payment_status)} tone={paymentTone(o.payment_status)} />
                  <StatusBadge label={fulfillmentLabel(o.fulfillment_status)} tone={fulfillmentTone(o.fulfillment_status)} />
                </div>
                <div className="flex items-center justify-between text-xs text-white/40">
                  <span>{formatDateTime(o.created_at)}</span>
                  <span>{sourceSummary(o)} · {itemCounts[o.id] ?? 0} item{(itemCounts[o.id] ?? 0) === 1 ? '' : 's'}</span>
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-white/50">
            <span>{total} order{total === 1 ? '' : 's'} · Page {page + 1} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="p-2 border border-white/10 rounded disabled:opacity-30 hover:text-white"><ChevronLeft className="w-4 h-4" /></button>
              <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="p-2 border border-white/10 rounded disabled:opacity-30 hover:text-white"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
