import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { ResidentProfile } from './pages/ResidentProfile';
import { ShopPage } from './pages/ShopPage';
import { ProductPage } from './pages/ProductPage';
import ExplorePage from './pages/ExplorePage';
import AdminPage from './pages/AdminPage';
import { AudioPlayer } from './components/AudioPlayer';
import { AudioPlayerProvider } from './contexts/AudioPlayerContext';
import { CartProvider } from './contexts/CartContext';
import { PlayerProvider } from './contexts/PlayerContext';
import { FooterPlayer } from './components/FooterPlayer';
import { BreakpointIndicator } from './components/BreakpointIndicator';
import { SupportFloatingCTA } from './components/SupportFloatingCTA';
import { SupportModal } from './components/SupportModal';
import { useSupportPrompt } from './hooks/useSupportPrompt';

function App() {
  const { isOpen, openModal, handleDismiss, handleSupport } = useSupportPrompt();

  return (
    <BrowserRouter>
      <PlayerProvider>
        <AudioPlayerProvider>
          <CartProvider>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/archive" element={<ExplorePage />} />
              <Route path="/residents/:slug" element={<ResidentProfile />} />
              <Route path="/shop" element={<ShopPage />} />
              <Route path="/shop/:handle" element={<ProductPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Routes>
            <AudioPlayer />
            <FooterPlayer />
            <SupportFloatingCTA onClick={openModal} />
            <SupportModal
              isOpen={isOpen}
              onDismiss={handleDismiss}
              onSupport={handleSupport}
            />
            <BreakpointIndicator />
          </CartProvider>
        </AudioPlayerProvider>
      </PlayerProvider>
    </BrowserRouter>
  );
}

export default App;
