import { useAzuraCast } from '../hooks/useAzuraCast';

export function TrackHistory() {
  const { history, isLoading, error } = useAzuraCast();

  if (error) {
    return null;
  }

  return (
    <section className="py-12 px-4 sm:px-6 border-b border-white/10">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl font-light text-white mb-6">Recent Tracks</h2>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="space-y-2">
                  <div className="h-4 bg-white/5 rounded w-2/3" />
                  <div className="h-3 bg-white/5 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : history?.items && history.items.length > 0 ? (
          <div className="space-y-0.5">
            {history.items.slice(0, 5).map((item, index) => (
              <div
                key={`${item.startedAt}-${index}`}
                className="py-3 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors"
              >
                <p className="text-sm text-white font-medium truncate">
                  {item.title}
                </p>
                <p className="text-xs text-white/50 truncate">{item.artist}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-white/40 text-sm">No recent tracks available</p>
        )}
      </div>
    </section>
  );
}
