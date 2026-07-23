import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { BadgeTone, TONE_CLASSES } from '../lib/orders';

export function StatusBadge({ label, tone }: { label: string; tone: BadgeTone }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium leading-tight ${TONE_CLASSES[tone]}`}>
      {label}
    </span>
  );
}

export function ModeBadge({ live }: { live: boolean | null }) {
  if (live === true) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
        Live
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-amber-500/15 text-amber-300 border-amber-500/40">
      TEST MODE
    </span>
  );
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <button
      onClick={onCopy}
      className="inline-flex items-center gap-1 text-white/40 hover:text-white transition-colors"
      title={`Copy ${label ?? 'value'}`}
      type="button"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export function Toast({ message, tone }: { message: string; tone: 'success' | 'error' }) {
  return (
    <div
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[80] px-4 py-2.5 rounded-lg border text-sm shadow-lg ${
        tone === 'success'
          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
          : 'bg-red-500/15 border-red-500/40 text-red-200'
      }`}
    >
      {message}
    </div>
  );
}
