import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Instagram, ExternalLink, User, Music, Play } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Resident } from '../types';
import { convertGoogleDriveUrl } from '../lib/imageUtils';
import { usePlayer } from '../contexts/PlayerContext';
import { Navigation } from '../components/Navigation';

interface R2ArchiveItem {
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

function getHostName(item: R2ArchiveItem): string {
  return item.host_name || item.resident || '';
}

function getArchiveDisplayTitle(item: R2ArchiveItem): string {
  const hostName = getHostName(item);
  const airedDate = formatAiredDate(item.aired_date || item.aired_at);
  if (airedDate) return `${item.title} with ${hostName} (Aired ${airedDate})`;
  return hostName ? `${item.title} with ${hostName}` : item.title;
}

export function ResidentProfile() {
  const { slug } = useParams<{ slug: string }>();
  const [resident, setResident] = useState<Resident | null>(null);
  const [loading, setLoading] = useState(true);
  const [latestUploads, setLatestUploads] = useState<R2ArchiveItem[]>([]);
  const [latestLoading, setLatestLoading] = useState(false);
  const [latestError, setLatestError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const player = usePlayer();

  const isPlaylistUrl = resident?.mixcloud_url?.includes('/playlists/');

  useEffect(() => {
    if (slug) fetchResident();
  }, [slug]);

  useEffect(() => {
    if (resident) {
      document.title = `${resident.name} — Samewave Radio`;
      fetchLatestUploads(resident.id);
    }
    return () => {
      document.title = 'Samewave Radio';
    };
  }, [resident]);

  const fetchResident = async () => {
    try {
      setImageFailed(false);
      const { data: residentData } = await supabase
        .from('residents')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      if (residentData) setResident(residentData);
    } catch (error) {
      console.error('Error fetching resident:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLatestUploads = async (residentId: string) => {
    try {
      setLatestLoading(true);
      setLatestError(null);
      const { data, error } = await supabase
        .from('archive_items')
        .select('id,title,host_name,resident,tags,audio_url,artwork_url,mixcloud_url,aired_at,aired_date,duration_seconds')
        .eq('resident_id', residentId)
        .eq('is_published', true)
        .eq('processing_status', 'processed')
        .not('audio_url', 'is', null)
        .order('aired_at', { ascending: false, nullsFirst: false })
        .limit(6);
      if (error) throw error;
      setLatestUploads((data || []) as R2ArchiveItem[]);
    } catch (error) {
      console.error('Error fetching resident latest uploads:', error);
      setLatestError('Unable to load latest uploads');
    } finally {
      setLatestLoading(false);
    }
  };

  const handlePlayArchive = (item: R2ArchiveItem) => {
    player.playArchive({
      source: 'r2',
      audioUrl: item.audio_url || undefined,
      title: getArchiveDisplayTitle(item),
      residentName: getHostName(item),
      artworkUrl: item.artwork_url || undefined,
      durationSeconds: item.duration_seconds || undefined,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse text-white/40 text-sm">Loading...</div>
      </div>
    );
  }

  if (!resident) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4">
        <h1 className="text-xl sm:text-2xl text-white mb-4">Resident not found</h1>
        <Link to="/" className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm">
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-32 sm:pb-36">
      <Navigation />
      <div className="pt-28 max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="grid sm:grid-cols-[140px,1fr] md:grid-cols-[200px,1fr] gap-6 sm:gap-8 mb-8 sm:mb-12">
          <div className="w-32 sm:w-full aspect-square bg-white/5 rounded-sm flex items-center justify-center overflow-hidden mx-auto sm:mx-0">
            {resident.image_url && !imageFailed ? (
              <img
                src={convertGoogleDriveUrl(resident.image_url)}
                alt={resident.name}
                className="w-full h-full object-cover"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <User className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 text-white/20" />
            )}
          </div>

          <div className="space-y-4 sm:space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-light text-white">{resident.name}</h1>
              {resident.show_title && (
                <div className="space-y-0.5 sm:space-y-1">
                  <p className="text-base sm:text-lg text-white/80">{resident.show_title}</p>
                  {resident.active && resident.schedule_text && (
                    <p className="text-xs sm:text-sm text-white/60">{resident.schedule_text}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              {resident.instagram_handle && (
                <a href={`https://instagram.com/${resident.instagram_handle}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-white/5 border border-white/10 text-white text-[10px] sm:text-xs tracking-wide hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded">
                  <Instagram className="w-3 h-3 sm:w-4 sm:h-4" />
                  INSTAGRAM
                </a>
              )}
              {resident.mixcloud_url && isPlaylistUrl && (
                <a href={resident.mixcloud_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-white/5 border border-white/10 text-white text-[10px] sm:text-xs tracking-wide hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded">
                  <Music className="w-3 h-3 sm:w-4 sm:h-4" />
                  ARCHIVE
                </a>
              )}
              {resident.mixcloud_url && !isPlaylistUrl && (
                <a href={resident.mixcloud_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-white/5 border border-white/10 text-white text-[10px] sm:text-xs tracking-wide hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded">
                  <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                  ARCHIVE
                </a>
              )}
            </div>
          </div>
        </div>

        {resident.bio && (
          <div className="mb-8 sm:mb-12">
            <h2 className="text-white text-base sm:text-lg font-light mb-3 sm:mb-4">Bio</h2>
            <div className="prose prose-invert prose-sm max-w-none">
              <p className="text-white/60 text-sm leading-relaxed whitespace-pre-line break-words">{resident.bio}</p>
            </div>
          </div>
        )}

        {resident.show_description && (
          <div className="mb-8 sm:mb-12">
            <h2 className="text-white text-base sm:text-lg font-light mb-3 sm:mb-4">About the Show</h2>
            <p className="text-white/60 text-sm leading-relaxed whitespace-pre-line break-words">{resident.show_description}</p>
          </div>
        )}

        <div className="mb-8 sm:mb-12">
          <h2 className="text-white text-base sm:text-lg font-light mb-4 sm:mb-6">Latest Uploads</h2>
          {latestLoading && (
            <div className="py-6 sm:py-8 text-center">
              <div className="inline-block w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            </div>
          )}
          {latestError && (
            <div className="space-y-4">
              <p className="text-white/40 text-sm">{latestError}</p>
              <button onClick={() => fetchLatestUploads(resident.id)} className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-white/5 border border-white/10 text-white text-[10px] sm:text-xs tracking-wide hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded">
                RETRY
              </button>
            </div>
          )}
          {!latestLoading && !latestError && latestUploads.length === 0 && (
            <p className="text-white/40 text-sm py-6 sm:py-8 text-center">No uploads yet</p>
          )}
          {!latestLoading && !latestError && latestUploads.length > 0 && (
            <div className="space-y-px">
              {latestUploads.map((item) => (
                <div key={item.id} className="py-3 sm:py-4 px-3 sm:px-4 bg-white/5 hover:bg-white/10 transition-colors group">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <button onClick={() => handlePlayArchive(item)} className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors rounded-sm" title="Play">
                      <Play className="w-3 h-3 sm:w-4 sm:h-4 text-white fill-white" />
                    </button>
                    {item.artwork_url && (
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 rounded-sm flex-shrink-0 overflow-hidden">
                        <img src={item.artwork_url} alt={getArchiveDisplayTitle(item)} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white text-xs sm:text-sm font-medium truncate">{getArchiveDisplayTitle(item)}</h3>
                    </div>
                    {item.mixcloud_url && (
                      <a href={item.mixcloud_url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 p-1.5 text-white/40 hover:text-white transition-colors" title="Open external archive link">
                        <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                      </a>
                    )}
                  </div>
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 ml-[52px] sm:ml-[64px]">
                      {item.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="inline-block px-2 py-0.5 text-[10px] sm:text-xs text-white/60 border border-white/10 rounded">{tag}</span>
                      ))}
                      {item.tags.length > 3 && (
                        <span className="inline-block px-2 py-0.5 text-[10px] sm:text-xs text-white/40">+{item.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
