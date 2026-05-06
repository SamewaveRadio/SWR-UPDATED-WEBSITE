import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Instagram, ExternalLink, User, Music, Play } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Resident, MixcloudPlaylistItem } from '../types';
import { convertGoogleDriveUrl } from '../lib/imageUtils';
import { usePlayer } from '../contexts/PlayerContext';
import { Navigation } from '../components/Navigation';
import { useMixcloudPlaylist } from '../hooks/useMixcloudPlaylist';

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

type ResidentUpload =
  | {
      source: 'r2';
      id: string;
      title: string;
      displayTitle: string;
      sortTime: number;
      hostName: string;
      artworkUrl?: string;
      externalUrl?: string;
      tags: string[];
      item: R2ArchiveItem;
    }
  | {
      source: 'mixcloud';
      id: string;
      title: string;
      displayTitle: string;
      sortTime: number;
      hostName?: string;
      artworkUrl?: string;
      externalUrl?: string;
      tags: string[];
      item: MixcloudPlaylistItem;
    };

const R2_CUTOFF_DATE = '2025-02-01';
const R2_CUTOFF_TIME = new Date(`${R2_CUTOFF_DATE}T00:00:00`).getTime();

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

function getLocalDateSortTime(value?: string | null): number {
  if (!value) return 0;
  const dateOnly = value.slice(0, 10);
  const match = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
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

function mapR2Upload(item: R2ArchiveItem): ResidentUpload {
  return {
    source: 'r2',
    id: item.id,
    title: item.title,
    displayTitle: getArchiveDisplayTitle(item),
    sortTime: getLocalDateSortTime(item.aired_date || item.aired_at),
    hostName: getHostName(item),
    artworkUrl: item.artwork_url || undefined,
    externalUrl: item.mixcloud_url || undefined,
    tags: item.tags || [],
    item,
  };
}

function mapMixcloudUpload(item: MixcloudPlaylistItem): ResidentUpload {
  const parsed = new Date(item.created_time).getTime();
  return {
    source: 'mixcloud',
    id: item.url,
    title: item.name,
    displayTitle: item.name,
    sortTime: Number.isNaN(parsed) ? 0 : parsed,
    artworkUrl: item.pictures?.extra_large,
    externalUrl: item.url,
    tags: (item.tags || []).map((tag) => tag.name),
    item,
  };
}

export function ResidentProfile() {
  const { slug } = useParams<{ slug: string }>();
  const [resident, setResident] = useState<Resident | null>(null);
  const [loading, setLoading] = useState(true);
  const [r2Uploads, setR2Uploads] = useState<R2ArchiveItem[]>([]);
  const [latestLoading, setLatestLoading] = useState(false);
  const [latestError, setLatestError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const player = usePlayer();

  const isPlaylistUrl = resident?.mixcloud_url?.includes('/playlists/');
  const legacyPlaylistUrl = isPlaylistUrl ? resident?.mixcloud_url : null;
  const {
    items: mixcloudItems,
    loading: mixcloudLoading,
    error: mixcloudError,
  } = useMixcloudPlaylist(legacyPlaylistUrl, 50);

  const latestUploads = useMemo(() => {
    const mappedR2 = r2Uploads
      .filter((item) => getLocalDateSortTime(item.aired_date || item.aired_at) >= R2_CUTOFF_TIME)
      .map(mapR2Upload);

    const mappedMixcloud = mixcloudItems
      .filter((item) => {
        const created = new Date(item.created_time).getTime();
        return !Number.isNaN(created) && created < R2_CUTOFF_TIME;
      })
      .map(mapMixcloudUpload);

    return [...mappedR2, ...mappedMixcloud]
      .sort((a, b) => b.sortTime - a.sortTime)
      .slice(0, 6);
  }, [r2Uploads, mixcloudItems]);

  const uploadsLoading = latestLoading || mixcloudLoading;
  const uploadsError = latestError || (mixcloudError ? 'Unable to load legacy Mixcloud uploads' : null);

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
        .limit(12);
      if (error) throw error;
      setR2Uploads((data || []) as R2ArchiveItem[]);
    } catch (error) {
      console.error('Error fetching resident latest uploads:', error);
      setLatestError('Unable to load latest uploads');
    } finally {
      setLatestLoading(false);
    }
  };

  const handlePlayUpload = (upload: ResidentUpload) => {
    if (upload.source === 'r2') {
      player.playArchive({
        source: 'r2',
        audioUrl: upload.item.audio_url || undefined,
        title: upload.displayTitle,
        residentName: upload.hostName,
        artworkUrl: upload.artworkUrl,
        durationSeconds: upload.item.duration_seconds || undefined,
      });
      return;
    }

    player.playArchive({
      source: 'mixcloud',
      url: upload.item.url,
      title: upload.displayTitle,
      artworkUrl: upload.artworkUrl,
      createdTime: upload.item.created_time,
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
          {uploadsLoading && (
            <div className="py-6 sm:py-8 text-center">
              <div className="inline-block w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            </div>
          )}
          {uploadsError && (
            <div className="space-y-4">
              <p className="text-white/40 text-sm">{uploadsError}</p>
              <button onClick={() => fetchLatestUploads(resident.id)} className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-white/5 border border-white/10 text-white text-[10px] sm:text-xs tracking-wide hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded">
                RETRY
              </button>
            </div>
          )}
          {!uploadsLoading && !uploadsError && latestUploads.length === 0 && (
            <p className="text-white/40 text-sm py-6 sm:py-8 text-center">No uploads yet</p>
          )}
          {!uploadsLoading && !uploadsError && latestUploads.length > 0 && (
            <div className="space-y-px">
              {latestUploads.map((upload) => (
                <div key={`${upload.source}-${upload.id}`} className="py-3 sm:py-4 px-3 sm:px-4 bg-white/5 hover:bg-white/10 transition-colors group">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <button onClick={() => handlePlayUpload(upload)} className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors rounded-sm" title="Play">
                      <Play className="w-3 h-3 sm:w-4 sm:h-4 text-white fill-white" />
                    </button>
                    {upload.artworkUrl && (
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 rounded-sm flex-shrink-0 overflow-hidden">
                        <img src={upload.artworkUrl} alt={upload.displayTitle} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white text-xs sm:text-sm font-medium truncate">{upload.displayTitle}</h3>
                    </div>
                    {upload.externalUrl && (
                      <a href={upload.externalUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 p-1.5 text-white/40 hover:text-white transition-colors" title={upload.source === 'mixcloud' ? 'Open on Mixcloud' : 'Open external archive link'}>
                        <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                      </a>
                    )}
                  </div>
                  {upload.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 ml-[52px] sm:ml-[64px]">
                      {upload.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="inline-block px-2 py-0.5 text-[10px] sm:text-xs text-white/60 border border-white/10 rounded">{tag}</span>
                      ))}
                      {upload.tags.length > 3 && (
                        <span className="inline-block px-2 py-0.5 text-[10px] sm:text-xs text-white/40">+{upload.tags.length - 3}</span>
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
