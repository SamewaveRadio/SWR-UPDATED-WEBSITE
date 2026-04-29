import { useEffect, useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { usePlayer } from '../contexts/PlayerContext';

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

export function Archive() {
  const [uploads, setUploads] = useState<MixcloudUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const player = usePlayer();

  useEffect(() => {
    fetchLatestUploads();
  }, []);

  const fetchLatestUploads = async () => {
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mixcloud-latest?username=samewaveradio&limit=5`;
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.items) {
          setUploads(data.items);
        }
      }
    } catch (error) {
      console.error('Error fetching Mixcloud uploads:', error);
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
            Listen to past broadcasts and resident mixes on our Mixcloud archive.
          </p>

          <div className="pt-6 sm:pt-8 space-y-3 sm:space-y-4">
            <h3 className="text-white/80 text-xs sm:text-sm tracking-wide">LATEST UPLOADS</h3>
            {loading ? (
              <div className="py-6 sm:py-8 text-center text-white/40 text-sm">Loading latest uploads...</div>
            ) : uploads.length > 0 ? (
              <div className="space-y-px">
                {uploads.map((upload, index) => (
                  <div
                    key={`${upload.url}-${index}`}
                    className="w-full py-3 sm:py-4 px-3 sm:px-4 bg-white/5 hover:bg-white/10 transition-colors group"
                  >
                    <div className="flex items-center gap-3 sm:gap-4">
                      <button
                        onClick={() => {
                          player.playArchive({
                            url: upload.url,
                            title: upload.name,
                            artworkUrl: upload.pictures.extra_large,
                            createdTime: upload.created_time,
                          });
                        }}
                        className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors rounded-sm"
                        title="Play"
                      >
                        <Play className="w-3 h-3 sm:w-4 sm:h-4 text-white fill-white" />
                      </button>
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 rounded-sm flex-shrink-0 overflow-hidden">
                        <img
                          src={upload.pictures.extra_large}
                          alt={upload.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-white text-xs sm:text-sm font-medium truncate">{upload.name}</p>
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
                        {upload.tags.slice(0, 3).map((tag, tagIndex) => (
                          <span
                            key={tagIndex}
                            className="inline-block px-2 py-0.5 text-[10px] sm:text-xs text-white/60 border border-white/10 rounded"
                          >
                            {tag.name}
                          </span>
                        ))}
                        {upload.tags.length > 3 && (
                          <span className="inline-block px-2 py-0.5 text-[10px] sm:text-xs text-white/40">
                            +{upload.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 sm:py-8 text-center text-white/40 text-sm">No uploads found</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
