import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { User, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Resident } from '../types';
import { convertGoogleDriveUrl } from '../lib/imageUtils';

export function ResidentsGrid() {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    fetchResidents();
  }, []);

  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const fetchResidents = async () => {
    try {
      const { data, error } = await supabase
        .from('residents')
        .select('*');

      if (error) {
        console.error('Error fetching residents:', error);
        return;
      }

      setResidents(shuffleArray(data || []));
    } catch (error) {
      console.error('Error fetching residents:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <section id="residents" className="py-12 sm:py-16 px-4 sm:px-6 border-b border-white/10">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-light text-white tracking-wide mb-6 sm:mb-8">Residents</h2>
          <div className="py-8 sm:py-12 text-center text-white/40 text-sm">Loading residents...</div>
        </div>
      </section>
    );
  }

  const INITIAL_RESIDENTS_COUNT = 8;
  const displayedResidents = isExpanded ? residents : residents.slice(0, INITIAL_RESIDENTS_COUNT);
  const hasMore = residents.length > INITIAL_RESIDENTS_COUNT;

  return (
    <section id="residents" className="py-12 sm:py-16 px-4 sm:px-6 border-b border-white/10">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-xl sm:text-2xl font-light text-white tracking-wide mb-6 sm:mb-8">Residents</h2>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-white/10">
          {displayedResidents.map((resident) => (
            <Link
              key={resident.id}
              to={`/residents/${resident.slug}`}
              className="group bg-black p-3 sm:p-4 md:p-6 hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20"
            >
              <div className="aspect-square mb-2 sm:mb-3 md:mb-4 bg-white/5 rounded-sm flex items-center justify-center overflow-hidden">
                {resident.image_url ? (
                  <img
                    src={convertGoogleDriveUrl(resident.image_url)}
                    alt={resident.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const parent = e.currentTarget.parentElement;
                      if (parent && !parent.querySelector('svg')) {
                        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        icon.setAttribute('class', 'w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-white/20 lucide lucide-user');
                        icon.setAttribute('viewBox', '0 0 24 24');
                        icon.setAttribute('fill', 'none');
                        icon.setAttribute('stroke', 'currentColor');
                        icon.setAttribute('stroke-width', '2');
                        icon.setAttribute('stroke-linecap', 'round');
                        icon.setAttribute('stroke-linejoin', 'round');
                        icon.innerHTML = '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>';
                        parent.appendChild(icon);
                      }
                    }}
                  />
                ) : (
                  <User className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-white/20" />
                )}
              </div>

              <h3 className="text-white font-medium text-xs sm:text-sm mb-0.5 sm:mb-1 group-hover:text-white/80 transition-colors truncate">
                {resident.name}
              </h3>

              {resident.show_title && (
                <div className="space-y-0.5 sm:space-y-1">
                  <p className="text-white/60 text-[10px] sm:text-xs truncate">
                    {resident.show_title}
                  </p>
                  {resident.active && resident.schedule_text && (
                    <p className="text-white/40 text-[10px] sm:text-xs truncate">
                      {resident.schedule_text}
                    </p>
                  )}
                </div>
              )}
            </Link>
          ))}
        </div>

        {hasMore && (
          <div className="mt-6 sm:mt-8 text-center">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-white/5 text-white text-xs sm:text-sm tracking-wide hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
            >
              {isExpanded ? (
                <>
                  SHOW LESS
                  <ChevronUp className="w-4 h-4" />
                </>
              ) : (
                <>
                  SHOW MORE
                  <ChevronDown className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
