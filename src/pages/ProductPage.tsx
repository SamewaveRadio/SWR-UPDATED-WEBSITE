import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Minus, Plus, ShoppingBag, ChevronLeft, ChevronRight } from 'lucide-react';
import { useProduct } from '../hooks/usePrintify';
import { useManualProductBySlug } from '../hooks/useManualProducts';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { useCartContext } from '../contexts/CartContext';
import { Navigation } from '../components/Navigation';

export function ProductPage() {
  const { productId } = useParams<{ productId: string }>();

  const printifyHook = useProduct(productId);
  const { session } = useAdminAuth();
  const isAdmin = Boolean(session);
  const manualHook = useManualProductBySlug(productId, isAdmin);

  const product = printifyHook.product ?? manualHook.product;
  const loading = !product && (printifyHook.loading || manualHook.loading);
  const error = product ? null : (printifyHook.error ?? manualHook.error);
  const visibility = manualHook.visibility;
  const isUnlisted = visibility === 'unlisted';
  const isManual = manualHook.product !== null;

  const { addToCart, loading: cartLoading } = useCartContext();

  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [adding, setAdding] = useState(false);

  const colors = useMemo(() => {
    if (!product) return [];
    const set = new Set<string>();
    product.variants.forEach((v) => {
      if (v.color) set.add(v.color);
    });
    return Array.from(set);
  }, [product]);

  const sizes = useMemo(() => {
    if (!product) return [];
    const set = new Set<string>();
    product.variants.forEach((v) => {
      if (v.size) set.add(v.size);
    });
    return Array.from(set);
  }, [product]);

  const activeVariant = useMemo(() => {
    if (!product || product.variants.length === 0) return null;
    return (
      product.variants.find(
        (v) =>
          (selectedColor ? v.color === selectedColor : true) &&
          (selectedSize ? v.size === selectedSize : true)
      ) ?? product.variants[0]
    );
  }, [product, selectedColor, selectedSize]);

  useEffect(() => {
    if (product) {
      document.title = `${product.title} — Samewave Radio`;
    }

    // Add noindex/nofollow for unlisted, draft, and archived products
    let noindexMeta: HTMLMetaElement | null = null;
    const needsNoindex = isUnlisted || (isManual && (visibility === 'draft' || visibility === 'archived'));
    if (needsNoindex) {
      noindexMeta = document.createElement('meta');
      noindexMeta.name = 'robots';
      noindexMeta.content = 'noindex, nofollow';
      document.head.appendChild(noindexMeta);
    }

    return () => {
      document.title = 'Samewave Radio';
      if (noindexMeta) {
        document.head.removeChild(noindexMeta);
      }
    };
  }, [product, isUnlisted, isManual, visibility]);

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [productId]);

  const handleAddToCart = async () => {
    if (!activeVariant || !product) return;

    // Archived and draft products cannot be purchased (manual products only)
    if (isManual && (visibility === 'archived' || visibility === 'draft')) {
      return;
    }

    setAdding(true);
    try {
      addToCart(
        {
          productId: product.id,
          variantId: activeVariant.variantId,
          source: isManual ? 'manual' : 'printify',
          internalProductId: isManual ? (product._internalProductId ?? null) : null,
          internalVariantId: isManual ? (activeVariant._internalVariantId ?? null) : null,
          slug: isManual ? (product._slug ?? null) : null,
          title: product.title,
          variantTitle: activeVariant.title,
          color: activeVariant.color,
          size: activeVariant.size,
          price: activeVariant.price,
          priceCents: activeVariant.priceCents,
          imageUrl: product.mockupImages[0]?.src ?? null,
        },
        quantity
      );
    } finally {
      setAdding(false);
    }
  };

  const nextImage = () => {
    if (product && product.mockupImages.length > 1) {
      setCurrentImageIndex((prev) => (prev + 1) % product.mockupImages.length);
    }
  };

  const prevImage = () => {
    if (product && product.mockupImages.length > 1) {
      setCurrentImageIndex(
        (prev) => (prev - 1 + product.mockupImages.length) % product.mockupImages.length
      );
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

  // Draft and archived manual products are not-found for public visitors
  // Admins with a valid session can preview them
  if (isManual && (visibility === 'draft' || visibility === 'archived') && !isAdmin) {
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
                Product not found
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const canPurchase = !(isManual && (visibility === 'archived' || visibility === 'draft'));

  const hasMultipleImages = product.mockupImages.length > 1;

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
                {product.mockupImages.length > 0 ? (
                  <img
                    src={product.mockupImages[currentImageIndex].src}
                    alt={product.title}
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
                    {product.mockupImages.map((_, idx) => (
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

              {hasMultipleImages && (
                <div className="mt-4 grid grid-cols-5 gap-2">
                  {product.mockupImages.slice(0, 5).map((image, idx) => (
                    <button
                      key={image.id}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={`aspect-square rounded overflow-hidden border-2 transition-colors ${
                        idx === currentImageIndex
                          ? 'border-white'
                          : 'border-transparent hover:border-white/40'
                      }`}
                    >
                      <img
                        src={image.src}
                        alt={product.title}
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

              {isUnlisted && (
                <div className="mb-4 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-yellow-200/80 text-xs">
                  This product is unlisted. It will not appear in the public shop, but the direct link can be shared. This is not true access control — anyone with the URL can view and purchase it.
                </div>
              )}

              {!canPurchase && (
                <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-red-200/80 text-xs">
                  This product is not available for purchase.
                </div>
              )}

              {activeVariant && (
                <div className="flex items-baseline gap-3 mb-6">
                  <span className="text-xl sm:text-2xl text-white font-medium">
                    {activeVariant.price}
                  </span>
                </div>
              )}

              {colors.length > 0 && (
                <div className="mb-6">
                  <label className="block text-white/60 text-sm mb-2">
                    Color
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {colors.map((color) => (
                      <button
                        key={color}
                        onClick={() => setSelectedColor(color)}
                        className={`px-4 py-2 text-sm border transition-colors ${
                          selectedColor === color
                            ? 'border-white bg-white text-black'
                            : 'border-white/20 text-white hover:border-white/40'
                        }`}
                      >
                        {color}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {sizes.length > 0 && (
                <div className="mb-6">
                  <label className="block text-white/60 text-sm mb-2">
                    Size
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {sizes.map((size) => {
                      const variantAvailable = product.variants.some(
                        (v) =>
                          v.size === size &&
                          (selectedColor ? v.color === selectedColor : true)
                      );
                      return (
                        <button
                          key={size}
                          onClick={() => setSelectedSize(size)}
                          disabled={!variantAvailable}
                          className={`px-4 py-2 text-sm border transition-colors ${
                            selectedSize === size
                              ? 'border-white bg-white text-black'
                              : variantAvailable
                              ? 'border-white/20 text-white hover:border-white/40'
                              : 'border-white/10 text-white/30 cursor-not-allowed'
                          }`}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
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
                  disabled={!activeVariant || cartLoading || adding || !canPurchase}
                  className="flex-1 py-3 px-6 bg-white text-black font-medium text-sm tracking-wide hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {!canPurchase ? 'NOT AVAILABLE' : adding ? 'ADDING...' : 'ADD TO CART'}
                </button>
              </div>


            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
