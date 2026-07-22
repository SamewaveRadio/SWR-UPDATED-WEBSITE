import { useState, useEffect } from 'react';
import { RefreshCw, Database, Clock, Lock, LogOut, Package, CheckCircle2 } from 'lucide-react';
import { Navigation } from '../components/Navigation';
import { AdminProducts } from '../components/AdminProducts';
import { PrintifyRepairPanel } from '../components/PrintifyRepairPanel';
import { useAdminAuth } from '../contexts/AdminAuthContext';

interface IndexStatus {
  lastUpdated: string | null;
  count: number;
}

type AdminTab = 'mixcloud' | 'products' | 'printify';

function AdminLogin() {
  const { signIn } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await signIn(email, password);
    if (error) setError(error);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Lock className="w-8 h-8 mx-auto text-white/30 mb-3" />
          <h1 className="text-xl font-light">Admin Sign In</h1>
          <p className="text-xs text-white/40 mt-1">Authorized administrators only</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-white/60 text-xs font-medium mb-1.5 uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 bg-white/5 text-white text-sm rounded border border-white/10 focus:outline-none focus:border-white/30"
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label className="block text-white/60 text-xs font-medium mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 bg-white/5 text-white text-sm rounded border border-white/10 focus:outline-none focus:border-white/30"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors rounded disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user, loading: authLoading, signOut } = useAdminAuth();
  const [tab, setTab] = useState<AdminTab>('mixcloud');
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const apiUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const rebuildSecret = '61d41b3577d8564bab59068cec91592c1d9c0da574afddb1bd720d403c498db2';

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiUrl}/functions/v1/mixcloud-index-status`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleRebuild = async () => {
    if (!confirm('This will rebuild the entire Mixcloud catalogue. This may take several minutes. Continue?')) {
      return;
    }

    try {
      setRebuilding(true);
      setMessage(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);

      const response = await fetch(`${apiUrl}/functions/v1/mixcloud-index-rebuild`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'X-Rebuild-Secret': rebuildSecret,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to rebuild catalogue';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = `Server error: ${response.status} - ${errorText.substring(0, 100)}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      setMessage({
        type: 'success',
        text: `Successfully rebuilt catalogue with ${data.total} items!`,
      });
      await fetchStatus();
    } catch (err) {
      console.error('Rebuild error:', err);
      let errorMessage = 'Failed to rebuild catalogue';

      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          errorMessage = 'Request timed out after 5 minutes. The rebuild may still be processing. Check back in a few minutes and refresh the status.';
        } else {
          errorMessage = err.message;
        }
      }

      setMessage({
        type: 'error',
        text: errorMessage,
      });
    } finally {
      setRebuilding(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-white/40 text-sm">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <AdminLogin />;
  }

  return (
    <div className="min-h-screen bg-black text-white pb-32 sm:pb-36">
      <Navigation />
      <div className="pt-20 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8 sm:mb-12">
          <div>
            <h1 className="text-2xl sm:text-3xl font-light mb-1">Admin</h1>
            <p className="text-xs sm:text-sm text-white/40">Signed in as {user.email}</p>
          </div>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/20 rounded transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-6 border-b border-white/10">
          <button
            onClick={() => setTab('mixcloud')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === 'mixcloud'
                ? 'border-white text-white'
                : 'border-transparent text-white/40 hover:text-white/70'
            }`}
          >
            <Database className="w-4 h-4 inline mr-1.5" />
            Mixcloud
          </button>
          <button
            onClick={() => setTab('products')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === 'products'
                ? 'border-white text-white'
                : 'border-transparent text-white/40 hover:text-white/70'
            }`}
          >
            <Package className="w-4 h-4 inline mr-1.5" />
            Products
          </button>
          <button
            onClick={() => setTab('printify')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === 'printify'
                ? 'border-white text-white'
                : 'border-transparent text-white/40 hover:text-white/70'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 inline mr-1.5" />
            Printify
          </button>
        </div>

        {tab === 'products' && <AdminProducts />}

        {tab === 'printify' && <PrintifyRepairPanel />}

        {tab === 'mixcloud' && (
          <>
            {loading ? (
              <div className="border border-white/10 p-6">
                <p className="text-white/40">Loading status...</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="border border-white/10 p-6 space-y-4">
                  <h2 className="text-lg font-light flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Index Status
                  </h2>

                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                      <span className="text-white/60">Total Items</span>
                      <span className="font-medium">{status?.count || 0}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                      <span className="text-white/60 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Last Updated
                      </span>
                      <span className="font-medium">{formatDate(status?.lastUpdated || null)}</span>
                    </div>
                  </div>
                </div>

                {message && (
                  <div
                    className={`border p-4 ${
                      message.type === 'success'
                        ? 'border-green-500/20 bg-green-500/5 text-green-400'
                        : 'border-red-500/20 bg-red-500/5 text-red-400'
                    }`}
                  >
                    {message.text}
                  </div>
                )}

                <div className="border border-white/10 p-6 space-y-4">
                  <div>
                    <h2 className="text-lg font-light mb-2">Rebuild Catalogue</h2>
                    <p className="text-sm text-white/60 mb-4">
                      Fetch all uploads from Mixcloud and rebuild the searchable catalogue. This process may take several minutes.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={handleRebuild}
                      disabled={rebuilding}
                      className="flex items-center gap-2 px-6 py-3 border border-white/20 hover:border-white/40 hover:bg-white/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-4 h-4 ${rebuilding ? 'animate-spin' : ''}`} />
                      {rebuilding ? 'Rebuilding...' : 'Rebuild Index'}
                    </button>

                    {rebuilding && (
                      <div className="text-xs text-white/40 space-y-1">
                        <p>Please wait, this may take several minutes depending on the number of uploads...</p>
                        <p>Fetching cloudcasts from Mixcloud, enriching with tags, and updating database...</p>
                      </div>
                    )}

                    <button
                      onClick={fetchStatus}
                      disabled={rebuilding}
                      className="flex items-center gap-2 px-4 py-2 text-xs border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Refresh Status
                    </button>
                  </div>
                </div>

                <div className="border border-white/10 p-6 space-y-3 bg-white/[0.02]">
                  <h3 className="text-sm font-medium text-white/80">When to rebuild:</h3>
                  <ul className="text-sm text-white/60 space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-white/40 mt-0.5">•</span>
                      <span>After uploading new shows to Mixcloud</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-white/40 mt-0.5">•</span>
                      <span>When new uploads are not appearing on the Archive page</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-white/40 mt-0.5">•</span>
                      <span>After updating tags on existing shows</span>
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
