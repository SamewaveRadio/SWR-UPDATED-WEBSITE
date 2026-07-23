import { useState, useEffect, useCallback } from 'react';
import type { AdminProductListItem, ProductVisibility } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function getAuthToken(): string | null {
  return localStorage.getItem('samewave-admin-token');
}

async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'apikey': SUPABASE_ANON_KEY,
    ...((options.headers as Record<string, string>) ?? {}),
  };

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  return response;
}

export interface AdminProductImage {
  id: string;
  product_id: string;
  src: string;
  alt: string | null;
  position: number;
  r2_key: string | null;
  colorway_id: string | null;
  is_primary: boolean;
}

export interface AdminProductColorway {
  id: string;
  product_id: string;
  name: string;
  slug: string;
  hex_color: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminProductDetail {
  product: {
    id: string;
    slug: string;
    title: string;
    description: string;
    source: 'printify' | 'manual';
    base_price_cents: number;
    currency: string;
    sku: string | null;
    category: string | null;
    tags: string[];
    shipping_class: string;
    visibility: ProductVisibility;
    track_inventory: boolean;
    allow_backorders: boolean;
    password: string | null;
    is_published: boolean;
    created_at: string;
    updated_at: string;
  };
  variants: Array<{
    id: string;
    product_id: string;
    sku: string | null;
    title: string;
    options: Record<string, string>;
    price_cents: number;
    position: number;
    is_enabled: boolean;
    colorway_id: string | null;
  }>;
  images: AdminProductImage[];
  colorways: AdminProductColorway[];
  inventory: Record<string, number>;
}

export function useAdminProducts() {
  const [items, setItems] = useState<AdminProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch('admin-products');
      if (!res.ok) throw new Error(`Failed to load products (${res.status})`);
      const data = await res.json();
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { items, loading, error, refetch };
}

export function useAdminProduct(id: string | null) {
  const [detail, setDetail] = useState<AdminProductDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    adminFetch(`admin-products?id=${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load product (${res.status})`);
        const data = await res.json();
        if (!cancelled) setDetail(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load product');
          setDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [id]);

  return { detail, loading, error };
}

export async function createProduct(body: unknown): Promise<{ id: string }> {
  const res = await adminFetch('admin-products', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to create product (${res.status})`);
  }
  return res.json();
}

export async function updateProduct(body: unknown): Promise<void> {
  const res = await adminFetch('admin-products', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to update product (${res.status})`);
  }
}

export async function deleteProduct(id: string): Promise<void> {
  const res = await adminFetch(`admin-products?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to delete product (${res.status})`);
  }
}
