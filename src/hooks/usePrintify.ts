import { useState, useEffect, useCallback } from 'react';
import { PrintifyProduct, PrintifyProductsResponse, CartItem } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const CART_STORAGE_KEY = 'samewave-printify-cart';

// SECURITY: Prices stored in the browser (localStorage, cart items) are for display only
// and MUST be revalidated server-side during checkout. Never trust client-stored prices
// when creating an order — always fetch the authoritative price from the Printify API
// on the server before charging the customer.

async function fetchApi<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'API request failed');
  }

  return data;
}

export function useProducts() {
  const [products, setProducts] = useState<PrintifyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchApi<PrintifyProductsResponse>('printify-products');
      setProducts(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return { products, loading, error, refetch: fetchProducts };
}

export function useProduct(productId: string | undefined) {
  const [product, setProduct] = useState<PrintifyProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) {
      setProduct(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchApi<{ item: PrintifyProduct }>(`printify-products?productId=${encodeURIComponent(productId)}`)
      .then((data) => {
        if (!cancelled) {
          setProduct(data.item ?? null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setProduct(null);
          setError(err instanceof Error ? err.message : 'Product not found');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  return { product, loading, error };
}

function loadCartFromStorage(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as CartItem[];
  } catch {
    return [];
  }
}

function saveCartToStorage(items: CartItem[]) {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = loadCartFromStorage();
    setItems(stored);

    if (stored.length === 0) return;

    let cancelled = false;

    fetch(`${SUPABASE_URL}/functions/v1/printify-products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: stored
          .filter((i) => i.source !== 'manual')
          .map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.valid === false && Array.isArray(data.rejectedItems)) {
          const rejected = new Set(
            data.rejectedItems.map(
              (r: { productId: number; variantId: number }) =>
                `${r.productId}-${r.variantId}`
            )
          );
          const cleaned = stored.filter(
            (i) => i.source === 'manual' || !rejected.has(`${i.productId}-${i.variantId}`)
          );
          setItems(cleaned);
          saveCartToStorage(cleaned);
        }
      })
      .catch(() => {
        // If validation fails, keep existing cart — server-side checkout will catch it
      });

    // Validate manual products against the manual-products endpoint
    const manualItems = stored.filter((i) => i.source === 'manual');
    if (manualItems.length > 0) {
      Promise.all(
        manualItems.map((item) =>
          fetch(`${SUPABASE_URL}/functions/v1/manual-products?slug=${encodeURIComponent(item.slug ?? '')}`)
            .then((res) => res.ok ? res.json() : null)
            .catch(() => null)
        )
      )
        .then((results) => {
          if (cancelled) return;
          const validManualSlugs = new Set(
            results
              .filter((r): r is { product: { slug: string; visibility: string } } => r !== null && r.product && (r.product.visibility === 'public' || r.product.visibility === 'unlisted'))
              .map((r) => r.product.slug)
          );
          const cleaned = stored.filter(
            (i) => i.source !== 'manual' || (i.slug && validManualSlugs.has(i.slug))
          );
          if (cleaned.length !== stored.length) {
            setItems(cleaned);
            saveCartToStorage(cleaned);
          }
        })
        .catch(() => {
          // If validation fails, keep existing cart — server-side checkout will catch it
        });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: CartItem[]) => {
    setItems(next);
    saveCartToStorage(next);
  }, []);

  const addToCart = useCallback(
    (item: Omit<CartItem, 'quantity'>, quantity = 1) => {
      setLoading(true);
      try {
        setItems((prev) => {
          const existing = prev.find(
            (i) => i.productId === item.productId && i.variantId === item.variantId
          );
          let next: CartItem[];
          if (existing) {
            next = prev.map((i) =>
              i.productId === item.productId && i.variantId === item.variantId
                ? { ...i, quantity: i.quantity + quantity }
                : i
            );
          } else {
            next = [...prev, { ...item, quantity }];
          }
          saveCartToStorage(next);
          return next;
        });
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updateQuantity = useCallback(
    (productId: string | number, variantId: number, quantity: number) => {
      setLoading(true);
      try {
        setItems((prev) => {
          let next: CartItem[];
          if (quantity < 1) {
            next = prev.filter(
              (i) => !(i.productId === productId && i.variantId === variantId)
            );
          } else {
            next = prev.map((i) =>
              i.productId === productId && i.variantId === variantId
                ? { ...i, quantity }
                : i
            );
          }
          saveCartToStorage(next);
          return next;
        });
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const removeFromCart = useCallback(
    (productId: string | number, variantId: number) => {
      setLoading(true);
      try {
        setItems((prev) => {
          const next = prev.filter(
            (i) => !(i.productId === productId && i.variantId === variantId)
          );
          saveCartToStorage(next);
          return next;
        });
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearCart = useCallback(() => {
    persist([]);
  }, [persist]);

  const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotalCents = items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);

  return {
    items,
    loading,
    error: null as string | null,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    refetch: () => setItems(loadCartFromStorage()),
    totalQuantity,
    subtotalCents,
  };
}
