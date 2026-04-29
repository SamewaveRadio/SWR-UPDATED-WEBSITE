interface SupportFloatingCTAProps {
  onClick: () => void;
}

export function SupportFloatingCTA({ onClick }: SupportFloatingCTAProps) {
  return (
    <button
      onClick={onClick}
      aria-label="Support Samewave Radio"
      className="fixed bottom-24 right-4 sm:right-6 z-40 bg-black text-white px-4 py-2 sm:px-5 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium tracking-wide shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-black"
    >
      Support Today
    </button>
  );
}
