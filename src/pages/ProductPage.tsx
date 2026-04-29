import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Minus, Plus, ShoppingBag, ChevronLeft, ChevronRight } from 'lucide-react';
import { useProduct } from '../hooks/useShopify';
import { useCartContext } from '../contexts/CartContext';
import { Navigation } from '../components/Navigation';
import { ShopifyProductVariant } from '../types';

function formatPrice(price: number, currencyCode: string) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currencyCode,
  }).format(price);
}

export function ProductPage() {
  const { handle } = useParams<{ handle: string }>();
  const { product, loading, error } = useProduct(handle);
  const { addToCart, loading: cartLoading } = useCartContext();

  const [selectedVariant, setSelectedVariant] = useState<ShopifyProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [adding, setAdding] = useState(false);

  const activeVariant = selectedVariant || product?.variants[0];

  useEffect(() => {
    if (product) {
      document.title = `${product.title} — Samewave Radio`;
    }
    return () => {
      document.title = 'Samewave Radio';
    };
  }, [product]);

  const handleAddToCart = async () => {
    if (!activeVariant || !activeVariant.availableForSale) return;

    setAdding(true);
    try {
      for (let i = 0; i < quantity; i++) {
        await addToCart(activeVariant.id);
      }
    } catch {
    } finally {
      setAdding(false);
    }
  };

  const nextImage = () => {
    if (product && product.images.length > 1) {
      setCurrentImageIndex((prev) => (prev + 1) % product.images.length);
    }
  };

  const prevImage = () => {
    if (product && product.images.length > 1) {
      setCurrentImageIndex((prev) => (prev - 1 + product.images.length) % product.images.length);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black">
        <Navigation />
        <div className="pt-20 sm:pt-24 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="animate-pulse">
              <div className="h-6 bg-white/10 rounded w-24 mb-8" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
                <div className="aspect-square bg-white/5 rounded" />
                <div className="space-y-4">
                  <div className="h-8 bg-white/10 rounded w-3/4" />
                  <div className="h-6 bg-white/10 rounded w-1/4" />
                  <div className="h-32 bg-white/5 rounded" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-black">
        <Navigation />
        <div className="pt-20 sm:pt-24 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <Link
              to="/shop"
              className="inline-flex items-center gap-2 text-white/60 hover:text-white text-sm mb-8 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Shop
            </Link>
            <div className="py-16 text-center">
              <p className="text-white/40 text-lg">
                {error || 'Product not found'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const hasMultipleImages = product.images.length > 1;
  const hasOptions = product.options.length > 0 && product.options[0].name !== 'Title';

  return (
    <div className="min-h-screen bg-black pb-32 sm:pb-36">
      <Navigation />
      <div className="pt-20 sm:pt-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
        <Link
          to="/shop"
          className="inline-flex items-center gap-2 text-white/60 hover:text-white text-sm mb-6 sm:mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Shop
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12">
          <div className="relative">
            <div className="aspect-square bg-white/5 rounded overflow-hidden">
              {product.images.length > 0 ? (
                <img
                  src={product.images[currentImageIndex].url}
                  alt={product.images[currentImageIndex].altText}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ShoppingBag className="w-16 h-16 text-white/20" />
                </div>
              )}
            </div>

            {hasMultipleImages && (
              <>
                <button
                  onClick={prevImage}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors"
                  aria-label="Next image"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                  {product.images.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        idx === currentImageIndex ? 'bg-white' : 'bg-white/40'
                      }`}
                      aria-label={`View image ${idx + 1}`}
                    />
                  ))}
                </div>
              </>
            )}

            {product.images.length > 1 && (
              <div className="mt-4 grid grid-cols-5 gap-2">
                {product.images.slice(0, 5).map((image, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`aspect-square rounded overflow-hidden border-2 transition-colors ${
                      idx === currentImageIndex
                        ? 'border-white'
                        : 'border-transparent hover:border-white/40'
                    }`}
                  >
                    <img
                      src={image.url}
                      alt={image.altText}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <h1 className="text-2xl sm:text-3xl font-light text-white mb-3">
              {product.title}
            </h1>

            {activeVariant && (
              <div className="flex items-baseline gap-3 mb-6">
                <span className="text-xl sm:text-2xl text-white font-medium">
                  {formatPrice(activeVariant.price, activeVariant.currencyCode)}
                </span>
                {activeVariant.compareAtPrice && (
                  <span className="text-white/40 line-through">
                    {formatPrice(activeVariant.compareAtPrice, activeVariant.currencyCode)}
                  </span>
                )}
              </div>
            )}

            {hasOptions && (
              <div className="mb-6 space-y-4">
                {product.options.map((option) => (
                  <div key={option.id}>
                    <label className="block text-white/60 text-sm mb-2">
                      {option.name}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {option.values.map((value) => {
                        const variant = product.variants.find((v) =>
                          v.selectedOptions.some(
                            (opt) => opt.name === option.name && opt.value === value
                          )
                        );
                        const isSelected = activeVariant?.selectedOptions.some(
                          (opt) => opt.name === option.name && opt.value === value
                        );
                        const isAvailable = variant?.availableForSale ?? false;

                        return (
                          <button
                            key={value}
                            onClick={() => variant && setSelectedVariant(variant)}
                            disabled={!isAvailable}
                            className={`px-4 py-2 text-sm border transition-colors ${
                              isSelected
                                ? 'border-white bg-white text-black'
                                : isAvailable
                                ? 'border-white/20 text-white hover:border-white/40'
                                : 'border-white/10 text-white/30 cursor-not-allowed'
                            }`}
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center border border-white/20">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="p-3 text-white hover:bg-white/10 transition-colors"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-12 text-center text-white">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  className="p-3 text-white hover:bg-white/10 transition-colors"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={handleAddToCart}
                disabled={!activeVariant?.availableForSale || cartLoading || adding}
                className="flex-1 py-3 px-6 bg-white text-black font-medium text-sm tracking-wide hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {!activeVariant?.availableForSale
                  ? 'SOLD OUT'
                  : adding
                  ? 'ADDING...'
                  : 'ADD TO CART'}
              </button>
            </div>

            {product.descriptionHtml && (
              <div className="border-t border-white/10 pt-6">
                <h3 className="text-white/60 text-sm mb-3 uppercase tracking-wide">
                  Description
                </h3>
                <div
                  className="text-white/80 text-sm leading-relaxed prose prose-invert prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
                />
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
