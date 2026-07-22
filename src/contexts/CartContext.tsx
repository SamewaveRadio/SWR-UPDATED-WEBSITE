import { createContext, useContext, ReactNode } from 'react';
import { useCart } from '../hooks/usePrintify';
import { CartItem } from '../types';

interface CartContextType {
  items: CartItem[];
  loading: boolean;
  error: string | null;
  addToCart: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  updateQuantity: (productId: number, variantId: number, quantity: number) => void;
  removeFromCart: (productId: number, variantId: number) => void;
  clearCart: () => void;
  refetch: () => void;
  totalQuantity: number;
  subtotalCents: number;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const cartState = useCart();

  return (
    <CartContext.Provider value={cartState}>
      {children}
    </CartContext.Provider>
  );
}

export function useCartContext() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCartContext must be used within a CartProvider');
  }
  return context;
}
