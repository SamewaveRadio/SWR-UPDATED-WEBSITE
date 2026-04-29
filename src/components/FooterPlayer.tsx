import { usePlayer } from '../contexts/PlayerContext';
import { Play, Pause, Volume2, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { buildMixcloudWidgetSrc } from '../lib/mixcloudUtils';

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function FooterPlayer() {
  const player = usePlayer();
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const volumeRef = useRef<HTMLDivElement>(null);
  const iframeContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (volumeRef.current && !volumeRef.current.contains(event.target as Node)) {
        setShowVolumeSlider(false);
      }
    }

    if (showVolumeSlider) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showVolumeSlider]);

  useEffect(() => {
    if (player.mode === 'archive' && player.archiveNowPlaying && iframeContainerRef.current) {
      const existingIframe = iframeContainerRef.current.querySelector('iframe');
      if (existingIframe) {
        existingIframe.src = buildMixcloudWidgetSrc(player.archiveNowPlaying.url);
        player.setArchiveIframeRef(existingIframe);
        return;
      }

      const newIframe = document.createElement('iframe');
      newIframe.style.width = '100%';
      newIframe.style.height = '60px';
      newIframe.style.border = '0';
      newIframe.style.display = 'block';
      newIframe.style.pointerEvents = 'auto';
      newIframe.style.lineHeight = '0';
      newIframe.allow = 'autoplay';
      newIframe.src = buildMixcloudWidgetSrc(player.archiveNowPlaying.url);

      iframeContainerRef.current.appendChild(newIframe);
      player.setArchiveIframeRef(newIframe);
    }
  }, [player.mode, player.archiveNowPlaying]);

  if (player.status === 'idle') {
    return null;
  }

  const isLive = player.mode === 'live';
  const isArchive = player.mode === 'archive';
  const isPlaying = player.status === 'playing';
  const isLoading = player.status === 'loading';

  const currentTitle = isLive
    ? player.liveNowPlaying?.title || 'Live Stream'
    : player.archiveNowPlaying?.title || 'Archive';

  const currentArtist = isLive
    ? player.liveNowPlaying?.artist
    : player.archiveNowPlaying?.residentName;

  const progressPercent = isArchive && player.archiveDuration > 0
    ? (player.archivePosition / player.archiveDuration) * 100
    : 0;

  const handleTogglePlayback = () => {
    if (isLive) {
      player.toggleLive();
    } else {
      player.toggleArchive();
    }
  };

  const handleClose = () => {
    if (isLive) {
      player.pauseLive();
    } else {
      player.pauseArchive();
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-black border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
      {isArchive ? (
        <div className="flex flex-col">
          <div className="flex items-stretch h-[68px] sm:h-[60px]">
            <div
              ref={iframeContainerRef}
              className="flex-1 h-[68px] sm:h-[60px] bg-black relative leading-none"
            >
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
              )}
              {player.archiveNeedsGesture && !isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white/60 text-[10px] sm:text-xs px-4 text-center pointer-events-none">
                  Tap play in the player to start
                </div>
              )}
            </div>

            <div className="hidden sm:flex items-center border-l border-white/10 relative" ref={volumeRef}>
              <button
                onClick={() => setShowVolumeSlider(!showVolumeSlider)}
                className="h-full px-3 sm:px-4 text-white/60 hover:text-white transition-colors"
                title="Volume"
              >
                <Volume2 className="w-4 h-4" />
              </button>

              {showVolumeSlider && (
                <div className="absolute bottom-full right-0 mb-2 bg-black border border-white/10 p-3 shadow-xl">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={player.volume * 100}
                      onChange={(e) => player.setVolume(Number(e.target.value) / 100)}
                      className="w-20 sm:w-24 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0"
                    />
                    <span className="text-[10px] text-white/60 font-mono tabular-nums min-w-[2ch]">
                      {Math.round(player.volume * 100)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleClose}
              className="h-full px-3 sm:px-4 text-white/40 hover:text-white transition-colors border-l border-white/10"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-stretch h-[68px] sm:h-16">
          <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 flex-1 min-w-0">
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="text-white text-xs sm:text-sm font-medium truncate">
                {currentTitle}
              </div>
              {currentArtist && (
                <div className="text-white/60 text-[10px] sm:text-xs truncate">
                  {currentArtist}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center border-l border-white/10">
            <button
              onClick={handleTogglePlayback}
              disabled={isLoading}
              className="h-full px-4 sm:px-5 text-white hover:bg-white/5 transition-colors disabled:opacity-50"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isLoading ? (
                <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-4 h-4 sm:w-5 sm:h-5" />
              ) : (
                <Play className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </button>
          </div>

          <div className="hidden sm:flex items-center border-l border-white/10 relative" ref={volumeRef}>
            <button
              onClick={() => setShowVolumeSlider(!showVolumeSlider)}
              className="h-full px-3 sm:px-4 text-white/60 hover:text-white transition-colors"
              title="Volume"
            >
              <Volume2 className="w-4 h-4" />
            </button>

            {showVolumeSlider && (
              <div className="absolute bottom-full right-0 mb-2 bg-black border border-white/10 p-3 shadow-xl">
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={player.volume * 100}
                    onChange={(e) => player.setVolume(Number(e.target.value) / 100)}
                    className="w-20 sm:w-24 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0"
                  />
                  <span className="text-[10px] text-white/60 font-mono tabular-nums min-w-[2ch]">
                    {Math.round(player.volume * 100)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isArchive && player.archiveDuration > 0 && (
        <div className="h-0.5 bg-white/5 relative overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-white transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}
