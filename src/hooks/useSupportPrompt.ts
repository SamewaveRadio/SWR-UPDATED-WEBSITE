import { useState } from 'react';

const STORAGE_KEYS = {
  DISMISSED: 'swr_support_modal_dismissed_until',
  SUPPORTED: 'swr_support_modal_supported_until',
};

const DISMISS_DAYS = 2;
const SUPPORT_DAYS = 30;

function setStorageDate(key: string, daysFromNow: number): void {
  if (typeof window === 'undefined') return;
  try {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    localStorage.setItem(key, date.toISOString());
  } catch {
    // Fail silently
  }
}

export function useSupportPrompt() {
  const [isOpen, setIsOpen] = useState(false);

  const openModal = () => {
    setIsOpen(true);
  };

  const handleDismiss = () => {
    setStorageDate(STORAGE_KEYS.DISMISSED, DISMISS_DAYS);
    setIsOpen(false);
  };

  const handleSupport = () => {
    setStorageDate(STORAGE_KEYS.SUPPORTED, SUPPORT_DAYS);
    setIsOpen(false);
  };

  return {
    isOpen,
    openModal,
    handleDismiss,
    handleSupport,
  };
}
