import { createContext, useContext, useState, useCallback } from 'react';

interface AudioPlayerContextType {
  isPlayerVisible: boolean;
  openPlayer: () => void;
  closePlayer: () => void;
  playRadio: () => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [isPlayerVisible, setIsPlayerVisible] = useState(false);

  const openPlayer = useCallback(() => {
    setIsPlayerVisible(true);
  }, []);

  const closePlayer = useCallback(() => {
    setIsPlayerVisible(false);
  }, []);

  const playRadio = useCallback(() => {
    setIsPlayerVisible(true);
  }, []);

  return (
    <AudioPlayerContext.Provider value={{
      isPlayerVisible,
      openPlayer,
      closePlayer,
      playRadio
    }}>
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (context === undefined) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
  }
  return context;
}
