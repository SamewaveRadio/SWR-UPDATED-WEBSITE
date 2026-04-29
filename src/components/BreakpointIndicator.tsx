import { useState, useEffect } from 'react';

export function BreakpointIndicator() {
  const [isVisible, setIsVisible] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        setIsVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('resize', updateDimensions);
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  if (!isVisible) return null;

  const getBreakpoint = () => {
    if (dimensions.width >= 1280) return 'xl';
    if (dimensions.width >= 1024) return 'lg';
    if (dimensions.width >= 768) return 'md';
    if (dimensions.width >= 640) return 'sm';
    return 'xs';
  };

  const breakpoint = getBreakpoint();

  return (
    <div className="fixed bottom-4 right-4 z-[9999] bg-black/90 border border-white/20 rounded px-3 py-2 text-xs font-mono text-white backdrop-blur-sm">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-white/60">BP:</span>
          <span className="font-semibold text-green-400">{breakpoint}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/60">W:</span>
          <span>{dimensions.width}px</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/60">H:</span>
          <span>{dimensions.height}px</span>
        </div>
        <div className="text-white/40 text-[10px] mt-1 border-t border-white/10 pt-1">
          Ctrl+B to toggle
        </div>
      </div>
    </div>
  );
}
