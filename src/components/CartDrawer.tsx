import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Minus, Plus, ShoppingBag, Trash2, Loader2, AlertCircle, ChevronUp } from 'lucide-react';
import { useCartContext } from '../contexts/CartContext';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShippingForm {
  email: string;
  name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

const EMPTY_FORM: ShippingForm = {
  email: '',
  name: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'US',
};

const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'JP', name: 'Japan' },
];

function validateForm(form: ShippingForm): string | null {
  if (!form.email.trim()) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Please enter a valid email';
  if (!form.name.trim()) return 'Full name is required';
  if (!form.line1.trim()) return 'Address line 1 is required';
  if (!form.city.trim()) return 'City is required';
  if (!form.state.trim()) return 'State / Region is required';
  if (!form.postalCode.trim()) return 'Postal code is required';
  if (!form.country.trim()) return 'Country is required';
  return null;
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { items, loading, updateQuantity, removeFromCart } = useCartContext();
  const drawerRef = useRef<HTMLDivElement>(null);

  const [showCheckout, setShowCheckout] = useState(false);
  const [form, setForm] = useState<ShippingForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  // Reset checkout state when cart is closed
  useEffect(() => {
    if (!isOpen) {
      setShowCheckout(false);
      setFormError(null);
      setSubmitError(null);
    }
  }, [isOpen]);

  const subtotalCents = items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);
  const subtotal = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(subtotalCents / 100);

  const hasPrintify = items.some((i) => i.source === 'printify');
  const hasManual = items.some((i) => i.source === 'manual');
  const mixedOrder = hasPrintify && hasManual;

  const handleCheckoutClick = () => {
    setShowCheckout(true);
    setFormError(null);
    setSubmitError(null);
  };

  const handleFormChange = (field: keyof ShippingForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormError(null);
    setSubmitError(null);
  };

  const handleSubmitCheckout = async () => {
    const validationError = validateForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setSubmitError(null);

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((item) => ({
            source: item.source,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            internalProductId: item.internalProductId,
            internalVariantId: item.internalVariantId,
            slug: item.slug,
            colorwayId: item.colorwayId,
            colorwayName: item.colorwayName,
            colorwayImageUrl: item.colorwayImageUrl,
          })),
          email: form.email,
          shippingAddress: {
            name: form.name,
            line1: form.line1,
            line2: form.line2 || undefined,
            city: form.city,
            state: form.state,
            postalCode: form.postalCode,
            country: form.country,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const message = data.error || 'Checkout failed';
        const details = Array.isArray(data.details) ? data.details.join('; ') : '';
        setSubmitError(details ? `${message}: ${details}` : message);
        return;
      }

      if (data.url) {
        // Redirect to Stripe-hosted Checkout
        window.location.href = data.url;
      } else {
        setSubmitError('Failed to create checkout session');
      }
    } catch {
      setSubmitError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'w-full bg-white/5 border border-white/20 text-white text-sm px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-white/40 focus:border-white/40 placeholder-white/30 transition-colors';
  const labelClass = 'text-white/60 text-xs mb-1 block';

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 z-[60] transition-opacity duration-300 ${
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
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-black border-l border-white/10 z-[60] transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-white/10">
            <h2 className="text-lg sm:text-xl font-light text-white tracking-wide">
              {showCheckout ? 'Checkout' : 'Cart'}
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
          ) : showCheckout ? (
            <>
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                <button
                  onClick={() => setShowCheckout(false)}
                  className="text-white/60 hover:text-white text-xs mb-4 flex items-center gap-1 transition-colors"
                >
                  <ChevronUp className="w-3 h-3" />
                  Back to cart
                </button>

                {mixedOrder && (
                  <div className="mb-4 p-3 bg-white/5 border border-white/10 rounded text-white/60 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>This order contains items from different suppliers and may arrive in separate shipments.</span>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className={labelClass}>Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => handleFormChange('email', e.target.value)}
                      placeholder="you@example.com"
                      className={inputClass}
                      disabled={submitting}
                      autoComplete="email"
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Full Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => handleFormChange('name', e.target.value)}
                      placeholder="Jane Doe"
                      className={inputClass}
                      disabled={submitting}
                      autoComplete="name"
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Address Line 1</label>
                    <input
                      type="text"
                      value={form.line1}
                      onChange={(e) => handleFormChange('line1', e.target.value)}
                      placeholder="123 Main St"
                      className={inputClass}
                      disabled={submitting}
                      autoComplete="address-line1"
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Address Line 2 (optional)</label>
                    <input
                      type="text"
                      value={form.line2}
                      onChange={(e) => handleFormChange('line2', e.target.value)}
                      placeholder="Apt 4B"
                      className={inputClass}
                      disabled={submitting}
                      autoComplete="address-line2"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>City</label>
                      <input
                        type="text"
                        value={form.city}
                        onChange={(e) => handleFormChange('city', e.target.value)}
                        placeholder="Brooklyn"
                        className={inputClass}
                        disabled={submitting}
                        autoComplete="address-level2"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>State / Region</label>
                      <input
                        type="text"
                        value={form.state}
                        onChange={(e) => handleFormChange('state', e.target.value)}
                        placeholder="NY"
                        className={inputClass}
                        disabled={submitting}
                        autoComplete="address-level1"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Postal Code</label>
                      <input
                        type="text"
                        value={form.postalCode}
                        onChange={(e) => handleFormChange('postalCode', e.target.value)}
                        placeholder="11201"
                        className={inputClass}
                        disabled={submitting}
                        autoComplete="postal-code"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Country</label>
                      <select
                        value={form.country}
                        onChange={(e) => handleFormChange('country', e.target.value)}
                        className={inputClass}
                        disabled={submitting}
                        autoComplete="country-name"
                      >
                        {COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code} className="bg-black text-white">
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {formError && (
                  <div className="mt-4 flex items-start gap-2 text-red-400 text-xs">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                {submitError && (
                  <div className="mt-4 flex items-start gap-2 text-red-400 text-xs">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{submitError}</span>
                  </div>
                )}

                <div className="mt-6 pt-4 border-t border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-white">
                    <span className="text-sm">Subtotal</span>
                    <span className="text-sm font-medium">{subtotal}</span>
                  </div>
                  <p className="text-white/40 text-xs">
                    Shipping calculated at checkout. Taxes handled by Stripe.
                  </p>
                </div>
              </div>

              <div className="border-t border-white/10 p-4 sm:p-6">
                <button
                  onClick={handleSubmitCheckout}
                  disabled={submitting || loading}
                  className="w-full py-3 bg-white text-black font-medium text-sm tracking-wide hover:bg-white/90 transition-colors rounded flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Preparing checkout...
                    </>
                  ) : (
                    'Continue to Stripe Checkout'
                  )}
                </button>
                <p className="mt-2 text-center text-white/40 text-xs">
                  Secure payment powered by Stripe
                </p>
              </div>
            </>
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
                        to={line.source === 'manual' && line.slug ? `/shop/${line.slug}` : `/shop/${line.productId}`}
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
                          to={line.source === 'manual' && line.slug ? `/shop/${line.slug}` : `/shop/${line.productId}`}
                          onClick={onClose}
                          className="text-white text-sm font-medium hover:text-white/80 transition-colors line-clamp-1"
                        >
                          {line.title}
                        </Link>
                        {(line.color || line.size || line.colorwayName) && (
                          <p className="text-white/40 text-xs mt-0.5">
                            {[line.colorwayName || line.color, line.size].filter(Boolean).join(' / ')}
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
                  onClick={handleCheckoutClick}
                  disabled={loading}
                  className="w-full py-3 bg-white text-black font-medium text-sm tracking-wide hover:bg-white/90 transition-colors rounded disabled:opacity-50"
                >
                  Checkout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
