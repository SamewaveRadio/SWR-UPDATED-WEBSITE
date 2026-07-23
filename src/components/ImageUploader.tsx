import { useState, useRef, useCallback } from 'react';
import { Upload, X, Star, GripVertical, Loader2, AlertCircle, Image as ImageIcon, Link, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_IMAGES = 6;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface ProductImageRow {
  id?: string;
  src: string;
  alt: string;
  position: number;
  r2Key?: string | null;
  /** Marks images pending server confirmation — not yet saved to DB */
  pending?: boolean;
}

interface ImageUploaderProps {
  productId: string | null;
  images: ProductImageRow[];
  onImagesChange: (images: ProductImageRow[]) => void;
}

type UploadStatus = 'uploading' | 'inserting' | 'complete' | 'failed';

interface UploadState {
  fileName: string;
  progress: number;
  status: UploadStatus;
  error: string | null;
  localPreviewUrl: string | null;
  file: File | null;
}

function getAuthToken(): string | null {
  return localStorage.getItem('samewave-admin-token');
}

async function fetchPresign(productId: string, file: File): Promise<{
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
}> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/r2-presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      productId,
      contentType: file.type,
      fileSize: file.size,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? `Failed to get upload URL (${res.status})`);
  }
  return { uploadUrl: data.uploadUrl, objectKey: data.objectKey, publicUrl: data.publicUrl };
}

