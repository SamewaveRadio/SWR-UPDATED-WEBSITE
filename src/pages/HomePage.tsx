import { useEffect } from 'react';
import { Navigation } from '../components/Navigation';
import { LiveModule } from '../components/LiveModule';
import { TrackHistory } from '../components/TrackHistory';
import { SchedulePreview } from '../components/SchedulePreview';
import { ResidentsGrid } from '../components/ResidentsGrid';
import { Shop } from '../components/Shop';
import { Archive } from '../components/Archive';
import { Support } from '../components/Support';
import { Submit } from '../components/Submit';
import { About } from '../components/About';
import { Footer } from '../components/Footer';

export function HomePage() {
  useEffect(() => {
    document.title = 'Samewave Radio';

    const hash = window.location.hash.slice(1);
    if (hash) {
      setTimeout(() => {
        const element = document.getElementById(hash);
        if (element) {
          const offset = 80;
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - offset;
          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }
      }, 100);
    }
  }, []);

  return (
    <div className="min-h-screen bg-black pb-32 sm:pb-36">
      <Navigation />
      <LiveModule />
      <TrackHistory />
      <SchedulePreview />
      <Archive />
      <ResidentsGrid />
      <Shop />
      <Support />
      <Submit />
      <About />
      <Footer />
    </div>
  );
}
