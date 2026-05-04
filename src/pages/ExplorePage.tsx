import { useState, useEffect, useRef } from 'react';
import { Play, ExternalLink, X } from 'lucide-react';
import { usePlayer } from '../contexts/PlayerContext';
import { Navigation } from '../components/Navigation';
import { supabase } from '../lib/supabase';

interface ArchiveTag {
  name: string;
  url?: string;
}

interface MixcloudUpload {
  name: string;
  url: string;
  created_time: string;
  pictures: {
    extra_large: string;
  };
  tags: ArchiveTag[];
}

interface R2ArchiveRow {
  id: string;
  title: string;
  host_name: string | null;
  resident: string | null;
  description: string | null;
  tracklist: string | null;
  tags: string[] | null;
  audio_url: string | null;
  artwork_url: string | null;
  mixcloud_url: string | null;
  aired_at: string | null;
  aired_date: string | null;
  duration_seconds: number | null;
}

interface ArchiveUpload {
  id: string;
  source: 'r2' | 'mixcloud';
  title: string;
  displayTitle: string;
  hostName?: string;
  url?: string;
  audioUrl?: string;
  artworkUrl?: string;
  createdTime?: string;
  airedAt?: string;
  durationSeconds?: number;
  tags: ArchiveTag[];
}

interface ExploreResponse {
  items: MixcloudUpload[];
  nextCursor: string | null;
}

const PAGE_SIZE = 24;
const R2_CUTOFF_MS = new Date('2025-02-01T00:00:00Z').getTime();
const MIXCLOUD_CUTOFF_TIME = new Date('2025-01-30T00:00:00Z').getTime();
const DEBUG_ARCHIVE = import.meta.env.DEV;

function formatAiredDate(value?: string | null): string {
  if (!value) return '';

  const dateOnly = value.slice(0, 10);
  const match = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return `${month}.${day}.${year}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${month}.${day}.${year}`;
}

