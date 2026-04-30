import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAzuraCast } from '../hooks/useAzuraCast';
import { usePlayer } from '../contexts/PlayerContext';

interface LiveScheduleEntry {
  id: string;
  show?: {
    title?: string;
    resident?: {
      name?: string;
    };
  } | null;
}

export function LiveModule() {
  const [liveShow, setLiveShow] = useState<LiveScheduleEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const { nowPlaying, isLoading: radioLoading, error: radioError } = useAzuraCast();
  const player = usePlayer();

  useEffect(() => {
    fetchLiveAndNext();
  }, []);

  const fetchLiveAndNext = async () => {
    try {
      const { data: liveData } = await supabase
        .from('schedule')
        .select(`
          *,
          show:shows(
            *,
            resident:residents(*)
          )
        `)
        .eq('is_live', true)
        .maybeSingle();

      setLiveShow(liveData);
    } catch (error) {
      console.error('Error fetching live shows:', error);
    } finally {
      setLoading(false);
    }
  };

  const isLive = nowPlaying?.isLive ?? false;
  const track = nowPlaying?.track;
  const dj = nowPlaying?.dj;
  // artworkUrl is already a proxied /api/azuracast/art?url=... URL from the server
  const artworkUrl = track?.artworkUrl ?? null;

  if (loading || radioLoading) {
    return (
      <section id="live" className="relative pt-24 sm:pt-32 pb-16 sm:pb-24 min-h-[500px] sm:min-h-[600px] border-b border-white/10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 h-full min-h-[400px] sm:min-h-[550px] flex items-end">
          <div className="pb-4 w-full">
            <div className="animate-pulse text-white/40 text-sm">Loading...</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="live" className="relative pt-24 sm:pt-32 pb-16 sm:pb-24 min-h-[500px] sm:min-h-[600px] border-b border-white/10 overflow-hidden">
      {artworkUrl && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center transition-opacity duration-700"
            style={{ backgroundImage: `url(${artworkUrl})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/70 to-black" />
        </>
      )}

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 h-full min-h-[400px] sm:min-h-[550px] flex items-end">
        <div className="space-y-6 sm:space-y-10 pb-4 w-full">
          <div className="flex items-center gap-2">
            {isLive ? (
              <>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs tracking-wider text-green-500 font-medium">ON AIR</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 bg-white/30 rounded-full" />
                <span className="text-xs tracking-wider text-white/40 font-medium">OFF AIR</span>
              </>
            )}
          </div>

          {radioError ? (
            <div className="space-y-3 sm:space-y-4">
              <div className="scroll-container">
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-light text-white">
                  <span className="scroll-text">
                    {liveShow?.show?.title || 'Samewave Radio'}
                    {'\u00A0\u00A0\u00A0\u00A0'}
                    {liveShow?.show?.title || 'Samewave Radio'}
                  </span>
                </h1>
              </div>
              {liveShow?.show?.resident && (
                <p className="text-base sm:text-lg md:text-xl text-white/70">
                  with {liveShow.show.resident.name}
                </p>
              )}
              <p className="text-xs sm:text-sm text-white/40">Station info unavailable</p>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              <div className="scroll-container">
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-light text-white">
                  <span className="scroll-text">
                    {track?.title || nowPlaying?.stationName || 'Samewave Radio'}
                    {'\u00A0\u00A0\u00A0\u00A0'}
                    {track?.title || nowPlaying?.stationName || 'Samewave Radio'}
                  </span>
                </h1>
              </div>
              <div className="space-y-1 sm:space-y-2">
                {track?.artist && (
                  <p className="text-base sm:text-lg md:text-xl text-white/70">{track.artist}</p>
                )}
                {(dj?.name || liveShow?.show?.resident?.name) && (
                  <p className="text-sm sm:text-base md:text-lg text-white/50">
                    with {dj?.name || liveShow?.show?.resident?.name}
                  </p>
                )}
                {!isLive && (
                  <p className="text-xs sm:text-sm text-white/40 mt-2">Last played</p>
                )}
              </div>
            </div>
          )}

          <button
            onClick={() => player.playLive()}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-black text-sm tracking-wide hover:bg-white/90 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20"
          >
            <Play className="w-4 h-4" />
            {isLive ? 'LISTEN LIVE' : 'TUNE IN'}
          </button>
        </div>
      </div>
    </section>
  );
}
