import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface SupportModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  onSupport: () => void;
}

export function SupportModal({ isOpen, onDismiss, onSupport }: SupportModalProps) {
  const DONATE_URL = 'https://secure.givelively.org/donate/southeast-uplift-neighborhood-program-inc/samewave-radio';
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onDismiss();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      closeButtonRef.current?.focus();
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onDismiss]);

  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement?.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement?.focus();
          e.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSupportClick = () => {
    onSupport();
    window.open(DONATE_URL, '_blank', 'noopener,noreferrer');
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onDismiss();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-modal-title"
    >
      <div className="absolute inset-0 bg-black/60" />

      <div
        ref={modalRef}
        className="relative bg-white rounded shadow-2xl max-w-md w-full overflow-hidden"
      >
        <div className="bg-yellow-400 h-2" />

        <div className="p-6 sm:p-8">
          <button
            ref={closeButtonRef}
            onClick={onDismiss}
            className="absolute top-4 right-4 text-black/50 hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400 rounded p-1"
            aria-label="Close support modal"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 mb-5 pr-8">
            <img
              src="/logo.svg"
              alt=""
              className="h-10 w-10 sm:h-12 sm:w-12"
            />
            <h2 id="support-modal-title" className="text-2xl sm:text-3xl font-bold text-black leading-tight">
              Become a Samewave Supporter
            </h2>
          </div>

          <p className="text-black/80 leading-relaxed mb-6">
            Your support powers our hosts, programming, and community broadcasts. Help keep Samewave Radio going.
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleSupportClick}
              className="w-full bg-black text-white px-6 py-3 rounded font-medium tracking-wide hover:bg-black/90 transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2"
            >
              Support Today
            </button>

            <button
              onClick={onDismiss}
              className="text-sm text-black/60 hover:text-black transition-colors focus:outline-none focus:underline"
            >
              Not right now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
