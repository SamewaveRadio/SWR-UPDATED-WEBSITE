import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Lock, Minus, Plus, ShoppingBag, ChevronLeft, ChevronRight } from 'lucide-react';
import { useProduct } from '../hooks/usePrintify';
import { useManualProductBySlug } from '../hooks/useManualProducts';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { useCartContext } from '../contexts/CartContext';
import { Navigation } from '../components/Navigation';
import type { PrintifyMockupImage } from '../types';

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
  const passwordRequired = manualHook.passwordRequired;

  const { addToCart, loading: cartLoading } = useCartContext();

  const [selectedColorwayId, setSelectedColorwayId] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  const colorways = useMemo(() => {
    if (!product?._colorways) return [];
    return product._colorways.filter(cw => cw.isActive);
  }, [product]);

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

  // Gallery shows ALL product images, ordered: general primary first, then
  // each colorway's primary + images, then remaining general images.
  const galleryImages = useMemo<PrintifyMockupImage[]>(() => {
    if (!product) return [];
    if (colorways.length === 0) return product.mockupImages;

    const seen = new Set<string>();
    const ordered: PrintifyMockupImage[] = [];

    const push = (img: PrintifyMockupImage | undefined) => {
      if (img && !seen.has(img.src)) {
        ordered.push(img);
        seen.add(img.src);
      }
    };

    // General primary first
    push(product.mockupImages.find((img) => !img.colorwayId && img.isPrimary));

    // Each colorway: primary, then other images for that colorway
    for (const cw of colorways) {
      push(product.mockupImages.find((img) => img.colorwayId === cw.id && img.isPrimary));
      for (const img of product.mockupImages) {
        if (img.colorwayId === cw.id && !img.isPrimary) push(img);
      }
    }

    // Remaining general images
    for (const img of product.mockupImages) {
      if (!img.colorwayId && !img.isPrimary) push(img);
    }

    // Any images not yet included (safety net)
    for (const img of product.mockupImages) push(img);

    return ordered.length > 0 ? ordered : product.mockupImages;
  }, [product, colorways]);

  // Index of the selected colorway's primary image in the gallery
  const colorwayPrimaryIndex = useMemo(() => {
    if (!product || !selectedColorwayId || colorways.length === 0) return 0;
    const primary = galleryImages.findIndex(
      (img) => img.colorwayId === selectedColorwayId && img.isPrimary
    );
    if (primary >= 0) return primary;
    // Fallback: first image for this colorway
    const first = galleryImages.findIndex((img) => img.colorwayId === selectedColorwayId);
    return first >= 0 ? first : 0;
  }, [product, galleryImages, selectedColorwayId, colorways]);

  // Jump to the selected colorway's primary image
  useEffect(() => {
    setCurrentImageIndex(colorwayPrimaryIndex);
  }, [colorwayPrimaryIndex, productId]);

  // Preload nearby colorway images
  const preloadRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!product || colorways.length === 0) return;
    for (const cw of colorways) {
      const cwImages = product.mockupImages.filter((img) => img.colorwayId === cw.id);
      for (const img of cwImages.slice(0, 1)) {
        if (!preloadRef.current.has(img.src)) {
          preloadRef.current.add(img.src);
          const link = document.createElement('link');
          link.rel = 'preload';
          link.as = 'image';
          link.href = img.src;
          document.head.appendChild(link);
        }
      }
    }
  }, [product, colorways]);

  // Auto-select first colorway if product has colorways
  useEffect(() => {
    if (colorways.length > 0 && !selectedColorwayId) {
      setSelectedColorwayId(colorways[0].id);
    }
  }, [colorways, selectedColorwayId]);

  // Auto-select first color for Printify products without colorways
  useEffect(() => {
    if (colorways.length === 0 && colors.length > 0 && !selectedColor) {
      setSelectedColor(colors[0]);
    }
  }, [colorways, colors, selectedColor]);

  // Resolve the colorway name for the selected colorwayId (for fallback matching)
  const selectedColorwayName = useMemo(() => {
    if (!selectedColorwayId || !product?._colorways) return null;
    const cw = product._colorways.find(c => c.id === selectedColorwayId);
    return cw?.name ?? null;
  }, [product, selectedColorwayId]);

  const activeVariant = useMemo(() => {
    if (!product || product.variants.length === 0) return null;

    // If colorways exist, filter by selected colorway
    if (colorways.length > 0 && selectedColorwayId) {
      const matching = product.variants.find(
        (v) =>
          (v._colorwayId === selectedColorwayId || (!v._colorwayId && selectedColorwayName && v.color === selectedColorwayName)) &&
          (selectedSize ? v.size === selectedSize : true)
      );
      if (matching) return matching;
    }

    // Printify products without colorways: filter by selected color
    if (colorways.length === 0 && selectedColor) {
      const matching = product.variants.find(
        (v) =>
          v.color === selectedColor &&
          (selectedSize ? v.size === selectedSize : true)
      );
      if (matching) return matching;
    }

    // Fallback: match by color string (legacy / Printify)
    return (
      product.variants.find(
        (v) =>
          (selectedColorwayId
            ? v._colorwayId === selectedColorwayId || (!v._colorwayId && selectedColorwayName && v.color === selectedColorwayName)
            : true) &&
          (selectedSize ? v.size === selectedSize : true)
      ) ?? product.variants[0]
    );
  }, [product, selectedColorwayId, selectedColor, selectedSize, colorways, selectedColorwayName]);

  // Available sizes for the selected colorway (or selected color for Printify)
  const availableSizes = useMemo(() => {
    if (!product) return new Set<string>();
    const set = new Set<string>();
    product.variants.forEach((v) => {
      if (!v.size) return;
      if (colorways.length === 0) {
        // Printify without colorways: filter by selected color
        if (selectedColor && v.color !== selectedColor) return;
        set.add(v.size);
        return;
      }
      if (!selectedColorwayId) {
        set.add(v.size);
        return;
      }
      // Match by colorway_id, or fall back to color name if colorway_id is null
      if (v._colorwayId === selectedColorwayId) {
        set.add(v.size);
      } else if (!v._colorwayId && selectedColorwayName && v.color === selectedColorwayName) {
        set.add(v.size);
      }
    });
    return set;
  }, [product, selectedColorwayId, selectedColor, colorways, selectedColorwayName]);

  useEffect(() => {
    if (product) {
      document.title = `${product.title} — Samewave Radio`;
    }

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

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput) return;
    setPasswordError(false);
    manualHook.fetchProduct(passwordInput);
  };

  useEffect(() => {
    if (manualHook.passwordRequired && passwordInput) {
      setPasswordError(true);
    }
  }, [manualHook.passwordRequired, passwordInput]);

  const handleAddToCart = async () => {
    if (!activeVariant || !product) return;

    if (isManual && (visibility === 'archived' || visibility === 'draft')) {
      return;
    }

    // Find the colorway name and thumbnail for the selected colorway
    let colorwayName: string | null = null;
    let colorwayImageUrl: string | null = null;

    if (selectedColorwayId && product._colorways) {
      const cw = product._colorways.find((c) => c.id === selectedColorwayId);
      if (cw) colorwayName = cw.name;
    }

    // Use colorway primary image for thumbnail, fall back to first gallery image
    if (selectedColorwayId) {
      const primaryImg = product.mockupImages.find(
        (img) => img.colorwayId === selectedColorwayId && img.isPrimary
      );
      if (primaryImg) {
        colorwayImageUrl = primaryImg.src;
      } else {
        const anyColorwayImg = product.mockupImages.find(
          (img) => img.colorwayId === selectedColorwayId
        );
        if (anyColorwayImg) colorwayImageUrl = anyColorwayImg.src;
      }
    }

    // Fallback to general primary or first image
    if (!colorwayImageUrl) {
      const generalPrimary = product.mockupImages.find(
        (img) => !img.colorwayId && img.isPrimary
      );
      colorwayImageUrl = generalPrimary?.src ?? product.mockupImages[0]?.src ?? null;
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
          imageUrl: colorwayImageUrl,
          colorwayId: isManual ? (selectedColorwayId ?? null) : null,
          colorwayName: isManual ? colorwayName : null,
          colorwayImageUrl: isManual ? colorwayImageUrl : null,
          shippingClass: isManual ? (product._shippingClass ?? 'standard') : 'printify',
        },
        quantity
      );
    } finally {
      setAdding(false);
    }
  };

  const nextImage = () => {
    if (galleryImages.length > 1) {
      setCurrentImageIndex((prev) => (prev + 1) % galleryImages.length);
    }
  };

  const prevImage = () => {
    if (galleryImages.length > 1) {
      setCurrentImageIndex(
        (prev) => (prev - 1 + galleryImages.length) % galleryImages.length
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

  if (passwordRequired && !product) {
    return (
      <div className="min-h-screen bg-black">
        <Navigation />
        <div className="pt-20 sm:pt-24 px-4 sm:px-6">
          <div className="max-w-md mx-auto">
            <Link
              to="/shop"
              className="inline-flex items-center gap-2 text-white/60 hover:text-white text-sm mb-8 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Shop
            </Link>
            <div className="bg-white/5 border border-white/10 rounded-lg p-8">
              <div className="flex items-center gap-3 mb-6">
                <Lock className="w-6 h-6 text-white/60" />
                <h1 className="text-xl font-light text-white">Password Required</h1>
              </div>
              <p className="text-white/50 text-sm mb-6">
                This product is password protected. Enter the password to view it.
              </p>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    setPasswordError(false);
                  }}
                  placeholder="Enter password"
                  autoFocus
                  className={`w-full px-4 py-3 bg-white/5 text-white text-sm rounded border ${
                    passwordError ? 'border-red-500/50' : 'border-white/10'
                  } focus:outline-none focus:border-white/30 placeholder-white/30`}
                />
                {passwordError && (
                  <p className="text-red-400/80 text-xs">Incorrect password. Please try again.</p>
                )}
                <button
                  type="submit"
                  className="w-full py-3 bg-white text-black font-medium text-sm tracking-wide hover:bg-white/90 transition-colors"
                >
                  Unlock
                </button>
              </form>
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
  const hasMultipleImages = galleryImages.length > 1;
  const safeImageIndex = Math.min(currentImageIndex, galleryImages.length - 1);

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
                {galleryImages.length > 0 ? (
                  <img
                    key={galleryImages[safeImageIndex]?.src}
                    src={galleryImages[safeImageIndex]?.src}
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
                    {galleryImages.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentImageIndex(idx)}
                        className={`w-2 h-2 rounded-full transition-colors ${
                          idx === safeImageIndex ? 'bg-white' : 'bg-white/40'
                        }`}
                        aria-label={`View image ${idx + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}

              {hasMultipleImages && (
                <div className="mt-4 grid grid-cols-5 gap-2">
                  {galleryImages.slice(0, 10).map((image, idx) => (
                    <button
                      key={image.id + '-' + idx}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={`aspect-square rounded overflow-hidden border-2 transition-colors ${
                        idx === safeImageIndex
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

              {!canPurchase && (
                <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-red-200/80 text-xs">
                  This product is not available for purchase.
                </div>
              )}

              {isUnlisted && product.description && (
                <div className="mb-6 text-white/70 text-sm leading-relaxed whitespace-pre-line">
                  {product.description}
                </div>
              )}

              {activeVariant && (
                <div className="flex items-baseline gap-3 mb-6">
                  <span className="text-xl sm:text-2xl text-white font-medium">
                    {activeVariant.price}
                  </span>
                </div>
              )}

              {/* Colorway selector */}
              {colorways.length > 0 && (
                <div className="mb-6">
                  <label className="block text-white/60 text-sm mb-2">
                    Color
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {colorways.map((cw) => (
                      <button
                        key={cw.id}
                        onClick={() => {
                          setSelectedColorwayId(cw.id);
                          setSelectedSize(null);
                        }}
                        className={`flex items-center gap-2 px-4 py-2 text-sm border transition-colors ${
                          selectedColorwayId === cw.id
                            ? 'border-white bg-white text-black'
                            : 'border-white/20 text-white hover:border-white/40'
                        }`}
                      >
                        {cw.hexColor && (
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-white/20"
                            style={{ backgroundColor: cw.hexColor }}
                          />
                        )}
                        {cw.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Color selector (Printify products without colorways) */}
              {colorways.length === 0 && colors.length > 0 && (
                <div className="mb-6">
                  <label className="block text-white/60 text-sm mb-2">
                    Color
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {colors.map((color) => (
                      <button
                        key={color}
                        onClick={() => {
                          setSelectedColor(color);
                          setSelectedSize(null);
                        }}
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
                      const variantAvailable = availableSizes.has(size);
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
