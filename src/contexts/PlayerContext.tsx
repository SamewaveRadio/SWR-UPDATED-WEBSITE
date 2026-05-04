import { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { useAzuraCast } from '../hooks/useAzuraCast';

declare global {
  interface Window {
    Mixcloud: {
      PlayerWidget: (iframe: HTMLIFrameElement) => MixcloudWidget;
    };
  }
}

// Production playback requires an HTTPS stream URL from an AzuraCast domain with SSL, e.g.:
// https://radio.samewave-radio.com/listen/samewave_radio/radio.mp3
// Set VITE_AZURACAST_STREAM_URL in your environment to configure this.
const CONFIGURED_STREAM_URL = import.meta.env.VITE_AZURACAST_STREAM_URL as string | undefined;

interface MixcloudWidget {
  ready: Promise<void>;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  getPosition: (callback: (position: number) => void) => void;
  getDuration: (callback: (duration: number) => void) => void;
  events: {
    play: {
      on: (callback: () => void) => void;
      off: (callback: () => void) => void;
    };
    pause: {
      on: (callback: () => void) => void;
      off: (callback: () => void) => void;
    };
    ended: {
      on: (callback: () => void) => void;
      off: (callback: () => void) => void;
    };
  };
}

export type ArchiveSource = 'mixcloud' | 'r2';

export interface ArchiveShow {
  source: ArchiveSource;
  url?: string;
  audioUrl?: string;
  title: string;
  residentName?: string;
  artworkUrl?: string;
  createdTime?: string;
  durationSeconds?: number;
}

type PlayerMode = 'live' | 'archive';
type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

interface PlayerState {
  mode: PlayerMode;
  status: PlayerStatus;
  volume: number;
  liveNowPlaying: {
    title: string;
    artist?: string;
  } | null;
  liveStreamUrl: string | null;
  archiveNowPlaying: ArchiveShow | null;
  archivePosition: number;
  archiveDuration: number;
  archiveNeedsGesture: boolean;
}

interface PlayerContextValue extends PlayerState {
  playLive: () => void;
  pauseLive: () => void;
  toggleLive: () => void;
  playArchive: (show: ArchiveShow) => void;
  pauseArchive: () => void;
  closeArchive: () => void;
  toggleArchive: () => void;
  setVolume: (volume: number) => void;
  switchToLive: () => void;
  switchToArchive: () => void;
  getArchiveIframeRef: () => HTMLIFrameElement | null;
  setArchiveIframeRef: (iframe: HTMLIFrameElement | null) => void;
}

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlayerState>({
    mode: 'live',
    status: 'idle',
    volume: 0.7,
    liveNowPlaying: null,
    liveStreamUrl: CONFIGURED_STREAM_URL || null,
    archiveNowPlaying: null,
    archivePosition: 0,
    archiveDuration: 0,
    archiveNeedsGesture: false,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const widgetRef = useRef<MixcloudWidget | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const loadingTimeoutRef = useRef<number | null>(null);

  const { nowPlaying } = useAzuraCast();

  useEffect(() => {
    const candidateUrl = nowPlaying?.listenUrl;
    const safeListenUrl =
      candidateUrl && candidateUrl.startsWith('https://') ? candidateUrl : null;

    setState((prev) => ({
      ...prev,
      liveStreamUrl: CONFIGURED_STREAM_URL || safeListenUrl || prev.liveStreamUrl,
      liveNowPlaying: nowPlaying?.track
        ? {
            title: nowPlaying.track.title,
            artist: nowPlaying.track.artist,
          }
        : prev.liveNowPlaying,
    }));
  }, [nowPlaying]);

  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = 'none';
      audio.volume = state.volume;
      audioRef.current = audio;

      audio.addEventListener('playing', () => {
        setState((prev) => ({ ...prev, status: 'playing', archiveNeedsGesture: false }));
      });

      audio.addEventListener('pause', () => {
        setState((prev) => ({ ...prev, status: prev.status === 'idle' ? 'idle' : 'paused' }));
      });

      audio.addEventListener('waiting', () => {
        setState((prev) => ({ ...prev, status: 'loading' }));
      });

      audio.addEventListener('timeupdate', () => {
        setState((prev) => {
          if (prev.mode !== 'archive' || prev.archiveNowPlaying?.source !== 'r2' || !audioRef.current) {
            return prev;
          }

          return {
            ...prev,
            archivePosition: audioRef.current.currentTime || 0,
            archiveDuration:
              audioRef.current.duration && Number.isFinite(audioRef.current.duration)
                ? audioRef.current.duration
                : prev.archiveNowPlaying.durationSeconds || prev.archiveDuration,
          };
        });
      });

      audio.addEventListener('loadedmetadata', () => {
        setState((prev) => {
          if (prev.mode !== 'archive' || prev.archiveNowPlaying?.source !== 'r2' || !audioRef.current) {
            return prev;
          }

          return {
            ...prev,
            archiveDuration:
              audioRef.current.duration && Number.isFinite(audioRef.current.duration)
                ? audioRef.current.duration
                : prev.archiveNowPlaying.durationSeconds || prev.archiveDuration,
          };
        });
      });

      audio.addEventListener('ended', () => {
        setState((prev) => ({ ...prev, status: 'paused' }));
      });

      audio.addEventListener('error', () => {
        console.error('Audio playback error');
        setState((prev) => ({ ...prev, status: 'error' }));
      });
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = state.volume;
    }
  }, [state.volume]);

  const stopProgressPolling = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  };

  const stopNativeAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current.load();
    }
  };

  const stopMixcloudPlayback = () => {
    try {
      widgetRef.current?.pause();
    } catch (error) {
      console.warn('Failed to pause Mixcloud widget:', error);
    }

    stopProgressPolling();
    widgetRef.current = null;

    if (iframeRef.current) {
      iframeRef.current.src = 'about:blank';
      iframeRef.current = null;
    }
  };

  const stopArchivePlayback = () => {
    stopMixcloudPlayback();
    stopNativeAudio();
  };

  const initializeMixcloudWidget = async () => {
    if (!iframeRef.current || !window.Mixcloud) {
      console.error('Mixcloud widget not available');
      return false;
    }

    try {
      const widget = window.Mixcloud.PlayerWidget(iframeRef.current);
      widgetRef.current = widget;

      await widget.ready;

      widget.events.play.on(() => {
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
          loadingTimeoutRef.current = null;
        }
        setState((prev) => ({
          ...prev,
          status: prev.mode === 'archive' ? 'playing' : prev.status,
          archiveNeedsGesture: false,
        }));
        startProgressPolling();
      });

      widget.events.pause.on(() => {
        setState((prev) => ({
          ...prev,
          status: prev.mode === 'archive' ? 'paused' : prev.status,
        }));
        stopProgressPolling();
      });

      widget.events.ended.on(() => {
        setState((prev) => ({ ...prev, status: 'idle' }));
        stopProgressPolling();
      });

      return true;
    } catch (error) {
      console.error('Failed to initialize Mixcloud widget:', error);
      return false;
    }
  };

  const startProgressPolling = () => {
    stopProgressPolling();
    progressIntervalRef.current = window.setInterval(() => {
      if (widgetRef.current) {
        widgetRef.current.getPosition((position) => {
          setState((prev) => ({ ...prev, archivePosition: position }));
        });
        widgetRef.current.getDuration((duration) => {
          setState((prev) => ({ ...prev, archiveDuration: duration }));
        });
      }
    }, 1000);
  };

  const playLive = () => {
    const streamUrl = state.liveStreamUrl;
    if (!streamUrl) {
      console.error(
        '[PlayerContext] No HTTPS stream URL configured. Set VITE_AZURACAST_STREAM_URL to an HTTPS AzuraCast stream URL.'
      );
      stopArchivePlayback();
      setState((prev) => ({
        ...prev,
        mode: 'live',
        status: 'error',
        archiveNowPlaying: null,
        archivePosition: 0,
        archiveDuration: 0,
        archiveNeedsGesture: false,
      }));
      return;
    }

    stopArchivePlayback();

    if (audioRef.current) {
      setState((prev) => ({
        ...prev,
        mode: 'live',
        status: 'loading',
        archiveNowPlaying: null,
        archivePosition: 0,
        archiveDuration: 0,
        archiveNeedsGesture: false,
      }));
      audioRef.current.src = streamUrl;
      audioRef.current.load();
      audioRef.current.play().catch((error) => {
        console.error('Failed to play live stream:', error);
        setState((prev) => ({ ...prev, status: 'error' }));
      });
    }
  };

  const pauseLive = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setState((prev) => ({
        ...prev,
        status: prev.mode === 'live' ? 'paused' : prev.status,
      }));
    }
  };

  const toggleLive = () => {
    if (state.mode === 'live') {
      if (state.status === 'playing') {
        pauseLive();
      } else {
        playLive();
      }
    } else {
      switchToLive();
    }
  };

  const playR2Archive = (show: ArchiveShow) => {
    if (!show.audioUrl || !audioRef.current) {
      setState((prev) => ({ ...prev, status: 'error', archiveNeedsGesture: false }));
      return;
    }

    setState((prev) => ({
      ...prev,
      mode: 'archive',
      status: 'loading',
      archiveNowPlaying: show,
      archivePosition: 0,
      archiveDuration: show.durationSeconds || 0,
      archiveNeedsGesture: false,
    }));

    audioRef.current.src = show.audioUrl;
    audioRef.current.load();
    audioRef.current.play().catch((error) => {
      console.warn('R2 archive autoplay failed - user gesture required:', error);
      setState((prev) => ({
        ...prev,
        status: 'paused',
        archiveNeedsGesture: true,
      }));
    });
  };

  const playMixcloudArchive = async (show: ArchiveShow) => {
    setState((prev) => ({
      ...prev,
      mode: 'archive',
      status: 'loading',
      archiveNowPlaying: show,
      archivePosition: 0,
      archiveDuration: 0,
      archiveNeedsGesture: false,
    }));

    loadingTimeoutRef.current = window.setTimeout(() => {
      console.warn('Archive playback timed out - may need user gesture');
      setState((prev) => ({
        ...prev,
        status: 'paused',
        archiveNeedsGesture: true,
      }));
    }, 10000);

    setTimeout(async () => {
      if (!iframeRef.current) {
        console.warn('Iframe not ready yet, waiting...');
        return;
      }

      const success = await initializeMixcloudWidget();
      const widget = widgetRef.current as MixcloudWidget | null;

      if (success && widget) {
        try {
          await widget.play();
        } catch (error) {
          console.warn('Autoplay failed - user gesture required:', error);
          setState((prev) => ({
            ...prev,
            status: 'paused',
            archiveNeedsGesture: true,
          }));
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }
        }
      }
    }, 1500);
  };

  const playArchive = (show: ArchiveShow) => {
    stopArchivePlayback();

    if (show.source === 'r2') {
      playR2Archive(show);
      return;
    }

    playMixcloudArchive(show);
  };

  const pauseArchive = () => {
    if (state.archiveNowPlaying?.source === 'r2') {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      return;
    }

    if (widgetRef.current) {
      widgetRef.current.pause();
    }
  };

  const closeArchive = () => {
    stopArchivePlayback();
    setState((prev) => ({
      ...prev,
      status: 'idle',
      archiveNowPlaying: null,
      archivePosition: 0,
      archiveDuration: 0,
      archiveNeedsGesture: false,
    }));
  };

  const toggleArchive = () => {
    if (state.mode !== 'archive') return;

    if (state.archiveNowPlaying?.source === 'r2') {
      if (!audioRef.current) return;

      if (audioRef.current.paused) {
        audioRef.current.play().catch((error) => {
          console.warn('Failed to play R2 archive:', error);
          setState((prev) => ({ ...prev, status: 'error' }));
        });
      } else {
        audioRef.current.pause();
      }
      return;
    }

    if (state.status === 'playing') {
      pauseArchive();
    } else if (widgetRef.current) {
      setState((prev) => ({ ...prev, archiveNeedsGesture: false }));
      widgetRef.current.play();
    }
  };

  const setVolume = (volume: number) => {
    setState((prev) => ({ ...prev, volume }));
  };

  const switchToLive = () => {
    playLive();
  };

  const switchToArchive = () => {
    stopNativeAudio();
    setState((prev) => ({
      ...prev,
      mode: 'archive',
      status: prev.archiveNowPlaying ? prev.status : 'idle',
    }));
  };

  const getArchiveIframeRef = () => iframeRef.current;

  const setArchiveIframeRef = (iframe: HTMLIFrameElement | null) => {
    iframeRef.current = iframe;
  };

  const value: PlayerContextValue = {
    ...state,
    playLive,
    pauseLive,
    toggleLive,
    playArchive,
    pauseArchive,
    closeArchive,
    toggleArchive,
    setVolume,
    switchToLive,
    switchToArchive,
    getArchiveIframeRef,
    setArchiveIframeRef,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
}
