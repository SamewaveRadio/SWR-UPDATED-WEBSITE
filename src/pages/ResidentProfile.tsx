import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Instagram, ExternalLink, User, Music, Play } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Resident } from '../types';
import { convertGoogleDriveUrl } from '../lib/imageUtils';
import { useMixcloudPlaylist } from '../hooks/useMixcloudPlaylist';
import { usePlayer } from '../contexts/PlayerContext';
import { Navigation } from '../components/Navigation';

export function ResidentProfile() {
  const { slug } = useParams<{ slug: string }>();
  const [resident, setResident] = useState<Resident | null>(null);
  const [loading, setLoading] = useState(true);
  const player = usePlayer();

  const isPlaylistUrl = resident?.mixcloud_url?.includes('/playlists/');
  const { items: playlistItems, loading: playlistLoading, error: playlistError } = useMixcloudPlaylist(
    isPlaylistUrl ? resident?.mixcloud_url : null,
    6
  );

  useEffect(() => {
    if (slug) {
      fetchResident();
    }
  }, [slug]);

  useEffect(() => {
    if (resident) {
      document.title = `${resident.name} — Samewave Radio`;
    }
    return () => {
      document.title = 'Samewave Radio';
    };
  }, [resident]);

  const fetchResident = async () => {
    try {
      const { data: residentData } = await supabase
        .from('residents')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (residentData) {
        setResident(residentData);
      }
    } catch (error) {
      console.error('Error fetching resident:', error);
    } finally {
      setLoading(false);
    }
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
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm"
        >
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
            {resident.image_url ? (
              <img
                src={convertGoogleDriveUrl(resident.image_url)}
                alt={resident.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const parent = e.currentTarget.parentElement;
                  if (parent && !parent.querySelector('svg')) {
                    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    icon.setAttribute('class', 'w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 text-white/20 lucide lucide-user');
                    icon.setAttribute('viewBox', '0 0 24 24');
                    icon.setAttribute('fill', 'none');
                    icon.setAttribute('stroke', 'currentColor');
                    icon.setAttribute('stroke-width', '2');
                    icon.setAttribute('stroke-linecap', 'round');
                    icon.setAttribute('stroke-linejoin', 'round');
                    icon.innerHTML = '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>';
                    parent.appendChild(icon);
                  }
                }}
              />
            ) : (
              <User className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 text-white/20" />
            )}
          </div>

          <div className="space-y-4 sm:space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-light text-white">
                {resident.name}
              </h1>
              {resident.show_title && (
                <div className="space-y-0.5 sm:space-y-1">
                  <p className="text-base sm:text-lg text-white/80">
                    {resident.show_title}
                  </p>
                  {resident.active && resident.schedule_text && (
                    <p className="text-xs sm:text-sm text-white/60">
                      {resident.schedule_text}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              {resident.instagram_handle && (
                <a
                  href={`https://instagram.com/${resident.instagram_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-white/5 border border-white/10 text-white text-[10px] sm:text-xs tracking-wide hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
                >
                  <Instagram className="w-3 h-3 sm:w-4 sm:h-4" />
                  INSTAGRAM
                </a>
              )}
              {resident.mixcloud_url && isPlaylistUrl && (
                <a
                  href={resident.mixcloud_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-white/5 border border-white/10 text-white text-[10px] sm:text-xs tracking-wide hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
                >
                  <Music className="w-3 h-3 sm:w-4 sm:h-4" />
                  ARCHIVE
                </a>
              )}
              {resident.mixcloud_url && !isPlaylistUrl && (
                <a
                  href={resident.mixcloud_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-white/5 border border-white/10 text-white text-[10px] sm:text-xs tracking-wide hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
                >
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
              <p className="text-white/60 text-sm leading-relaxed whitespace-pre-line break-words">
                {resident.bio}
              </p>
            </div>
          </div>
        )}

        {resident.show_description && (
          <div className="mb-8 sm:mb-12">
            <h2 className="text-white text-base sm:text-lg font-light mb-3 sm:mb-4">About the Show</h2>
            <p className="text-white/60 text-sm leading-relaxed whitespace-pre-line break-words">
              {resident.show_description}
            </p>
          </div>
        )}

        {isPlaylistUrl && (
          <div className="mb-8 sm:mb-12">
            <h2 className="text-white text-base sm:text-lg font-light mb-4 sm:mb-6">Latest Uploads</h2>

            {playlistLoading && (
              <div className="py-6 sm:py-8 text-center">
                <div className="inline-block w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              </div>
            )}

            {playlistError && (
              <div className="space-y-4">
                <p className="text-white/40 text-sm">Unable to load latest uploads</p>
                <a
                  href={resident.mixcloud_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-white/5 border border-white/10 text-white text-[10px] sm:text-xs tracking-wide hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
                >
                  <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                  VIEW ON MIXCLOUD
                </a>
              </div>
            )}

            {!playlistLoading && !playlistError && playlistItems.length === 0 && (
              <p className="text-white/40 text-sm py-6 sm:py-8 text-center">No uploads yet</p>
            )}

            {!playlistLoading && !playlistError && playlistItems.length > 0 && (
              <div className="space-y-px">
                {playlistItems.map((item, index) => (
                  <div
                    key={`${item.url}-${index}`}
                    className="py-3 sm:py-4 px-3 sm:px-4 bg-white/5 hover:bg-white/10 transition-colors group"
                  >
                    <div className="flex items-center gap-3 sm:gap-4">
                      <button
                        onClick={() => {
                          const urlPath = item.url.replace('https://www.mixcloud.com', '');
                          player.playArchive({
                            source: 'mixcloud',
                            url: urlPath,
                            title: item.name,
                            residentName: resident?.name,
                            artworkUrl: item.pictures?.extra_large,
                            createdTime: item.created_time,
                          });
                        }}
                        className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors rounded-sm"
                        title="Play"
                      >
                        <Play className="w-3 h-3 sm:w-4 sm:h-4 text-white fill-white" />
                      </button>
                      {item.pictures?.extra_large && (
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 rounded-sm flex-shrink-0 overflow-hidden">
                          <img
                            src={item.pictures.extra_large}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white text-xs sm:text-sm font-medium truncate">
                          {item.name}
                        </h3>
                      </div>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 p-1.5 text-white/40 hover:text-white transition-colors"
                        title="Open on Mixcloud"
                      >
                        <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                      </a>
                    </div>
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2 ml-[52px] sm:ml-[64px]">
                        {item.tags.slice(0, 3).map((tag, tagIndex) => (
                          <span
                            key={tagIndex}
                            className="inline-block px-2 py-0.5 text-[10px] sm:text-xs text-white/60 border border-white/10 rounded"
                          >
                            {tag.name}
                          </span>
                        ))}
                        {item.tags.length > 3 && (
                          <span className="inline-block px-2 py-0.5 text-[10px] sm:text-xs text-white/40">
                            +{item.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
