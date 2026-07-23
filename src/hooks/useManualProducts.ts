import { useState, useEffect, useCallback } from 'react';
import type { PrintifyProduct, PrintifyVariant, PrintifyMockupImage, ProductColorway } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface ManualProductResponse {
  id: string;
  slug: string;
  title: string;
  description: string;
  source: string;
  basePriceCents: number;
  currency: string;
  category: string | null;
  tags: string[];
  visibility: string;
  passwordRequired?: boolean;
  colorways: ProductColorway[];
  images: Array<{
    id: string;
    dbId: string;
    src: string;
    alt: string;
    position: number;
    colorwayId: string | null;
    isPrimary: boolean;
  }>;
  variants: Array<{
    id: string;
    variantId: string;
    sku: string | null;
    title: string;
    color: string | null;
    size: string | null;
    price: string;
    priceCents: number;
    colorwayId: string | null;
  }>;
}

function toPrintifyFormat(p: ManualProductResponse): PrintifyProduct {
  const mockupImages: PrintifyMockupImage[] = p.images.map((img, i) => ({
    id: i + 1,
    src: img.src,
    position: String(img.position),
    default: i === 0,
    colorwayId: img.colorwayId,
    isPrimary: img.isPrimary,
  }));

  const variants: PrintifyVariant[] = p.variants.map((v, i) => ({
    variantId: i + 1,
    sku: v.sku ?? '',
    title: v.title,
    color: v.color,
    size: v.size,
    price: v.price,
    priceCents: v.priceCents,
    _internalVariantId: v.id,
    _colorwayId: v.colorwayId,
  }));

  return {
    id: -(p.slug.charCodeAt(0) + p.slug.length * 1000),
    title: p.title,
    description: p.description,
    tags: p.tags,
    mockupImages,
    variants,
    _source: 'manual',
    _slug: p.slug,
    _visibility: p.visibility as 'public' | 'unlisted' | 'draft' | 'archived',
    _internalProductId: p.id,
    _colorways: p.colorways,
  };
}

export function useManualProducts() {
  const [products, setProducts] = useState<PrintifyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`${SUPABASE_URL}/functions/v1/manual-products`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load products (${res.status})`);
        const data = await res.json();
        if (!cancelled) {
          setProducts((data.items ?? []).map(toPrintifyFormat));
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load products');
          setProducts([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  return { products, loading, error };
}

export function useManualProductBySlug(slug: string | undefined, preview = false) {
  const [product, setProduct] = useState<PrintifyProduct | null>(null);
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'draft' | 'archived' | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProduct = useCallback((passwordAttempt?: string) => {
    if (!slug) {
      setProduct(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const token = localStorage.getItem('samewave-admin-token');
    const hasToken = Boolean(token);

    const params = new URLSearchParams({ slug });
    if (preview || hasToken) params.set('preview', 'true');
    if (passwordAttempt) params.set('password', passwordAttempt);

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`${SUPABASE_URL}/functions/v1/manual-products?${params.toString()}`, { headers })
      .then(async (res) => {
        if (res.status === 403) {
          const data = await res.json().catch(() => ({}));
          if (data?.passwordRequired) {
            setPasswordRequired(true);
            setProduct(null);
            setError(null);
            return;
          }
        }
        if (!res.ok) {
          if (res.status === 404) throw new Error('Product not found');
          throw new Error(`Failed to load product (${res.status})`);
        }
        const data = await res.json();
        setPasswordRequired(false);
        setProduct(toPrintifyFormat(data));
        setVisibility(data.visibility ?? 'public');
        setError(null);
      })
      .catch((err) => {
        setProduct(null);
        setError(err instanceof Error ? err.message : 'Product not found');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [slug, preview]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  return { product, visibility, loading, error, passwordRequired, fetchProduct };
}