async function uploadToR2(
  uploadUrl: string,
  file: File,
  onProgress: (progress: number) => void,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      const ok = xhr.status >= 200 && xhr.status < 300;
      console.log('[ImageUploader] R2 PUT status:', xhr.status, 'ok:', ok);
      if (ok) {
        resolve(true);
      } else {
        reject(new Error(`R2 upload failed (HTTP ${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during R2 upload'));
    xhr.send(file);
  });
}

async function insertImageRecord(
  productId: string,
  objectKey: string,
  publicUrl: string,
  altText: string,
  position: number,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('product_images')
    .insert({
      product_id: productId,
      src: publicUrl,
      alt: altText || null,
      position,
      r2_key: objectKey,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[ImageUploader] DB insert error:', error.message, '(code:', error.code, ')');
    throw new Error(`Database insert failed: ${error.message}`);
  }

  console.log('[ImageUploader] DB insert success, image id:', data.id);
  return { id: data.id };
}

async function deleteR2Image(imageId: string): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/r2-delete-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ imageId }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? `Failed to delete image (${res.status})`);
  }
}

function verifyImageUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

export function ImageUploader({ productId, images, onImagesChange }: ImageUploaderProps) {
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExternalUrl, setShowExternalUrl] = useState(false);
  const [externalUrl, setExternalUrl] = useState('');
  const [externalAlt, setExternalAlt] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateUpload = (index: number, patch: Partial<UploadState>) => {
    setUploads((prev) => prev.map((u, i) => (i === index ? { ...u, ...patch } : u)));
  };

  const processFile = useCallback(async (file: File, uploadIndex: number) => {
    if (!productId) {
      setError('Save the product first before uploading images.');
      setUploads((prev) => prev.filter((_, i) => i !== uploadIndex));
      return;
    }

    updateUpload(uploadIndex, { status: 'uploading', progress: 0, error: null });

    try {
      // 1. Get presigned URL
      const { uploadUrl, objectKey, publicUrl } = await fetchPresign(productId, file);
      console.log('[ImageUploader] objectKey:', objectKey);

      // 2. Upload to R2
      await uploadToR2(uploadUrl, file, (progress) => {
        updateUpload(uploadIndex, { progress });
      });

      // 3. Insert DB record
      updateUpload(uploadIndex, { status: 'inserting' });
      const position = images.length + uploadIndex;
      const inserted = await insertImageRecord(productId, objectKey, publicUrl, '', position);

      // 4. Verify the public URL loads
      const urlWorks = await verifyImageUrl(publicUrl);
      console.log('[ImageUploader] publicUrl:', publicUrl, 'loads:', urlWorks);

      if (!urlWorks) {
        console.warn('[ImageUploader] Public URL did not load, but DB insert succeeded');
      }

      // 5. Replace local preview with final URL, clear pending state
      onImagesChange([
        ...images,
        {
          id: inserted.id,
          src: publicUrl,
          alt: '',
          position,
          r2Key: objectKey,
          pending: false,
        },
      ]);

      // 6. Revoke the temporary object URL
      const state = uploads[uploadIndex];
      if (state?.localPreviewUrl) {
        URL.revokeObjectURL(state.localPreviewUrl);
      }

      updateUpload(uploadIndex, { status: 'complete', progress: 100, localPreviewUrl: null, file: null });
      console.log('[ImageUploader] Upload complete for', file.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      console.error('[ImageUploader] Upload failed for', file.name, ':', msg);
      updateUpload(uploadIndex, { status: 'failed', error: msg });
      setError(msg);
    } finally {
      // Always clear uploading/inserting state so it can't be permanent
      setUploads((prev) =>
        prev.map((u, i) =>
          i === uploadIndex && u.status !== 'complete' && u.status !== 'failed'
            ? { ...u, status: 'failed', error: u.error ?? 'Upload interrupted' }
            : u,
        ),
      );
    }
  }, [productId, images, onImagesChange, uploads]);

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!productId) {
      setError('Save the product first before uploading images.');
      return;
    }

    if (images.length >= MAX_IMAGES) {
      setError(`Maximum ${MAX_IMAGES} images per product. Remove one before adding more.`);
      return;
    }

    setError(null);

    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`${file.name}: Only JPEG, PNG, and WebP images are allowed.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name}: File exceeds 10 MB limit.`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    // Create upload slots with local previews
    const newUploads: UploadState[] = validFiles.map((file) => ({
      fileName: file.name,
      progress: 0,
      status: 'uploading' as UploadStatus,
      error: null,
      localPreviewUrl: URL.createObjectURL(file),
      file,
    }));

    const startIndex = uploads.length;
    setUploads((prev) => [...prev, ...newUploads]);

    // Process each file sequentially
    for (let i = 0; i < validFiles.length; i++) {
      await processFile(validFiles[i], startIndex + i);
    }

    // Clear completed uploads after a delay
    setTimeout(() => {
      setUploads((prev) => prev.filter((u) => u.status === 'failed' || u.status === 'uploading' || u.status === 'inserting'));
    }, 3000);
  }, [productId, uploads.length, processFile]);

  const handleRetry = useCallback(async (uploadIndex: number) => {
    const upload = uploads[uploadIndex];
    if (!upload?.file) return;
    await processFile(upload.file, uploadIndex);
  }, [uploads, processFile]);

  const handleRemoveUpload = useCallback((uploadIndex: number) => {
    const upload = uploads[uploadIndex];
    if (upload?.localPreviewUrl) {
      URL.revokeObjectURL(upload.localPreviewUrl);
    }
    setUploads((prev) => prev.filter((_, i) => i !== uploadIndex));
  }, [uploads]);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(null);
    setDraggingIndex(null);

    if (draggingIndex === null || draggingIndex === dropIndex) return;

    const reordered = [...images];
    const [moved] = reordered.splice(draggingIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    onImagesChange(reordered.map((img, i) => ({ ...img, position: i })));
  }, [images, draggingIndex, onImagesChange]);

  const handleSetPrimary = (index: number) => {
    const reordered = [...images];
    const [primary] = reordered.splice(index, 1);
    reordered.unshift(primary);
    onImagesChange(reordered.map((img, i) => ({ ...img, position: i })));
  };

  const handleRemoveImage = async (index: number) => {
    const img = images[index];
    // If it has a DB id and r2Key, delete from R2 + DB
    if (img.id && img.r2Key) {
      try {
        await deleteR2Image(img.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete image from R2');
        return;
      }
    }
    const next = images.filter((_, i) => i !== index);
    onImagesChange(next.map((im, i) => ({ ...im, position: i })));
  };

  const handleAltChange = (index: number, alt: string) => {
    onImagesChange(images.map((img, i) => i === index ? { ...img, alt } : img));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="block text-white/60 text-xs font-medium uppercase tracking-wider">
          Product Images
        </label>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Upload dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          handleFileSelect(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-white/15 hover:border-white/30 rounded-lg p-6 text-center cursor-pointer transition-colors mb-4"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFileSelect(e.target.files);
            e.target.value = '';
          }}
        />
        <Upload className="w-6 h-6 text-white/30 mx-auto mb-2" />
        <p className="text-white/50 text-sm">
          Drag & drop images here, or click to browse
        </p>
        <p className="text-white/30 text-xs mt-1">
          JPEG, PNG, WebP — max 10 MB each — up to {MAX_IMAGES} images
        </p>
      </div>

      {/* Active uploads */}
      {uploads.length > 0 && (
        <div className="space-y-2 mb-4">
          {uploads.map((u, i) => (
            <div key={i} className="bg-white/5 rounded p-2">
              {u.status === 'failed' ? (
                <div>
                  <div className="flex items-center gap-2 text-red-300 text-xs mb-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{u.fileName}: {u.error}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRetry(i)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Retry
                    </button>
                    <button
                      onClick={() => handleRemoveUpload(i)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-white/50 hover:text-red-400 bg-white/5 hover:bg-red-500/10 rounded transition-colors"
                    >
                      <X className="w-3 h-3" />
                      Remove
                    </button>
                  </div>
                </div>
              ) : u.status === 'complete' ? (
                <div className="flex items-center gap-2 text-green-300 text-xs">
                  <ImageIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{u.fileName}: uploaded</span>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white/60 text-xs truncate flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {u.fileName}
                    </span>
                    <span className="text-white/40 text-xs">
                      {u.status === 'inserting' ? 'Saving...' : `${u.progress}%`}
                    </span>
                  </div>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white transition-all duration-200"
                      style={{ width: `${u.status === 'inserting' ? 100 : u.progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Image grid with drag-and-drop ordering */}
      {images.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((img, i) => (
            <div
              key={img.id ?? `new-${i}`}
              draggable
              onDragStart={() => setDraggingIndex(i)}
              onDragEnd={() => { setDraggingIndex(null); setDragOverIndex(null); }}
              onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
              onDrop={(e) => handleDrop(e, i)}
              className={`relative group bg-white/5 rounded-lg p-2 border transition-colors ${
                dragOverIndex === i && draggingIndex !== null
                  ? 'border-white/40'
                  : 'border-white/10'
              } ${draggingIndex === i ? 'opacity-50' : ''}`}
            >
              {/* Drag handle */}
              <div className="absolute top-1 left-1 text-white/30 cursor-grab active:cursor-grabbing">
                <GripVertical className="w-4 h-4" />
              </div>

              {/* Primary badge */}
              {i === 0 && (
                <div className="absolute top-1 right-1 bg-yellow-400/20 text-yellow-300 text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
                  <Star className="w-3 h-3" />
                  Primary
                </div>
              )}

              {/* Image preview */}
              <div className="aspect-square mb-2 mt-4 flex items-center justify-center">
                {img.src ? (
                  <img
                    src={img.src}
                    alt={img.alt}
                    className="w-full h-full object-cover rounded"
                  />
                ) : (
                  <div className="w-full h-full bg-black/30 rounded flex items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-white/20" />
                  </div>
                )}
              </div>

              {/* Alt text input */}
              <input
                type="text"
                value={img.alt}
                onChange={(e) => handleAltChange(i, e.target.value)}
                placeholder="Alt text"
                className="w-full px-2 py-1 bg-black/30 text-white text-xs rounded border border-white/10 focus:outline-none focus:border-white/30 placeholder-white/30 mb-1"
              />

              {/* Actions */}
              <div className="flex items-center gap-1">
                {i !== 0 && (
                  <button
                    onClick={() => handleSetPrimary(i)}
                    className="flex-1 px-2 py-1 text-xs text-white/50 hover:text-yellow-300 border border-white/10 hover:border-yellow-400/30 rounded transition-colors flex items-center justify-center gap-1"
                    title="Set as primary"
                  >
                    <Star className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={() => handleRemoveImage(i)}
                  className="flex-1 px-2 py-1 text-xs text-white/50 hover:text-red-400 border border-white/10 hover:border-red-400/30 rounded transition-colors flex items-center justify-center gap-1"
                  title="Remove image"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-white/30 text-xs">
          No images yet. Upload images to display them on the product page.
        </p>
      )}

      {/* Advanced: external URL */}
      {showExternalUrl ? (
        <div className="mt-3 p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Link className="w-3.5 h-3.5 text-white/40" />
            <span className="text-white/60 text-xs font-medium uppercase tracking-wider">Add External Image URL</span>
          </div>
          <div className="flex gap-2">
            <input
              type="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="flex-1 px-2 py-1.5 bg-black/30 text-white text-xs rounded border border-white/10 focus:outline-none focus:border-white/30 placeholder-white/30"
            />
            <input
              type="text"
              value={externalAlt}
              onChange={(e) => setExternalAlt(e.target.value)}
              placeholder="Alt text"
              className="w-32 px-2 py-1.5 bg-black/30 text-white text-xs rounded border border-white/10 focus:outline-none focus:border-white/30 placeholder-white/30"
            />
            <button
              onClick={() => {
                if (!externalUrl.trim()) return;
                onImagesChange([
                  ...images,
                  {
                    src: externalUrl.trim(),
                    alt: externalAlt.trim(),
                    position: images.length,
                    r2Key: null,
                    pending: false,
                  },
                ]);
                setExternalUrl('');
                setExternalAlt('');
                setShowExternalUrl(false);
              }}
              className="px-3 py-1.5 bg-white/10 text-white text-xs font-medium hover:bg-white/20 rounded transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => { setShowExternalUrl(false); setExternalUrl(''); setExternalAlt(''); }}
              className="px-2 py-1.5 text-white/40 hover:text-white text-xs transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowExternalUrl(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          <Link className="w-3 h-3" />
          Add external image URL
        </button>
      )}
    </div>
  );
}