function getSortTime(upload: ArchiveUpload): number {
  const value = upload.airedAt || upload.createdTime || '';
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function matchesSelectedTags(tags: ArchiveTag[], selectedTags: string[], matchMode: 'any' | 'all'): boolean {
  if (selectedTags.length === 0) return true;
  const itemTags = new Set(tags.map((tag) => tag.name.toLowerCase()));

  if (matchMode === 'all') {
    return selectedTags.every((tag) => itemTags.has(tag.toLowerCase()));
  }

  return selectedTags.some((tag) => itemTags.has(tag.toLowerCase()));
}

function mapR2Row(row: R2ArchiveRow): ArchiveUpload {
  const hostName = row.host_name || row.resident || '';
  const airedDateLabel = formatAiredDate(row.aired_date || row.aired_at);
  const displayTitle = airedDateLabel
    ? `${row.title} with ${hostName} (Aired ${airedDateLabel})`
    : `${row.title} with ${hostName}`;

  return {
    id: row.id,
    source: 'r2',
    title: row.title,
    displayTitle,
    hostName,
    audioUrl: row.audio_url || undefined,
    url: row.mixcloud_url || undefined,
    artworkUrl: row.artwork_url || undefined,
    airedAt: row.aired_at || row.aired_date || undefined,
    durationSeconds: row.duration_seconds || undefined,
    tags: (row.tags || []).map((name) => ({ name })),
  };
}

function mapMixcloudUpload(upload: MixcloudUpload): ArchiveUpload {
  return {
    id: upload.url,
    source: 'mixcloud',
    title: upload.name,
    displayTitle: upload.name,
    url: upload.url,
    artworkUrl: upload.pictures?.extra_large,
    createdTime: upload.created_time,
    tags: upload.tags || [],
  };
}

export default function ExplorePage() {
  const player = usePlayer();
  const [uploads, setUploads] = useState<ArchiveUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState<'any' | 'all'>('any');
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);
  const tagPickerRef = useRef<HTMLDivElement>(null);

  const apiUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  useEffect(() => {
    const fetchTags = async () => {
      try {
        setLoadingTags(true);

        const [mixcloudResponse, r2Response] = await Promise.allSettled([
          fetch(`${apiUrl}/functions/v1/mixcloud-catalogue-tags`, {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
            },
          }),
          supabase
            .from('archive_items')
            .select('tags')
            .eq('is_published', true)
            .eq('processing_status', 'processed')
            .not('audio_url', 'is', null)
            .range(0, 5000),
        ]);

        const tagSet = new Set<string>();

        if (mixcloudResponse.status === 'fulfilled' && mixcloudResponse.value.ok) {
          const data = await mixcloudResponse.value.json();
          (data.tags || []).forEach((tag: string) => tagSet.add(tag));
        }

        if (r2Response.status === 'fulfilled' && !r2Response.value.error) {
          (r2Response.value.data || []).forEach((row: { tags: string[] | null }) => {
            (row.tags || []).forEach((tag) => tagSet.add(tag));
          });
        }

        setAvailableTags(Array.from(tagSet).sort((a, b) => a.localeCompare(b)));
      } catch (err) {
        console.error('Failed to fetch tags:', err);
      } finally {
        setLoadingTags(false);
      }
    };
    fetchTags();
  }, [apiUrl, apiKey]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tagPickerRef.current && !tagPickerRef.current.contains(event.target as Node)) {
        setShowTagPicker(false);
      }
    };

    if (showTagPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showTagPicker]);

  const fetchMixcloudUploads = async (offset: number): Promise<ArchiveUpload[]> => {
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE * 2));
    params.set('offset', offset.toString());
    if (selectedTags.length > 0) {
      params.set('tags', selectedTags.join(','));
      params.set('match', matchMode);
    }

    const response = await fetch(`${apiUrl}/functions/v1/mixcloud-catalogue-query?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch Mixcloud uploads');
    }

    const data: ExploreResponse = await response.json();
    const rawItems = data.items || [];

    if (DEBUG_ARCHIVE) {
      console.log('[Archive] Mixcloud raw items returned:', rawItems.length);
    }

    const filtered = rawItems
      .filter((upload) => {
        const created = new Date(upload.created_time).getTime();
        return !Number.isNaN(created) && created < MIXCLOUD_CUTOFF_TIME;
      })
      .map(mapMixcloudUpload)
      .filter((upload) => matchesSelectedTags(upload.tags, selectedTags, matchMode));

    if (DEBUG_ARCHIVE) {
      console.log('[Archive] Mixcloud items after cutoff filter:', filtered.length);
    }

    return filtered;
  };

  const fetchR2Uploads = async (offset: number): Promise<ArchiveUpload[]> => {
    if (DEBUG_ARCHIVE) {
      console.log('[Archive] VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);
      console.log('[Archive] VITE_SUPABASE_ANON_KEY present:', !!import.meta.env.VITE_SUPABASE_ANON_KEY);

      const { data: debugRows, error: debugErr } = await supabase
        .from('archive_items')
        .select('id,title,is_published,processing_status,audio_url,aired_at,aired_date')
        .limit(5);

      if (debugErr) {
        console.warn('[Archive] R2 debug query error:', debugErr.message);
      } else {
        console.log('[Archive] R2 debug rows returned:', debugRows?.length ?? 0);
        if (debugRows && debugRows.length > 0) {
          const first = debugRows[0];
          console.log('[Archive] First row title:', first.title);
          console.log('[Archive] First row is_published:', first.is_published);
          console.log('[Archive] First row processing_status:', first.processing_status);
          console.log('[Archive] First row has audio_url:', !!first.audio_url);
          console.log('[Archive] First row aired_at:', first.aired_at);
          console.log('[Archive] First row aired_date:', first.aired_date);
        }
      }
    }

    let query = supabase
      .from('archive_items')
      .select('id,title,host_name,resident,description,tracklist,tags,audio_url,artwork_url,mixcloud_url,aired_at,aired_date,duration_seconds')
      .eq('is_published', true)
      .eq('processing_status', 'processed')
      .not('audio_url', 'is', null)
      .order('aired_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (selectedTags.length > 0 && matchMode === 'all') {
      query = query.contains('tags', selectedTags);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const rows = (data || [])
      .map((row) => mapR2Row(row as R2ArchiveRow))
      .filter((upload) => {
        // Apply cutoff client-side so rows with only aired_date (null aired_at) are included
        const raw = upload.airedAt || '';
        const t = new Date(raw.length === 10 ? raw + 'T00:00:00Z' : raw).getTime();
        return !Number.isNaN(t) && t >= R2_CUTOFF_MS;
      })
      .filter((upload) => matchesSelectedTags(upload.tags, selectedTags, matchMode));

    if (DEBUG_ARCHIVE) {
      console.log('[Archive] R2 rows after filter:', rows.length);
    }

    return rows;
  };

  const fetchUploads = async (offset: number = 0, append: boolean = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      const results = await Promise.allSettled([
        fetchR2Uploads(offset),
        fetchMixcloudUploads(offset),
      ]);

      const r2Uploads = results[0].status === 'fulfilled' ? results[0].value : [];
      const mixcloudUploads = results[1].status === 'fulfilled' ? results[1].value : [];

      if (results[0].status === 'rejected') {
        console.warn('[Archive] R2 source failed:', results[0].reason);
      }
      if (results[1].status === 'rejected') {
        console.warn('[Archive] Mixcloud source failed:', results[1].reason);
      }

      if (DEBUG_ARCHIVE) {
        console.log('[Archive] R2 count:', r2Uploads.length, '| Mixcloud count:', mixcloudUploads.length);
      }

      const combined = [...r2Uploads, ...mixcloudUploads]
        .sort((a, b) => getSortTime(b) - getSortTime(a))
        .slice(0, PAGE_SIZE);

      if (DEBUG_ARCHIVE) {
        console.log('[Archive] Combined count:', combined.length);
      }

      if (append) {
        setUploads(prev => [...prev, ...combined]);
      } else {
        setUploads(combined);
      }
      setNextCursor(combined.length === PAGE_SIZE ? String(offset + PAGE_SIZE) : null);

      // Only show error state if both sources failed
      if (results[0].status === 'rejected' && results[1].status === 'rejected') {
        throw results[0].reason;
      }
    } catch (err) {
      console.error('[Archive] Both sources failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load uploads');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchUploads();
  }, [selectedTags, matchMode]);

  const handleLoadMore = () => {
    if (nextCursor && !loadingMore) {
      fetchUploads(parseInt(nextCursor, 10), true);
    }
  };

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
    setTagSearch('');
    setShowTagPicker(false);
  };

  const handleRemoveTag = (tag: string) => {
    setSelectedTags(prev => prev.filter(t => t !== tag));
  };

  const handleClearTags = () => {
    setSelectedTags([]);
  };

  const handlePlay = (upload: ArchiveUpload) => {
    if (upload.source === 'r2') {
      player.playArchive({
        source: 'r2',
        audioUrl: upload.audioUrl,
        title: upload.displayTitle,
        residentName: upload.hostName,
        artworkUrl: upload.artworkUrl,
        durationSeconds: upload.durationSeconds,
      });
      return;
    }

    player.playArchive({
      source: 'mixcloud',
      url: upload.url,
      title: upload.displayTitle,
      artworkUrl: upload.artworkUrl,
      createdTime: upload.createdTime,
    });
  };

  const filteredAvailableTags = availableTags
    .filter(tag =>
      tag.toLowerCase().includes(tagSearch.toLowerCase()) &&
      !selectedTags.includes(tag)
    )
    .sort();

  return (
    <div className="min-h-screen bg-black text-white pb-32 sm:pb-36">
      <Navigation />
      <div className="pt-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-3xl font-light mb-1">Archive</h1>
          <p className="text-xs sm:text-sm text-white/40">All uploads</p>
        </div>

        <div className="mb-6 sm:mb-8 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative" ref={tagPickerRef}>
              <button
                onClick={() => setShowTagPicker(!showTagPicker)}
                className="px-3 py-1.5 text-base sm:text-xs border border-white/20 hover:border-white/40 transition-colors"
              >
                + Add Tag
              </button>

              {showTagPicker && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-black border border-white/20 shadow-xl z-20">
                  <input
                    type="text"
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    placeholder="Search tags..."
                    className="w-full px-3 py-2 bg-black border-b border-white/10 text-base text-white placeholder-white/40 focus:outline-none"
                    autoFocus
                  />
                  <div className="max-h-60 overflow-y-auto">
                    {loadingTags ? (
                      <div className="px-3 py-4 text-xs text-white/40 text-center">
                        Loading tags...
                      </div>
                    ) : filteredAvailableTags.length > 0 ? (
                      filteredAvailableTags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => handleTagToggle(tag)}
                          className="w-full px-3 py-2 text-xs text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                        >
                          {tag}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-4 text-xs text-white/40 text-center">
                        No tags found
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {selectedTags.map(tag => (
              <button
                key={tag}
                onClick={() => handleRemoveTag(tag)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-white text-black hover:bg-white/90 transition-colors"
              >
                {tag}
                <X className="w-3 h-3" />
              </button>
            ))}

            {selectedTags.length > 1 && (
              <button
                onClick={() => setMatchMode(matchMode === 'any' ? 'all' : 'any')}
                className="px-3 py-1.5 text-xs border border-white/20 hover:border-white/40 transition-colors"
              >
                {matchMode.toUpperCase()}
              </button>
            )}

            {selectedTags.length > 0 && (
              <button
                onClick={handleClearTags}
                className="px-3 py-1.5 text-xs text-white/40 hover:text-white transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {loading && uploads.length === 0 ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-3 border-b border-white/5">
                <div className="w-16 h-16 bg-white/5 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-white/5 w-3/4" />
                  <div className="h-3 bg-white/5 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-white/60 mb-4">{error}</p>
            <button
              onClick={() => fetchUploads()}
              className="px-4 py-2 text-sm border border-white/20 hover:border-white/40 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : uploads.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-white/60">No uploads match these tags</p>
          </div>
        ) : (
          <>
            <div className="space-y-0">
              {uploads.map((upload, index) => (
                <div
                  key={`${upload.source}-${upload.id}-${index}`}
                  className="py-3 sm:py-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors group"
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <button
                      onClick={() => handlePlay(upload)}
                      className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors"
                      title="Play"
                    >
                      <Play className="w-3 h-3 sm:w-4 sm:h-4 text-white fill-white" />
                    </button>

                    {upload.artworkUrl && (
                      <img
                        src={upload.artworkUrl}
                        alt={upload.displayTitle}
                        className="w-10 h-10 sm:w-12 sm:h-12 object-cover flex-shrink-0"
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm sm:text-base font-light truncate">
                        {upload.displayTitle}
                      </h3>
                    </div>

                    {upload.url && (
                      <a
                        href={upload.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 p-1.5 text-white/40 hover:text-white transition-colors"
                        title={upload.source === 'mixcloud' ? 'Open on Mixcloud' : 'Open archive link'}
                      >
                        <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                      </a>
                    )}
                  </div>

                  {upload.tags && upload.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 ml-[52px] sm:ml-[64px]">
                      {upload.tags.slice(0, 3).map(tag => (
                        <span
                          key={tag.name}
                          className="text-[10px] px-1.5 py-0.5 border border-white/10 text-white/60"
                        >
                          {tag.name}
                        </span>
                      ))}
                      {upload.tags.length > 3 && (
                        <span className="text-[10px] text-white/40">
                          +{upload.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {nextCursor && (
              <div className="mt-8 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-6 py-2.5 text-sm border border-white/20 hover:border-white/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
