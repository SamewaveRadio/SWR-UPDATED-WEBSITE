import { useState } from 'react';
import { Instagram, Mail } from 'lucide-react';

export function Footer() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setMessage({ type: 'error', text: 'Please enter an email address' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/newsletter-subscribe`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ email: email.trim() }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: 'Successfully subscribed!' });
        setEmail('');
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to subscribe' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to subscribe. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <footer className="py-8 sm:py-12 px-4 sm:px-6 bg-black">
      <div className="max-w-7xl mx-auto">
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8 mb-6 sm:mb-8">
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2 text-white">
              <img
                src="/logo.svg"
                alt="Samewave Radio"
                className="h-5 w-auto"
              />
            </div>
            <p className="text-white/60 text-xs leading-relaxed">
              Independent community radio broadcasting experimental sounds and diverse voices.
            </p>
          </div>

          <div className="space-y-3 sm:space-y-4">
            <h4 className="text-white text-xs tracking-wide font-medium">CONNECT</h4>
            <div className="flex gap-3 sm:gap-4">
              <a
                href="https://instagram.com/samewaveradio"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/60 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
                aria-label="Instagram"
              >
                <Instagram className="w-4 h-4 sm:w-5 sm:h-5" />
              </a>
              <a
                href="mailto:info@samewaveradio.org"
                className="text-white/60 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
                aria-label="Email"
              >
                <Mail className="w-4 h-4 sm:w-5 sm:h-5" />
              </a>
            </div>
          </div>

          <div className="space-y-3 sm:space-y-4 sm:col-span-2 md:col-span-1">
            <h4 className="text-white text-xs tracking-wide font-medium">STAY CONNECTED</h4>
            <p className="text-white/60 text-xs">
              Stay updated with show announcements and community news.
            </p>
            <form onSubmit={handleSubscribe} className="space-y-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="flex-1 min-w-0 px-3 py-2 bg-white/5 border border-white/10 text-white text-xs placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 rounded disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-3 sm:px-4 py-2 bg-white text-black text-xs tracking-wide hover:bg-white/90 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'SUBSCRIBING...' : 'SUBSCRIBE'}
                </button>
              </div>
              {message && (
                <p className={`text-xs ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                  {message.text}
                </p>
              )}
            </form>
          </div>
        </div>

        <div className="pt-6 sm:pt-8 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4">
          <p className="text-white/40 text-xs text-center sm:text-left">
            © {new Date().getFullYear()} Samewave Radio. All rights reserved.
          </p>
          <div className="flex gap-4 sm:gap-6 text-xs">
            <a href="#" className="text-white/40 hover:text-white/60 transition-colors">
              Privacy
            </a>
            <a href="#" className="text-white/40 hover:text-white/60 transition-colors">
              Terms
            </a>
            <a href="#" className="text-white/40 hover:text-white/60 transition-colors">
              Contact
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
