import { Heart, Mail } from 'lucide-react';

export function Support() {
  return (
    <section id="support" className="py-12 sm:py-16 px-4 sm:px-6 border-b border-white/10">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-xl sm:text-2xl font-light text-white tracking-wide mb-6 sm:mb-8">Support</h2>

        <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
          <div className="space-y-4 sm:space-y-6">
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-white text-base sm:text-lg font-light">Support Community Radio</h3>
              <p className="text-white/60 text-sm leading-relaxed">
                Samewave Radio operates as a not for profit organization under the fiscal sponsorship of Southeast Uplift Neighborhood Program Inc. Your donations help us maintain our broadcast infrastructure, support our resident DJs, and keep independent radio alive.
              </p>
              <p className="text-white/40 text-xs">
                EIN: 93-0690723
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <a
                href="https://secure.givelively.org/donate/southeast-uplift-neighborhood-program-inc/samewave-radio"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-white text-black text-xs sm:text-sm tracking-wide hover:bg-white/90 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
              >
                <Heart className="w-3 h-3 sm:w-4 sm:h-4" />
                SUPPORT THE STATION
              </a>
              <a
                href="https://secure.givelively.org/donate/southeast-uplift-neighborhood-program-inc/samewave-radio-sponsorships"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-white/5 border border-white/10 text-white text-xs sm:text-sm tracking-wide hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
              >
                BECOME A SPONSOR
              </a>
            </div>
          </div>

          <div className="space-y-4 sm:space-y-6">
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-white text-base sm:text-lg font-light">Partner With Us</h3>
              <p className="text-white/60 text-sm leading-relaxed">
                Interested in sponsoring shows, hosting events, or collaborating with Samewave? We work with brands, venues, and organizations that align with our mission.
              </p>
            </div>

            <a
              href="mailto:Hello@SWR.live"
              className="inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-white/5 border border-white/10 text-white text-xs sm:text-sm tracking-wide hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
            >
              <Mail className="w-3 h-3 sm:w-4 sm:h-4" />
              GET IN TOUCH
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
