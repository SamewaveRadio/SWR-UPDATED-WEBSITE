import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { Navigation } from '../components/Navigation';
import { useCartContext } from '../contexts/CartContext';

export function CheckoutSuccessPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sessionId = new URLSearchParams(window.location.search).get('session_id');
  const { clearCart } = useCartContext();

  useEffect(() => {
    document.title = 'Order Confirmed — Samewave Radio';

    if (!sessionId) {
      setError('No checkout session found.');
      setLoading(false);
      return;
    }

    clearCart();
    setLoading(false);
  }, [sessionId, clearCart]);

  return (
    <div className="min-h-screen bg-black pb-32 sm:pb-36">
      <Navigation />
      <div className="pt-20 sm:pt-24 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto">
          {loading ? (
            <div className="py-24 text-center">
              <Loader2 className="w-8 h-8 text-white/40 animate-spin mx-auto mb-4" />
              <p className="text-white/60 text-sm">Confirming your order...</p>
            </div>
          ) : error ? (
            <div className="py-24 text-center">
              <AlertCircle className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <p className="text-white/60 text-sm mb-6">{error}</p>
              <Link
                to="/shop"
                className="inline-flex items-center gap-2 text-white text-sm underline underline-offset-4 hover:no-underline"
              >
                Back to Shop
              </Link>
            </div>
          ) : (
            <div className="py-16 sm:py-24 text-center">
              <CheckCircle2 className="w-16 h-16 text-white mx-auto mb-6" />
              <h1 className="text-2xl sm:text-3xl font-light text-white tracking-wide mb-3">
                Thank you for your order
              </h1>
              <p className="text-white/60 text-sm mb-2">
                Your payment has been processed successfully.
              </p>
              <p className="text-white/40 text-xs mb-8">
                A confirmation email is on its way. If your order contains items from
                different suppliers, they may arrive in separate shipments.
              </p>
              <Link
                to="/shop"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-black font-medium text-sm tracking-wide hover:bg-white/90 transition-colors rounded"
              >
                Continue Shopping
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
