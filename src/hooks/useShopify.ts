import { useState, useEffect, useCallback } from 'react';
import {
  ShopifyProduct,
  ShopifyProductsResponse,
  ShopifyProductDetail,
  ShopifyCart,
} from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const CART_STORAGE_KEY = 'samewave-cart-id';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'API request failed');
  }

  return data;
}

export function useProducts(first = 12, query?: string) {
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageInfo, setPageInfo] = useState<{ hasNextPage: boolean; endCursor: string | null }>({
    hasNextPage: false,
    endCursor: null,
  });

  const fetchProducts = useCallback(async (after?: string) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({ first: String(first) });
      if (after) params.set('after', after);
      if (query) params.set('query', query);

      const data = await fetchApi<ShopifyProductsResponse>(
        `shopify-products?${params.toString()}`
      );

      if (after) {
        setProducts((prev) => [...prev, ...data.items]);
      } else {
        setProducts(data.items);
      }
      setPageInfo(data.pageInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch products');
    } finally {
      setLoading(false);
    }
  }, [first, query]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const loadMore = useCallback(() => {
    if (pageInfo.hasNextPage && pageInfo.endCursor) {
      fetchProducts(pageInfo.endCursor);
    }
  }, [pageInfo, fetchProducts]);

  return { products, loading, error, hasMore: pageInfo.hasNextPage, loadMore, refetch: fetchProducts };
}

export function useProduct(handle: string | undefined) {
  const [product, setProduct] = useState<ShopifyProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!handle) {
      setLoading(false);
      return;
    }

    const fetchProduct = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await fetchApi<ShopifyProductDetail>(
          `shopify-product?handle=${encodeURIComponent(handle)}`
        );

        setProduct(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch product');
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [handle]);

  return { product, loading, error };
}

export function useCart() {
  const [cart, setCart] = useState<ShopifyCart | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getStoredCartId = (): string | null => {
    try {
      return localStorage.getItem(CART_STORAGE_KEY);
    } catch {
      return null;
    }
  };

  const setStoredCartId = (cartId: string) => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, cartId);
    } catch {
      // Silently fail
    }
  };

  const clearStoredCartId = () => {
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
    } catch {
      // Silently fail
    }
  };

  const fetchCart = useCallback(async (cartId?: string) => {
    const id = cartId || getStoredCartId();
    if (!id) return;

    try {
      setLoading(true);
      setError(null);

      const data = await fetchApi<ShopifyCart>(`shopify-cart?cartId=${encodeURIComponent(id)}`);
      setCart(data);
    } catch (err) {
      if ((err as Error).message?.includes('not found')) {
        clearStoredCartId();
        setCart(null);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch cart');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const storedCartId = getStoredCartId();
    if (storedCartId) {
      fetchCart(storedCartId);
    }
  }, [fetchCart]);

  const createCart = useCallback(async (): Promise<string> => {
    try {
      const data = await fetchApi<{ cartId: string; checkoutUrl: string }>(
        'shopify-cart/create',
        { method: 'POST', body: JSON.stringify({}) }
      );
      setStoredCartId(data.cartId);
      return data.cartId;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to create cart');
    }
  }, []);

  const addToCart = useCallback(async (variantId: string, quantity = 1) => {
    try {
      setLoading(true);
      setError(null);

      let cartId = getStoredCartId();
      if (!cartId) {
        cartId = await createCart();
      }

      await fetchApi('shopify-cart/add', {
        method: 'POST',
        body: JSON.stringify({ cartId, variantId, quantity }),
      });

      await fetchCart(cartId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add to cart');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [createCart, fetchCart]);

  const updateQuantity = useCallback(async (lineId: string, quantity: number) => {
    const cartId = getStoredCartId();
    if (!cartId) return;

    try {
      setLoading(true);
      setError(null);

      if (quantity === 0) {
        await fetchApi('shopify-cart/remove', {
          method: 'POST',
          body: JSON.stringify({ cartId, lineIds: [lineId] }),
        });
      } else {
        await fetchApi('shopify-cart/update', {
          method: 'POST',
          body: JSON.stringify({ cartId, lines: [{ lineId, quantity }] }),
        });
      }

      await fetchCart(cartId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update cart');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchCart]);

  const removeFromCart = useCallback(async (lineId: string) => {
    await updateQuantity(lineId, 0);
  }, [updateQuantity]);

  const checkout = useCallback(() => {
    if (cart?.checkoutUrl) {
      window.open(cart.checkoutUrl, '_blank');
    }
  }, [cart]);

  const clearCart = useCallback(() => {
    clearStoredCartId();
    setCart(null);
  }, []);

  return {
    cart,
    loading,
    error,
    addToCart,
    updateQuantity,
    removeFromCart,
    checkout,
    clearCart,
    refetch: fetchCart,
    totalQuantity: cart?.totalQuantity || 0,
  };
}
