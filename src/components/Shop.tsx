import { Link } from 'react-router-dom';
import { ShoppingBag, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { useProducts } from '../hooks/useShopify';
import { useCartContext } from '../contexts/CartContext';
import { ShopifyProduct } from '../types';

function formatPrice(price: number, currencyCode: string) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currencyCode,
  }).format(price);
}

function ProductCard({ product }: { product: ShopifyProduct }) {
  const { addToCart, loading } = useCartContext();
  const [adding, setAdding] = useState(false);

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!product.availableForSale) return;

    setAdding(true);
    try {
      await addToCart(product.id);
    } catch {
    } finally {
      setAdding(false);
    }
  };

  return (
    <Link
      to={`/shop/${product.handle}`}
      className="group bg-black flex flex-col hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20"
    >
      <div className="aspect-square bg-white/5 flex items-center justify-center overflow-hidden">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.imageAlt}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <ShoppingBag className="w-12 h-12 text-white/20" />
        )}
      </div>

      <div className="p-3 sm:p-4 flex flex-col flex-1 border-t border-white/10">
        <h3 className="text-white text-xs sm:text-sm font-medium mb-1 group-hover:text-white/80 transition-colors line-clamp-2">
          {product.title}
        </h3>

        <div className="mt-auto pt-2 flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-white text-sm sm:text-base font-medium">
              {formatPrice(product.price, product.currencyCode)}
            </span>
            {product.compareAtPrice && (
              <span className="text-white/40 text-xs line-through">
                {formatPrice(product.compareAtPrice, product.currencyCode)}
              </span>
            )}
          </div>

          {!product.availableForSale ? (
            <span className="text-white/40 text-[10px] sm:text-xs uppercase tracking-wide">
              Sold out
            </span>
          ) : (
            <button
              onClick={handleAddToCart}
              disabled={loading || adding}
              className="p-1.5 sm:p-2 bg-white/10 hover:bg-white/20 text-white rounded transition-colors disabled:opacity-50"
              aria-label="Add to cart"
            >
              <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          )}
        </div>
      </div>
    </Link>
  );
}

function ProductSkeleton() {
  return (
    <div className="bg-black animate-pulse">
      <div className="aspect-square bg-white/5" />
      <div className="p-3 sm:p-4 border-t border-white/10">
        <div className="h-4 bg-white/10 rounded mb-2 w-3/4" />
        <div className="h-4 bg-white/10 rounded w-1/3" />
      </div>
    </div>
  );
}

export function Shop() {
  const { products, loading, error, hasMore, loadMore } = useProducts(8);
  const [isExpanded, setIsExpanded] = useState(false);

  const displayedProducts = isExpanded ? products : products.slice(0, 4);

  if (error) {
    return (
      <section id="shop" className="py-12 sm:py-16 px-4 sm:px-6 border-b border-white/10">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-light text-white tracking-wide mb-6 sm:mb-8">
            Shop
          </h2>
          <div className="py-8 sm:py-12 text-center text-white/40 text-sm">
            Unable to load products. Please try again later.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="shop" className="py-12 sm:py-16 px-4 sm:px-6 border-b border-white/10">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-light text-white tracking-wide">
            Shop
          </h2>
          <Link
            to="/shop"
            className="text-white/60 hover:text-white text-xs sm:text-sm tracking-wide transition-colors"
          >
            View all
          </Link>
        </div>

        {loading && products.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-white/10">
            {Array.from({ length: 4 }).map((_, i) => (
              <ProductSkeleton key={i} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="py-8 sm:py-12 text-center text-white/40 text-sm">
            No products available.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-white/10">
              {displayedProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            {(products.length > 4 || hasMore) && (
              <div className="mt-6 sm:mt-8 text-center">
                <button
                  onClick={() => {
                    if (!isExpanded && hasMore) {
                      loadMore();
                    }
                    setIsExpanded(!isExpanded);
                  }}
                  className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-white/5 text-white text-xs sm:text-sm tracking-wide hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
                >
                  {isExpanded ? (
                    <>
                      SHOW LESS
                      <ChevronUp className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      SHOW MORE
                      <ChevronDown className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
