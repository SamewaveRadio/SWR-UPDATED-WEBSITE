import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ShoppingBag, ChevronDown, Download, Share } from 'lucide-react';
import { useCartContext } from '../contexts/CartContext';
import { CartDrawer } from './CartDrawer';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIOS(): boolean {
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as { MSStream?: unknown }).MSStream;
  } catch {
    return false;
  }
}

function isInStandaloneMode(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches;
    const isIOSStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    return isStandalone || isIOSStandalone;
  } catch {
    return false;
  }
}

export function Navigation() {
  const { totalQuantity } = useCartContext();
  const location = useLocation();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSubmitDropdownOpen, setIsSubmitDropdownOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    try {
      if (isIOS() && !isInStandaloneMode()) {
        setIsIOSDevice(true);
        try {
          const dismissed = localStorage.getItem('pwa-ios-prompt-dismissed');
          if (!dismissed) {
            setShowIOSPrompt(true);
          }
        } catch {
          setShowIOSPrompt(true);
        }
      }
    } catch {
      // Silently fail if detection doesn't work
    }
  }, []);

  const dismissIOSPrompt = () => {
    setShowIOSPrompt(false);
    try {
      localStorage.setItem('pwa-ios-prompt-dismissed', 'true');
    } catch {
      // Silently fail
    }
  };

  const handleInstallClick = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;

    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSubmitDropdownOpen(false);
      }
    };

    if (isSubmitDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSubmitDropdownOpen]);

  const scrollToSection = (id: string) => {
    setIsMobileMenuOpen(false);

    if (location.pathname !== '/') {
      window.location.href = `/#${id}`;
      return;
    }

    const element = document.getElementById(id);
    if (element) {
      const offset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  const submitLinks = [
    { label: 'Host a Show', url: 'https://forms.gle/LcJ1PEZyekyekgw4A' },
    { label: 'Become a Volunteer', url: 'https://forms.gle/uf8Zcx3p9jNyA1jUA' },
    { label: 'Mix Submission', url: 'https://forms.gle/BW1aTuUsKTXyEyaP9' },
    { label: 'Track Submission', url: 'https://forms.gle/M7LDEhBhCuhGdQH77' }
  ];

  const navLinks = [
    { id: 'live', label: 'LIVE', type: 'section' },
    { id: 'explore', label: 'ARCHIVE', type: 'route', path: '/archive' },
    { id: 'schedule', label: 'SCHEDULE', type: 'section' },
    { id: 'residents', label: 'RESIDENTS', type: 'section' },
    { id: 'shop', label: 'SHOP', type: 'section' },
    { id: 'support', label: 'SUPPORT', type: 'section' },
    { id: 'submit', label: 'SUBMIT', type: 'dropdown' },
    { id: 'about', label: 'ABOUT', type: 'section' },
  ];

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 pt-[env(safe-area-inset-top)] ${
          isScrolled ? 'bg-black/95 backdrop-blur-sm border-b border-white/10' : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <Link
              to="/"
              onClick={() => {
                setIsMobileMenuOpen(false);
                if (location.pathname === '/') {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              className="flex items-center hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
            >
              <img
                src="/logo.svg"
                alt="SAMEWAVE"
                className="h-8 w-auto"
              />
            </Link>

            <div className="hidden md:flex items-center gap-6">
              {navLinks.map(link => {
                if (link.type === 'route') {
                  return (
                    <Link
                      key={link.id}
                      to={link.path!}
                      className="text-xs tracking-wide text-white/70 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded px-1"
                    >
                      {link.label}
                    </Link>
                  );
                }
                if (link.type === 'dropdown') {
                  return (
                    <div key={link.id} className="relative" ref={dropdownRef}>
                      <button
                        onClick={() => setIsSubmitDropdownOpen(!isSubmitDropdownOpen)}
                        className="text-xs tracking-wide text-white/70 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded px-1 flex items-center gap-1"
                      >
                        {link.label}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {isSubmitDropdownOpen && (
                        <div className="absolute top-full mt-2 right-0 bg-black/95 backdrop-blur-sm border border-white/10 rounded shadow-lg py-2 min-w-[200px]">
                          {submitLinks.map(submitLink => (
                            <a
                              key={submitLink.label}
                              href={submitLink.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setIsSubmitDropdownOpen(false)}
                              className="block px-4 py-2 text-xs tracking-wide text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                            >
                              {submitLink.label}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <button
                    key={link.id}
                    onClick={() => scrollToSection(link.id)}
                    className="text-xs tracking-wide text-white/70 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded px-1"
                  >
                    {link.label}
                  </button>
                );
              })}
              <button
                onClick={() => setIsCartOpen(true)}
                className="relative p-2 text-white/70 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
                aria-label="Open cart"
              >
                <ShoppingBag className="w-5 h-5" />
                {totalQuantity > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-white text-black text-[10px] font-medium rounded-full flex items-center justify-center">
                    {totalQuantity > 9 ? '9+' : totalQuantity}
                  </span>
                )}
              </button>
            </div>

            <div className="md:hidden flex items-center gap-2">
              {installPrompt && (
                <button
                  onClick={handleInstallClick}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs tracking-wide bg-white text-black hover:bg-white/90 transition-colors rounded"
                  aria-label="Install app"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Add App</span>
                </button>
              )}
              {isIOSDevice && !installPrompt && (
                <button
                  onClick={() => setShowIOSPrompt(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs tracking-wide bg-white text-black hover:bg-white/90 transition-colors rounded"
                  aria-label="Add app"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Add App</span>
                </button>
              )}
              <button
                onClick={() => setIsCartOpen(true)}
                className="relative p-2 text-white/70 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
                aria-label="Open cart"
              >
                <ShoppingBag className="w-5 h-5" />
                {totalQuantity > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-white text-black text-[10px] font-medium rounded-full flex items-center justify-center">
                    {totalQuantity > 9 ? '9+' : totalQuantity}
                  </span>
                )}
              </button>
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="text-white hover:text-white/80 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded p-1"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-sm" />
          <div className="relative h-full pt-20 px-4 overflow-y-auto" style={{ paddingTop: 'calc(5rem + env(safe-area-inset-top))' }}>
            <nav className="flex flex-col gap-2">
              {navLinks.map(link => {
                if (link.type === 'route') {
                  return (
                    <Link
                      key={link.id}
                      to={link.path!}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="text-left py-4 px-4 text-lg tracking-wide text-white/70 hover:text-white hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
                    >
                      {link.label}
                    </Link>
                  );
                }
                if (link.type === 'dropdown') {
                  return (
                    <div key={link.id} className="flex flex-col">
                      <button
                        onClick={() => scrollToSection(link.id)}
                        className="text-left py-4 px-4 text-lg tracking-wide text-white/70 hover:text-white hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
                      >
                        {link.label}
                      </button>
                      <div className="pl-4 flex flex-col gap-1 mb-2">
                        {submitLinks.map(submitLink => (
                          <a
                            key={submitLink.label}
                            href={submitLink.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="text-left py-2 px-4 text-sm tracking-wide text-white/50 hover:text-white hover:bg-white/5 transition-colors rounded"
                          >
                            {submitLink.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                }
                return (
                  <button
                    key={link.id}
                    onClick={() => scrollToSection(link.id)}
                    className="text-left py-4 px-4 text-lg tracking-wide text-white/70 hover:text-white hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
                  >
                    {link.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {showIOSPrompt && isIOSDevice && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={dismissIOSPrompt}
          />
          <div className="relative bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm mb-4 animate-slide-up">
            <button
              onClick={dismissIOSPrompt}
              className="absolute top-3 right-3 p-1 text-white/50 hover:text-white"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-center">
              <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                <img src="/logo.svg" alt="Samewave" className="w-6 h-6" />
              </div>
              <h3 className="text-white text-lg font-medium mb-2">Add to Home Screen</h3>
              <p className="text-white/60 text-sm mb-6">
                Install Samewave Radio for quick access and a better experience.
              </p>
              <div className="bg-white/5 rounded-xl p-4 text-left">
                <div className="flex items-start gap-3 mb-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-white/10 rounded-full flex items-center justify-center text-xs text-white/80">1</span>
                  <p className="text-white/80 text-sm">
                    Tap the <Share className="w-4 h-4 inline-block mx-1 text-blue-400" /> Share button in Safari
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-white/10 rounded-full flex items-center justify-center text-xs text-white/80">2</span>
                  <p className="text-white/80 text-sm">
                    Scroll down and tap "Add to Home Screen"
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </>
  );
}
