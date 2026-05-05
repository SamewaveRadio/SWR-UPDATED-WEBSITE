import { useEffect, useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { usePlayer } from '../contexts/PlayerContext';
import { supabase } from '../lib/supabase';

interface ArchiveItem {
  id: string;
  title: string;
  host_name: string | null;
  resident: string | null;
  tags: string[] | null;
  audio_url: string | null;
  artwork_url: string | null;
  mixcloud_url: string | null;
  aired_at: string | null;
  aired_date: string | null;
  duration_seconds: number | null;
}

function formatAiredDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${mm}.${dd}.${yyyy}`;
}

function getHostName(item: ArchiveItem): string {
  return item.host_name || item.resident || '';
}

function getArchiveDisplayTitle(item: ArchiveItem): string {
  const host = getHostName(item);
  const dateStr = formatAiredDate(item.aired_date || item.aired_at);
  const parts = [item.title];
  if (host) parts[0] += ` with ${host}`;
  if (dateStr) parts[0] += ` (Aired ${dateStr})`;
  return parts[0];
}

export function Archive() {
  const [uploads, setUploads] = useState<ArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const player = usePlayer();

  useEffect(() => {
    fetchLatestUploads();
  }, []);

  const fetchLatestUploads = async () => {
    if (import.meta.env.DEV) {
      console.log('[Archive] Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
    }

    try {
      const { data, error } = await supabase
        .from('archive_items')
        .select('id,title,host_name,resident,tags,audio_url,artwork_url,mixcloud_url,aired_at,aired_date,duration_seconds')
        .eq('is_published', true)
        .eq('processing_status', 'processed')
        .not('audio_url', 'is', null)
        .order('aired_at', { ascending: false, nullsFirst: false })
        .limit(6);

      if (import.meta.env.DEV) {
        if (error) console.error('[Archive] Query error:', error);
        else {
          console.log('[Archive] Latest uploads count:', data?.length ?? 0);
          if (data && data.length > 0) console.log('[Archive] First row title:', data[0].title);
        }
      }

      if (error) throw error;

      const items = data ?? [];

      // Client-side sort: rows without aired_at but with aired_date fall to bottom of server sort;
      // re-sort by best available date descending so they appear in correct order.
      items.sort((a, b) => {
        const dateA = a.aired_at || (a.aired_date ? `${a.aired_date}T00:00:00Z` : '');
        const dateB = b.aired_at || (b.aired_date ? `${b.aired_date}T00:00:00Z` : '');
        return dateB.localeCompare(dateA);
      });

      setUploads(items);
    } catch (error) {
      console.error('[Archive] Error fetching latest uploads:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="archive" className="py-12 sm:py-16 px-4 sm:px-6 border-b border-white/10">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-xl sm:text-2xl font-light text-white tracking-wide mb-6 sm:mb-8">Archive</h2>

        <div className="space-y-4 sm:space-y-6">
          <p className="text-white/60 text-sm max-w-2xl">
            Listen to past broadcasts and resident mixes from the Samewave Radio archive.
          </p>

          <div className="pt-6 sm:pt-8 space-y-3 sm:space-y-4">
            <h3 className="text-white/80 text-xs sm:text-sm tracking-wide">LATEST UPLOADS</h3>
            {loading ? (
              <div className="py-6 sm:py-8 text-center text-white/40 text-sm">Loading latest uploads...</div>
            ) : uploads.length > 0 ? (
              <div className="space-y-px">
                {uploads.map((item) => {
                  const displayTitle = getArchiveDisplayTitle(item);
                  const tags: string[] = Array.isArray(item.tags) ? item.tags : [];
                  return (
                    <div
                      key={item.id}
                      className="w-full py-3 sm:py-4 px-3 sm:px-4 bg-white/5 hover:bg-white/10 transition-colors group"
                    >
                      <div className="flex items-center gap-3 sm:gap-4">
                        <button
                          onClick={() => {
                            player.playArchive({
                              source: 'r2',
                              audioUrl: item.audio_url!,
                              title: displayTitle,
                              residentName: getHostName(item),
                              artworkUrl: item.artwork_url ?? undefined,
                              durationSeconds: item.duration_seconds ?? undefined,
                            });
                          }}
                          className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors rounded-sm"
                          title="Play"
                        >
                          <Play className="w-3 h-3 sm:w-4 sm:h-4 text-white fill-white" />
                        </button>
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 rounded-sm flex-shrink-0 overflow-hidden">
                          {item.artwork_url ? (
                            <img
                              src={item.artwork_url}
                              alt={item.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-white/10" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-white text-xs sm:text-sm font-medium truncate">{displayTitle}</p>
                        </div>
                        {item.mixcloud_url && (
                          <a
                            href={item.mixcloud_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 p-1.5 text-white/40 hover:text-white transition-colors"
                            title="Open on Mixcloud"
                          >
                            <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                          </a>
                        )}
                      </div>
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2 ml-[52px] sm:ml-[64px]">
                          {tags.slice(0, 3).map((tag, tagIndex) => (
                            <span
                              key={tagIndex}
                              className="inline-block px-2 py-0.5 text-[10px] sm:text-xs text-white/60 border border-white/10 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                          {tags.length > 3 && (
                            <span className="inline-block px-2 py-0.5 text-[10px] sm:text-xs text-white/40">
                              +{tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 sm:py-8 text-center text-white/40 text-sm">No uploads yet</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
