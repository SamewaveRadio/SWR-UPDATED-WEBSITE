import { Link } from 'react-router-dom';
import { ShoppingBag, ArrowLeft } from 'lucide-react';
import { useEffect } from 'react';
import { useProducts } from '../hooks/usePrintify';
import { Navigation } from '../components/Navigation';
import { PrintifyProduct } from '../types';

function ProductCard({ product }: { product: PrintifyProduct }) {
  const defaultImage = product.mockupImages[0];
  const hoverImage = product.mockupImages[1];
  const hasHover = Boolean(hoverImage);

  return (
    <Link
      to={`/shop/${product.id}`}
      className="group bg-black flex flex-col hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20"
    >
      <div className="aspect-square bg-white/5 flex items-center justify-center overflow-hidden relative">
        {defaultImage ? (
          <>
            <img
              src={defaultImage.src}
              alt={product.title}
              className="w-full h-full object-cover transition-opacity duration-500 group-hover:opacity-0"
            />
            {hasHover && (
              <img
                src={hoverImage.src}
                alt={product.title}
                className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              />
            )}
          </>
        ) : (
          <ShoppingBag className="w-12 h-12 text-white/20" />
        )}
      </div>

      <div className="p-3 sm:p-4 flex flex-col flex-1 border-t border-white/10">
        <h3 className="text-white text-xs sm:text-sm font-medium mb-1 group-hover:text-white/80 transition-colors line-clamp-2">
          {product.title}
        </h3>

        <div className="mt-auto pt-2 flex items-center justify-between gap-2">
          <span className="text-white text-sm sm:text-base font-medium">
            {product.variants[0]?.price ?? '—'}
          </span>

          {product.variants.length > 1 && (
            <span className="text-white/40 text-[10px] sm:text-xs uppercase tracking-wide">
              {product.variants.length} options
            </span>
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

export function ShopPage() {
  const { products, loading, error } = useProducts();

  useEffect(() => {
    document.title = 'Shop — Samewave Radio';
    return () => {
      document.title = 'Samewave Radio';
    };
  }, []);

  return (
    <div className="min-h-screen bg-black pb-32 sm:pb-36">
      <Navigation />
      <div className="pt-20 sm:pt-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-white/60 hover:text-white text-sm mb-6 sm:mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>

          <h1 className="text-2xl sm:text-3xl font-light text-white tracking-wide mb-8">
            Shop
          </h1>

          {error ? (
            <div className="py-16 text-center text-white/40">
              Unable to load products. Please try again later.
            </div>
          ) : loading && products.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <ProductSkeleton key={i} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="py-16 text-center text-white/40">
              No products available.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
