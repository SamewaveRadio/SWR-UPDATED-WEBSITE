import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, X, Eye, Copy, Pencil, Package, Search,
  Save, Send, Archive, AlertCircle, Loader2, Trash2,
} from 'lucide-react';
import {
  useAdminProducts,
  useAdminProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../hooks/useAdminProducts';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import type { ProductVisibility, AdminProductListItem } from '../types';

type FilterTab = 'all' | ProductVisibility;

const VISIBILITY_LABELS: Record<ProductVisibility, string> = {
  public: 'Public',
  unlisted: 'Unlisted',
  draft: 'Draft',
  archived: 'Archived',
};

const INVENTORY_LABELS: Record<string, string> = {
  in_stock: 'In Stock',
  out_of_stock: 'Out of Stock',
  backorder: 'Backorder',
  not_tracked: 'Not Tracked',
};

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface VariantRow {
  id?: string;
  sku: string;
  title: string;
  options: Record<string, string>;
  priceCents: number;
  inventoryQuantity: number;
}

interface ImageRow {
  id?: string;
  src: string;
  alt: string;
  position: number;
}

function ProductList() {
  const { items, loading, error, refetch } = useAdminProducts();
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const filtered = items.filter((item) => {
    if (filter !== 'all' && item.visibility !== filter) return false;
    if (search && !item.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleSaved = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    refetch();
  }, [refetch]);

  if (showForm || editingId) {
    return (
      <ProductForm
        productId={editingId}
        onClose={() => { setShowForm(false); setEditingId(null); }}
        onSaved={handleSaved}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-light text-white">Products</h2>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors rounded"
        >
          <Plus className="w-4 h-4" />
          Add Manual Product
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['all', 'public', 'unlisted', 'draft', 'archived'] as FilterTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              filter === tab
                ? 'bg-white text-black'
                : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            {tab === 'all' ? 'All' : VISIBILITY_LABELS[tab]}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="pl-8 pr-3 py-1.5 bg-white/5 text-white text-sm rounded border border-white/10 focus:outline-none focus:border-white/30"
          />
        </div>
      </div>

      {loading && (
        <div className="py-12 text-center text-white/40 text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading products...
        </div>
      )}

      {error && (
        <div className="py-8 text-center text-red-400 text-sm flex items-center justify-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="py-12 text-center text-white/40 text-sm">
          No products found.
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10 text-white/40 text-xs uppercase tracking-wider">
                <th className="py-3 pr-4 font-normal">Image</th>
                <th className="py-3 pr-4 font-normal">Title</th>
                <th className="py-3 pr-4 font-normal">Source</th>
                <th className="py-3 pr-4 font-normal">Price</th>
                <th className="py-3 pr-4 font-normal">Visibility</th>
                <th className="py-3 pr-4 font-normal">Inventory</th>
                <th className="py-3 pr-4 font-normal">Updated</th>
                <th className="py-3 pr-4 font-normal text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <ProductRow key={item.id} item={item} onEdit={() => setEditingId(item.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProductRow({ item, onEdit }: { item: AdminProductListItem; onEdit: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/shop/${item.slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleArchive = async () => {
    if (!confirm(`Archive "${item.title}"? It will no longer be purchasable but remains connected to historical orders.`)) return;
    try {
      await updateProduct({ id: item.id, visibility: 'archived' });
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to archive product');
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Permanently delete "${item.title}"? This cannot be undone.`)) return;
    try {
      await deleteProduct(item.id);
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete product');
    }
  };

  return (
    <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
      <td className="py-3 pr-4">
        {item.primaryImageSrc ? (
          <img src={item.primaryImageSrc} alt={item.title} className="w-10 h-10 object-cover rounded" />
        ) : (
          <div className="w-10 h-10 bg-white/5 rounded flex items-center justify-center">
            <Package className="w-4 h-4 text-white/20" />
          </div>
        )}
      </td>
      <td className="py-3 pr-4 text-white text-sm font-medium">{item.title}</td>
      <td className="py-3 pr-4">
        <span className={`text-xs px-2 py-0.5 rounded ${item.source === 'printify' ? 'bg-blue-500/20 text-blue-300' : 'bg-green-500/20 text-green-300'}`}>
          {item.source}
        </span>
      </td>
      <td className="py-3 pr-4 text-white/70 text-sm">{formatPrice(item.basePriceCents)}</td>
      <td className="py-3 pr-4">
        <span className={`text-xs px-2 py-0.5 rounded ${
          item.visibility === 'public' ? 'bg-green-500/20 text-green-300' :
          item.visibility === 'unlisted' ? 'bg-yellow-500/20 text-yellow-300' :
          item.visibility === 'draft' ? 'bg-gray-500/20 text-gray-300' :
          'bg-red-500/20 text-red-300'
        }`}>
          {VISIBILITY_LABELS[item.visibility]}
        </span>
      </td>
      <td className="py-3 pr-4 text-white/60 text-xs">{INVENTORY_LABELS[item.inventoryStatus] ?? item.inventoryStatus}</td>
      <td className="py-3 pr-4 text-white/40 text-xs">{formatDate(item.updatedAt)}</td>
      <td className="py-3 pr-4">
        <div className="flex items-center justify-end gap-1">
          <Link
            to={`/shop/${item.slug}`}
            className="p-1.5 text-white/40 hover:text-white transition-colors"
            title="Preview"
          >
            <Eye className="w-4 h-4" />
          </Link>
          <button
            onClick={onEdit}
            className="p-1.5 text-white/40 hover:text-white transition-colors"
            title="Edit"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={handleCopyLink}
            className="p-1.5 text-white/40 hover:text-white transition-colors"
            title="Copy direct link"
          >
            {copied ? <span className="text-xs text-green-400">Copied!</span> : <Copy className="w-4 h-4" />}
          </button>
          {item.source === 'manual' && (
            <button
              onClick={handleArchive}
              className="p-1.5 text-white/40 hover:text-yellow-400 transition-colors"
              title="Archive"
            >
              <Archive className="w-4 h-4" />
            </button>
          )}
          {item.source === 'manual' && (
            <button
              onClick={handleDelete}
              className="p-1.5 text-white/40 hover:text-red-400 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

interface ProductFormProps {
  productId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

function ProductForm({ productId, onClose, onSaved }: ProductFormProps) {
  const isEditing = Boolean(productId);
  const { detail, loading: detailLoading } = useAdminProduct(productId);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [basePriceCents, setBasePriceCents] = useState(0);
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [shippingClass, setShippingClass] = useState('standard');
  const [visibility, setVisibility] = useState<ProductVisibility>('draft');
  const [trackInventory, setTrackInventory] = useState(false);
  const [allowBackorders, setAllowBackorders] = useState(false);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [images, setImages] = useState<ImageRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (detail) {
      const p = detail.product;
      setTitle(p.title);
      setSlug(p.slug);
      setSlugEdited(true);
      setDescription(p.description ?? '');
      setBasePriceCents(p.base_price_cents ?? 0);
      setSku(p.sku ?? '');
      setCategory(p.category ?? '');
      setTagsInput((p.tags ?? []).join(', '));
      setShippingClass(p.shipping_class ?? 'standard');
      setVisibility(p.visibility);
      setTrackInventory(p.track_inventory ?? false);
      setAllowBackorders(p.allow_backorders ?? false);
      setVariants(detail.variants.map(v => ({
        id: v.id,
        sku: v.sku ?? '',
        title: v.title,
        options: v.options ?? {},
        priceCents: v.price_cents,
        inventoryQuantity: detail.inventory[v.id] ?? 0,
      })));
      setImages(detail.images.map(img => ({
        id: img.id,
        src: img.src,
        alt: img.alt ?? '',
        position: img.position,
      })));
    }
  }, [detail]);

  useEffect(() => {
    if (!slugEdited && title) {
      setSlug(slugify(title));
    }
  }, [title, slugEdited]);

  const handleSlugChange = (value: string) => {
    setSlugEdited(true);
    setSlug(slugify(value) || value);
  };

  const addVariant = () => {
    setVariants(prev => [...prev, {
      sku: '',
      title: '',
      options: {},
      priceCents: basePriceCents,
      inventoryQuantity: 0,
    }]);
  };

  const updateVariant = (index: number, field: keyof VariantRow, value: string | number | Record<string, string>) => {
    setVariants(prev => prev.map((v, i) => i === index ? { ...v, [field]: value } : v));
  };

  const removeVariant = (index: number) => {
    setVariants(prev => prev.filter((_, i) => i !== index));
  };

  const addImage = () => {
    setImages(prev => [...prev, { src: '', alt: '', position: prev.length }]);
  };

  const updateImage = (index: number, field: keyof ImageRow, value: string | number) => {
    setImages(prev => prev.map((img, i) => i === index ? { ...img, [field]: value } : img));
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const buildPayload = (targetVisibility: ProductVisibility) => ({
    id: productId ?? undefined,
    slug: slug.trim(),
    title: title.trim(),
    description,
    source: 'manual' as const,
    basePriceCents,
    sku: sku.trim() || undefined,
    category: category.trim() || undefined,
    tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
    shippingClass,
    visibility: targetVisibility,
    trackInventory,
    allowBackorders,
    variants: variants.map((v, i) => ({
      id: v.id,
      sku: v.sku.trim() || undefined,
      title: v.title.trim() || `Variant ${i + 1}`,
      options: v.options,
      priceCents: v.priceCents,
      inventoryQuantity: v.inventoryQuantity,
    })),
    images: images.filter(img => img.src.trim()).map((img, i) => ({
      id: img.id,
      src: img.src.trim(),
      alt: img.alt.trim() || undefined,
      position: i,
    })),
  });

  const handleSave = async (targetVisibility: ProductVisibility) => {
    if (!title.trim()) { setError('Title is required'); return; }
    if (!slug.trim()) { setError('Slug is required'); return; }

    setSaving(true);
    setError(null);

    try {
      if (isEditing) {
        await updateProduct(buildPayload(targetVisibility));
      } else {
        await createProduct(buildPayload(targetVisibility));
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  if (detailLoading && isEditing) {
    return (
      <div className="py-12 text-center text-white/40 text-sm flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading product...
      </div>
    );
  }

  const inputClass = 'w-full px-3 py-2 bg-white/5 text-white text-sm rounded border border-white/10 focus:outline-none focus:border-white/30 placeholder-white/30';
  const labelClass = 'block text-white/60 text-xs font-medium mb-1.5 uppercase tracking-wider';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-light text-white">
          {isEditing ? 'Edit Product' : 'Add Manual Product'}
        </h2>
        <button
          onClick={onClose}
          className="p-2 text-white/40 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-red-300 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-5">
        {/* Basic Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder="Product title"
            />
          </div>
          <div>
            <label className={labelClass}>Slug</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              className={inputClass}
              placeholder="auto-generated-from-title"
            />
            <p className="text-white/30 text-xs mt-1">URL: /shop/{slug || '...'}</p>
          </div>
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputClass} min-h-[100px] resize-y`}
            placeholder="Product description"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>Base Price (cents)</label>
            <input
              type="number"
              value={basePriceCents}
              onChange={(e) => setBasePriceCents(parseInt(e.target.value) || 0)}
              className={inputClass}
              placeholder="2500"
            />
            <p className="text-white/30 text-xs mt-1">{formatPrice(basePriceCents)}</p>
          </div>
          <div>
            <label className={labelClass}>SKU</label>
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className={inputClass}
              placeholder="BASE-SKU"
            />
          </div>
          <div>
            <label className={labelClass}>Category</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputClass}
              placeholder="Apparel"
            />
          </div>
          <div>
            <label className={labelClass}>Shipping Class</label>
            <select
              value={shippingClass}
              onChange={(e) => setShippingClass(e.target.value)}
              className={inputClass}
            >
              <option value="standard">Standard</option>
              <option value="express">Express</option>
              <option value="free">Free</option>
              <option value="pickup">Pickup</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Tags (comma-separated)</label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className={inputClass}
            placeholder="music, merch, limited"
          />
        </div>

        {/* Inventory Settings */}
        <div className="flex flex-wrap gap-6 pt-2">
          <label className="flex items-center gap-2 text-white/70 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={trackInventory}
              onChange={(e) => setTrackInventory(e.target.checked)}
              className="accent-white"
            />
            Track inventory
          </label>
          <label className="flex items-center gap-2 text-white/70 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={allowBackorders}
              onChange={(e) => setAllowBackorders(e.target.checked)}
              className="accent-white"
            />
            Allow backorders
          </label>
        </div>

        {/* Variants */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className={labelClass}>Variants</label>
            <button
              onClick={addVariant}
              className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add variant
            </button>
          </div>
          {variants.length === 0 && (
            <p className="text-white/30 text-xs">No variants. At least one variant is recommended.</p>
          )}
          <div className="space-y-2">
            {variants.map((v, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center bg-white/5 p-2 rounded">
                <input
                  type="text"
                  value={v.title}
                  onChange={(e) => updateVariant(i, 'title', e.target.value)}
                  className="col-span-3 px-2 py-1.5 bg-black/30 text-white text-xs rounded border border-white/10 focus:outline-none focus:border-white/30 placeholder-white/30"
                  placeholder="Variant title"
                />
                <input
                  type="text"
                  value={v.sku}
                  onChange={(e) => updateVariant(i, 'sku', e.target.value)}
                  className="col-span-2 px-2 py-1.5 bg-black/30 text-white text-xs rounded border border-white/10 focus:outline-none focus:border-white/30 placeholder-white/30"
                  placeholder="SKU"
                />
                <input
                  type="text"
                  value={v.options.color ?? ''}
                  onChange={(e) => updateVariant(i, 'options', { ...v.options, color: e.target.value })}
                  className="col-span-2 px-2 py-1.5 bg-black/30 text-white text-xs rounded border border-white/10 focus:outline-none focus:border-white/30 placeholder-white/30"
                  placeholder="Color"
                />
                <input
                  type="text"
                  value={v.options.size ?? ''}
                  onChange={(e) => updateVariant(i, 'options', { ...v.options, size: e.target.value })}
                  className="col-span-2 px-2 py-1.5 bg-black/30 text-white text-xs rounded border border-white/10 focus:outline-none focus:border-white/30 placeholder-white/30"
                  placeholder="Size"
                />
                <input
                  type="number"
                  value={v.priceCents}
                  onChange={(e) => updateVariant(i, 'priceCents', parseInt(e.target.value) || 0)}
                  className="col-span-1 px-2 py-1.5 bg-black/30 text-white text-xs rounded border border-white/10 focus:outline-none focus:border-white/30"
                  placeholder="Price"
                />
                {trackInventory && (
                  <input
                    type="number"
                    value={v.inventoryQuantity}
                    onChange={(e) => updateVariant(i, 'inventoryQuantity', parseInt(e.target.value) || 0)}
                    className="col-span-1 px-2 py-1.5 bg-black/30 text-white text-xs rounded border border-white/10 focus:outline-none focus:border-white/30"
                    placeholder="Qty"
                  />
                )}
                <button
                  onClick={() => removeVariant(i)}
                  className="col-span-1 p-1 text-white/30 hover:text-red-400 transition-colors flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Images */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className={labelClass}>Images</label>
            <button
              onClick={addImage}
              className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add image
            </button>
          </div>
          {images.length === 0 && (
            <p className="text-white/30 text-xs">No images. Add an image URL to show a product photo.</p>
          )}
          <div className="space-y-2">
            {images.map((img, i) => (
              <div key={i} className="flex gap-2 items-center bg-white/5 p-2 rounded">
                {img.src ? (
                  <img src={img.src} alt={img.alt} className="w-10 h-10 object-cover rounded flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 bg-black/30 rounded flex items-center justify-center flex-shrink-0">
                    <Package className="w-4 h-4 text-white/20" />
                  </div>
                )}
                <input
                  type="text"
                  value={img.src}
                  onChange={(e) => updateImage(i, 'src', e.target.value)}
                  className="flex-1 px-2 py-1.5 bg-black/30 text-white text-xs rounded border border-white/10 focus:outline-none focus:border-white/30 placeholder-white/30"
                  placeholder="Image URL"
                />
                <input
                  type="text"
                  value={img.alt}
                  onChange={(e) => updateImage(i, 'alt', e.target.value)}
                  className="w-32 px-2 py-1.5 bg-black/30 text-white text-xs rounded border border-white/10 focus:outline-none focus:border-white/30 placeholder-white/30"
                  placeholder="Alt text"
                />
                <button
                  onClick={() => removeImage(i)}
                  className="p-1 text-white/30 hover:text-red-400 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Unlisted Warning */}
        {visibility === 'unlisted' && (
          <div className="px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-yellow-200/80 text-xs">
            Unlisted products are accessible via their direct link. This is not true access control — anyone with the URL can view and purchase the product.
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
          <button
            onClick={() => handleSave('draft')}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors rounded disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            Save Draft
          </button>
          <button
            onClick={() => handleSave('unlisted')}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/20 text-yellow-200 text-sm font-medium hover:bg-yellow-500/30 transition-colors rounded disabled:opacity-50"
          >
            <Eye className="w-4 h-4" />
            Save as Unlisted
          </button>
          <button
            onClick={() => handleSave('public')}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-200 text-sm font-medium hover:bg-green-500/30 transition-colors rounded disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            Publish Publicly
          </button>
          <Link
            to={slug ? `/shop/${slug}` : '#'}
            target="_blank"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 text-white/70 text-sm font-medium hover:bg-white/10 transition-colors rounded"
          >
            <Eye className="w-4 h-4" />
            Preview
          </Link>
          {isEditing && (
            <button
              onClick={async () => {
                if (!confirm('Archive this product? It will no longer be purchasable but remains connected to historical orders.')) return;
                setSaving(true);
                try {
                  await updateProduct({ id: productId!, visibility: 'archived' });
                  onSaved();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to archive');
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-200 text-sm font-medium hover:bg-red-500/30 transition-colors rounded disabled:opacity-50 ml-auto"
            >
              <Archive className="w-4 h-4" />
              Archive
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminProducts() {
  const { user, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className="py-12 text-center text-white/40 text-sm flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="py-12 text-center text-white/40 text-sm">
        Please sign in to manage products.
      </div>
    );
  }

  return <ProductList />;
}
