import { useState, useEffect } from 'react';

const STORAGE_KEYS = {
  DISMISSED: 'swr_support_modal_dismissed_until',
  SUPPORTED: 'swr_support_modal_supported_until',
};

const DELAY_MS = 20000;
const DISMISS_DAYS = 2;
const SUPPORT_DAYS = 30;

function getStorageDate(key: string): Date | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = localStorage.getItem(key);
    return value ? new Date(value) : null;
  } catch {
    return null;
  }
}

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

function shouldShowModal(): boolean {
  const dismissedUntil = getStorageDate(STORAGE_KEYS.DISMISSED);
  const supportedUntil = getStorageDate(STORAGE_KEYS.SUPPORTED);
  const now = new Date();

  if (dismissedUntil && dismissedUntil > now) return false;
  if (supportedUntil && supportedUntil > now) return false;

  return true;
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
