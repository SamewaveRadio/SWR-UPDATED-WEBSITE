import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useCartContext } from '../contexts/CartContext';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { items, loading, updateQuantity, removeFromCart } = useCartContext();
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && drawerRef.current) {
      drawerRef.current.focus();
    }
  }, [isOpen]);

  const subtotalCents = items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);
  const subtotal = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(subtotalCents / 100);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 z-50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-black border-l border-white/10 z-50 transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-white/10">
            <h2 className="text-lg sm:text-xl font-light text-white tracking-wide">
              Cart
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-white/60 hover:text-white transition-colors"
              aria-label="Close cart"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <ShoppingBag className="w-12 h-12 text-white/20 mb-4" />
              <p className="text-white/60 text-sm mb-4">Your cart is empty</p>
              <button
                onClick={onClose}
                className="text-white text-sm underline underline-offset-4 hover:no-underline"
              >
                Continue shopping
              </button>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                <div className="space-y-4">
                  {items.map((line) => (
                    <div
                      key={`${line.productId}-${line.variantId}`}
                      className="flex gap-3 sm:gap-4 pb-4 border-b border-white/10"
                    >
                      <Link
                        to={`/shop/${line.productId}`}
                        onClick={onClose}
                        className="w-16 h-16 sm:w-20 sm:h-20 bg-white/5 rounded overflow-hidden flex-shrink-0"
                      >
                        {line.imageUrl ? (
                          <img
                            src={line.imageUrl}
                            alt={line.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ShoppingBag className="w-6 h-6 text-white/20" />
                          </div>
                        )}
                      </Link>

                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/shop/${line.productId}`}
                          onClick={onClose}
                          className="text-white text-sm font-medium hover:text-white/80 transition-colors line-clamp-1"
                        >
                          {line.title}
                        </Link>
                        {(line.color || line.size) && (
                          <p className="text-white/40 text-xs mt-0.5">
                            {[line.color, line.size].filter(Boolean).join(' / ')}
                          </p>
                        )}
                        <p className="text-white/80 text-sm mt-1">{line.price}</p>

                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center border border-white/20">
                            <button
                              onClick={() =>
                                updateQuantity(line.productId, line.variantId, line.quantity - 1)
                              }
                              disabled={loading}
                              className="p-1.5 text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-8 text-center text-white text-xs">
                              {line.quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateQuantity(line.productId, line.variantId, line.quantity + 1)
                              }
                              disabled={loading}
                              className="p-1.5 text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                              aria-label="Increase quantity"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <button
                            onClick={() => removeFromCart(line.productId, line.variantId)}
                            disabled={loading}
                            className="p-1.5 text-white/40 hover:text-white transition-colors disabled:opacity-50"
                            aria-label="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-white/10 p-4 sm:p-6 space-y-4">
                <div className="flex items-center justify-between text-white">
                  <span className="text-sm">Subtotal</span>
                  <span className="text-lg font-medium">{subtotal}</span>
                </div>
                <p className="text-white/40 text-xs">
                  Shipping and taxes calculated at checkout
                </p>
                <button
                  disabled
                  className="w-full py-3 bg-white/10 text-white/50 font-medium text-sm tracking-wide cursor-not-allowed rounded"
                >
                  Checkout coming next
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
