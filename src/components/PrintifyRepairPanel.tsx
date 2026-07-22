import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, ExternalLink, Webhook, Lock } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface LockedProduct {
  id: number;
  title: string;
  is_locked: boolean;
  hasStorefrontPage: boolean;
}

interface ProductResult {
  productId: string;
  action: string;
  status: number;
  response: string;
}

export function PrintifyRepairPanel() {
  const [products, setProducts] = useState<LockedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ProductResult | null>>({});
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookResult, setWebhookResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchLockedProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/repair-printify-publishing`,
        {
          headers: {
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch locked products');
      }

      setProducts(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch locked products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLockedProducts();
  }, [fetchLockedProducts]);

  const processProduct = async (productId: number | string, action: 'succeeded' | 'failed') => {
    const productIdStr = String(productId);
    setProcessing((prev) => ({ ...prev, [productIdStr]: true }));
    setError(null);

    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/repair-printify-publishing`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ productId: productIdStr, action }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setResults((prev) => ({
          ...prev,
          [productIdStr]: {
            productId: productIdStr,
            action,
            status: response.status,
            response: data.error || 'Unknown error',
          },
        }));
      } else {
        setResults((prev) => ({
          ...prev,
          [productIdStr]: {
            productId: productIdStr,
            action: data.action,
            status: data.status,
            response: data.response,
          },
        }));
      }
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [productIdStr]: {
          productId: productIdStr,
          action,
          status: 0,
          response: err instanceof Error ? err.message : 'Network error',
        },
      }));
    } finally {
      setProcessing((prev) => ({ ...prev, [productIdStr]: false }));
    }
  };

  const setupWebhook = async () => {
    setWebhookLoading(true);
    setWebhookResult(null);
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/printify-webhook-setup`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to register webhook');
      }

      setWebhookResult({
        success: true,
        message: data.alreadyExists
          ? `Webhook already registered (ID: ${data.webhook.id})`
          : `Webhook registered successfully (ID: ${data.webhook.id})`,
      });
    } catch (err) {
      setWebhookResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to register webhook',
      });
    } finally {
      setWebhookLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-light text-white">Printify Publishing Repair</h2>
      </div>

      <p className="text-sm text-white/40 mb-6">
        Review and resolve products stuck in publishing state
      </p>

      {error && (
        <div className="border border-red-500/20 bg-red-500/5 text-red-400 p-4 mb-6 text-sm rounded">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={fetchLockedProducts}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border border-white/10 hover:border-white/30 hover:bg-white/5 text-sm transition-all disabled:opacity-50 rounded"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading...' : 'Refresh List'}
        </button>
        <span className="text-xs text-white/40">
          {products.length} locked product{products.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading && products.length === 0 ? (
        <div className="border border-white/10 p-8 text-center rounded">
          <p className="text-white/40 text-sm">Fetching locked products from Printify...</p>
        </div>
      ) : products.length === 0 ? (
        <div className="border border-white/10 p-8 text-center rounded">
          <CheckCircle2 className="w-8 h-8 text-green-400/60 mx-auto mb-3" />
          <p className="text-white/60 text-sm">
            No locked products found. All products have completed publishing.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {products.map((product) => {
            const productIdKey = String(product.id);
            const result = results[productIdKey];
            const isProcessing = processing[productIdKey] ?? false;

            return (
              <div
                key={product.id}
                className="border border-white/10 p-4 sm:p-6 space-y-4 rounded"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Lock className="w-4 h-4 text-yellow-400/80 flex-shrink-0" />
                      <h3 className="text-sm sm:text-base font-medium text-white truncate">
                        {product.title}
                      </h3>
                    </div>
                    <p className="text-xs text-white/40 ml-6">
                      ID: {product.id}
                    </p>
                    <div className="ml-6 mt-2">
                      {product.hasStorefrontPage ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-green-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Storefront page exists at /shop/{product.id}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-yellow-400/80">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          No working storefront page detected
                        </span>
                      )}
                    </div>
                  </div>

                  <a
                    href={`/shop/${product.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white transition-colors flex-shrink-0"
                  >
                    View page
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <button
                    onClick={() => processProduct(String(product.id), 'succeeded')}
                    disabled={isProcessing || !product.hasStorefrontPage}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 border border-white/20 hover:border-white/40 hover:bg-white/5 text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed rounded"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Confirm published
                  </button>
                  <button
                    onClick={() => processProduct(String(product.id), 'failed')}
                    disabled={isProcessing}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/5 text-sm text-red-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed rounded"
                  >
                    <XCircle className="w-4 h-4" />
                    Unlock as failed
                  </button>
                </div>

                {isProcessing && (
                  <p className="text-xs text-white/40">Processing...</p>
                )}

                {result && !isProcessing && (
                  <div
                    className={`border p-3 text-xs font-mono break-all rounded ${
                      result.status >= 200 && result.status < 300
                        ? 'border-green-500/20 bg-green-500/5 text-green-400'
                        : 'border-red-500/20 bg-red-500/5 text-red-400'
                    }`}
                  >
                    <div className="mb-1 text-white/60">
                      {result.action === 'succeeded' ? 'publishing_succeeded' : 'publishing_failed'} — HTTP {result.status}
                    </div>
                    <div className="whitespace-pre-wrap">{result.response}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8 border border-white/10 p-4 bg-white/[0.02] rounded">
        <div className="flex items-start gap-3 mb-4">
          <Webhook className="w-4 h-4 text-white/50 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-white/80 mb-1">Printify Webhook Setup</h3>
            <p className="text-xs text-white/40 mb-3">
              Registers the <code className="text-white/60">product:publish:started</code> webhook on Printify. Run once — duplicates are skipped automatically.
            </p>
            <button
              onClick={setupWebhook}
              disabled={webhookLoading}
              className="flex items-center gap-2 px-4 py-2 border border-white/10 hover:border-white/30 hover:bg-white/5 text-sm transition-all disabled:opacity-50 rounded"
            >
              <Webhook className={`w-3.5 h-3.5 ${webhookLoading ? 'animate-pulse' : ''}`} />
              {webhookLoading ? 'Registering...' : 'Register Webhook'}
            </button>
            {webhookResult && (
              <div
                className={`mt-3 border p-3 text-xs rounded ${
                  webhookResult.success
                    ? 'border-green-500/20 bg-green-500/5 text-green-400'
                    : 'border-red-500/20 bg-red-500/5 text-red-400'
                }`}
              >
                {webhookResult.message}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 border border-white/10 p-4 bg-white/[0.02] rounded">
        <h3 className="text-sm font-medium text-white/80 mb-2">How this works</h3>
        <ul className="text-sm text-white/50 space-y-1.5">
          <li className="flex items-start gap-2">
            <span className="text-white/30 mt-0.5">1.</span>
            <span>The server fetches all products from Printify and filters for those with <code className="text-white/70">is_locked: true</code>.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-white/30 mt-0.5">2.</span>
            <span>Each locked product is checked for a working storefront page at <code className="text-white/70">/shop/&#123;productId&#125;</code>.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-white/30 mt-0.5">3.</span>
            <span><strong className="text-white/70">Confirm published</strong> calls Printify's <code>publishing_succeeded</code> endpoint — only allowed if a storefront page exists.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-white/30 mt-0.5">4.</span>
            <span><strong className="text-white/70">Unlock as failed</strong> calls Printify's <code>publishing_failed</code> endpoint to release the lock.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-white/30 mt-0.5">5.</span>
            <span>No product is processed automatically — you must confirm each one individually.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
