import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, X } from 'lucide-react';
import { useAzuraCast } from '../hooks/useAzuraCast';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';

const CONFIGURED_STREAM_URL = import.meta.env.VITE_AZURACAST_STREAM_URL as string | undefined;

export function AudioPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { nowPlaying, isLoading } = useAzuraCast();
  const { isPlayerVisible, closePlayer } = useAudioPlayer();

  const candidateListenUrl = nowPlaying?.listenUrl;
  const streamUrl =
    CONFIGURED_STREAM_URL ||
    (candidateListenUrl?.startsWith('https://') ? candidateListenUrl : null);

  useEffect(() => {
    const audio = new Audio();
    audio.volume = volume;
    audio.preload = 'none';
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    if (audioRef.current && !isPlaying && streamUrl) {
      audioRef.current.src = streamUrl;
    }
  }, [streamUrl, isPlaying]);

  useEffect(() => {
    if (isPlayerVisible && audioRef.current) {
      if (!streamUrl) {
        console.error('[AudioPlayer] No HTTPS stream URL. Set VITE_AZURACAST_STREAM_URL.');
        return;
      }
      if (!isPlaying) {
        audioRef.current.src = streamUrl;
        audioRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch((error) => {
          console.error('Error playing radio:', error);
        });
      }
    }
  }, [isPlayerVisible, streamUrl]);

  const togglePlay = async () => {
    if (!audioRef.current) return;

    try {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        if (!streamUrl) {
          console.error('[AudioPlayer] No HTTPS stream URL. Set VITE_AZURACAST_STREAM_URL.');
          return;
        }
        audioRef.current.src = streamUrl;
        await audioRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error toggling playback:', error);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const handleClose = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    closePlayer();
  };

  if (!isPlayerVisible) {
    return null;
  }

  const track = nowPlaying?.track;
  const isLive = nowPlaying?.isLive ?? false;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-black border-t border-white/10 z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-2 sm:py-3">
        <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
          <button
            onClick={togglePlay}
            className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-white text-black hover:bg-white/90 transition-colors rounded"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 sm:w-5 sm:h-5" />
            ) : (
              <Play className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="space-y-1">
                <div className="h-3 sm:h-4 bg-white/10 rounded w-24 sm:w-32 animate-pulse" />
                <div className="h-2 sm:h-3 bg-white/10 rounded w-20 sm:w-24 animate-pulse" />
              </div>
            ) : (
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {isLive && (
                    <span className="flex-shrink-0 px-1 sm:px-1.5 py-0.5 text-[9px] sm:text-[10px] bg-red-500 text-white rounded">
                      LIVE
                    </span>
                  )}
                  <p className="text-xs sm:text-sm text-white font-medium truncate">
                    {track?.title || nowPlaying?.stationName || 'Samewave Radio'}
                  </p>
                </div>
                {track?.artist && (
                  <p className="text-[10px] sm:text-xs text-white/60 truncate">
                    {track.artist}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="text-white/60 hover:text-white transition-colors"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-20 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
            />
          </div>

          <button
            onClick={handleClose}
            className="flex-shrink-0 text-white/40 hover:text-white transition-colors"
            aria-label="Close player"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
