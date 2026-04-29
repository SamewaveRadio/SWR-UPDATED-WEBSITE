import { useState, useEffect, useRef } from 'react';
import { Play, ExternalLink, X } from 'lucide-react';
import { usePlayer } from '../contexts/PlayerContext';
import { Navigation } from '../components/Navigation';

interface MixcloudTag {
  name: string;
  url: string;
}

interface MixcloudUpload {
  name: string;
  url: string;
  created_time: string;
  pictures: {
    extra_large: string;
  };
  tags: MixcloudTag[];
}

interface ExploreResponse {
  items: MixcloudUpload[];
  nextCursor: string | null;
}

export default function ExplorePage() {
  const player = usePlayer();
  const [uploads, setUploads] = useState<MixcloudUpload[]>([]);
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
        const response = await fetch(`${apiUrl}/functions/v1/mixcloud-catalogue-tags`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          setAvailableTags(data.tags || []);
        }
      } catch (err) {
        console.error('Failed to fetch tags:', err);
      } finally {
        setLoadingTags(false);
      }
    };
    fetchTags();
  }, []);

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

  const fetchUploads = async (offset: number = 0, append: boolean = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      const params = new URLSearchParams();
      params.set('limit', '24');
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
        throw new Error('Failed to fetch uploads');
      }

      const data: ExploreResponse = await response.json();

      if (append) {
        setUploads(prev => [...prev, ...data.items]);
      } else {
        setUploads(data.items);
      }
      setNextCursor(data.nextCursor);
    } catch (err) {
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

  const handlePlay = (upload: MixcloudUpload) => {
    player.playArchive({
      url: upload.url,
      title: upload.name,
      artworkUrl: upload.pictures.extra_large,
      createdTime: upload.created_time,
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
                  key={`${upload.url}-${index}`}
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

                    <img
                      src={upload.pictures.extra_large}
                      alt={upload.name}
                      className="w-10 h-10 sm:w-12 sm:h-12 object-cover flex-shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm sm:text-base font-light truncate">
                        {upload.name}
                      </h3>
                    </div>

                    <a
                      href={upload.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 p-1.5 text-white/40 hover:text-white transition-colors"
                      title="Open on Mixcloud"
                    >
                      <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                    </a>
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
