import { useState, useEffect } from 'react';
import { RefreshCw, Database, Clock } from 'lucide-react';
import { Navigation } from '../components/Navigation';

interface IndexStatus {
  lastUpdated: string | null;
  count: number;
}

export default function AdminPage() {
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

  return (
    <div className="min-h-screen bg-black text-white pb-32 sm:pb-36">
      <Navigation />
      <div className="pt-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-3xl font-light mb-1">Admin</h1>
          <p className="text-xs sm:text-sm text-white/40">Manage Mixcloud catalogue index</p>
        </div>

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
      </div>
    </div>
  );
}
