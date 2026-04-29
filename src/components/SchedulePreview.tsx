import { useEffect, useState } from 'react';

type ViewMode = 'today' | 'tomorrow' | 'week';

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  is_live: boolean;
}

export function SchedulePreview() {
  const [scheduleEntries, setScheduleEntries] = useState<CalendarEvent[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('today');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSchedule();
  }, [viewMode]);

  const fetchSchedule = async () => {
    setLoading(true);
    try {
      const now = new Date();
      let startDate = new Date(now);
      let endDate = new Date(now);

      if (viewMode === 'today') {
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
      } else if (viewMode === 'tomorrow') {
        startDate.setDate(startDate.getDate() + 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(endDate.getDate() + 1);
        endDate.setHours(23, 59, 59, 999);
      } else {
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(endDate.getDate() + 7);
        endDate.setHours(23, 59, 59, 999);
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-calendar-events`;
      const params = new URLSearchParams({
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
      });

      const response = await fetch(`${apiUrl}?${params}`, {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch calendar events');
      }

      const data = await response.json();
      setScheduleEntries(data.events || []);
    } catch (error) {
      console.error('Error fetching schedule:', error);
      setScheduleEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <section id="schedule" className="py-12 sm:py-16 px-4 sm:px-6 border-b border-white/10">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-light text-white tracking-wide">Schedule</h2>

          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('today')}
              className={`px-2.5 sm:px-3 py-1.5 sm:py-1 text-[10px] sm:text-xs tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded ${
                viewMode === 'today'
                  ? 'bg-white text-black'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              TODAY
            </button>
            <button
              onClick={() => setViewMode('tomorrow')}
              className={`px-2.5 sm:px-3 py-1.5 sm:py-1 text-[10px] sm:text-xs tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded ${
                viewMode === 'tomorrow'
                  ? 'bg-white text-black'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              TOMORROW
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-2.5 sm:px-3 py-1.5 sm:py-1 text-[10px] sm:text-xs tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded ${
                viewMode === 'week'
                  ? 'bg-white text-black'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              WEEK
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-8 sm:py-12 text-center text-white/40 text-sm">Loading schedule...</div>
        ) : scheduleEntries.length === 0 ? (
          <div className="py-8 sm:py-12 text-center text-white/40 text-sm">No shows scheduled</div>
        ) : (
          <div className="space-y-px">
            {scheduleEntries.map((entry) => (
              <div
                key={entry.id}
                className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 sm:py-4 px-3 sm:px-4 transition-colors ${
                  entry.is_live
                    ? 'bg-red-500/10 border-l-2 border-red-500'
                    : 'hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-16 sm:w-20 text-[10px] sm:text-xs text-white/60">
                    {formatTime(entry.start_time)}
                  </div>

                  {viewMode === 'week' && (
                    <div className="flex-shrink-0 text-[10px] sm:text-xs text-white/60">
                      {formatDate(entry.start_time)}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {entry.is_live && (
                      <span className="flex-shrink-0 px-1.5 py-0.5 text-[9px] sm:text-xs bg-red-500 text-white rounded">
                        LIVE
                      </span>
                    )}
                    <h3 className="text-white font-medium text-sm sm:text-base truncate">
                      {entry.title}
                    </h3>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
