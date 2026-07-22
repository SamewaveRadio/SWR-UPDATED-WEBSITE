import { useState, useRef, useCallback } from 'react';
import { Upload, X, Star, GripVertical, Loader2, AlertCircle, Image as ImageIcon } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
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

interface UploadState {
  fileName: string;
  progress: number;
  error: string | null;
}

function getAuthToken(): string | null {
  return localStorage.getItem('samewave-admin-token');
}

async function fetchPresign(productId: string, file: File): Promise<{
  uploadUrl: string;
  objectKey: string;
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
  return { uploadUrl: data.uploadUrl, objectKey: data.objectKey };
}

async function uploadToR2(
  uploadUrl: string,
  file: File,
  onProgress: (progress: number) => void,
): Promise<void> {
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
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
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

function buildPublicUrl(objectKey: string): string {
  const base = import.meta.env.VITE_R2_PUBLIC_BASE_URL;
  if (!base) return objectKey;
  return `${base.replace(/\/$/, '')}/${objectKey}`;
}

export function ImageUploader({ productId, images, onImagesChange }: ImageUploaderProps) {
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!productId) {
      setError('Save the product first before uploading images.');
      return;
    }

    setError(null);

    for (const file of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`${file.name}: Only JPEG, PNG, and WebP images are allowed.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name}: File exceeds 10 MB limit.`);
        continue;
      }

      const uploadIndex = uploads.length;
      setUploads((prev) => [...prev, { fileName: file.name, progress: 0, error: null }]);

      try {
        const { uploadUrl, objectKey } = await fetchPresign(productId, file);
        await uploadToR2(uploadUrl, file, (progress) => {
          setUploads((prev) => prev.map((u, i) => i === uploadIndex ? { ...u, progress } : u));
        });

        const publicUrl = buildPublicUrl(objectKey);
        onImagesChange([
          ...images,
          { src: publicUrl, alt: '', position: images.length, r2Key: objectKey, pending: true },
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setUploads((prev) => prev.map((u, i) => i === uploadIndex ? { ...u, error: msg } : u));
        setError(msg);
      }
    }

    // Clear completed uploads after a delay
    setTimeout(() => {
      setUploads((prev) => prev.filter((u) => u.error !== null));
    }, 3000);
  }, [productId, images, uploads.length, onImagesChange]);

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
          JPEG, PNG, WebP — max 10 MB each
        </p>
      </div>

      {/* Active uploads */}
      {uploads.length > 0 && (
        <div className="space-y-2 mb-4">
          {uploads.map((u, i) => (
            <div key={i} className="bg-white/5 rounded p-2">
              {u.error ? (
                <div className="flex items-center gap-2 text-red-300 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{u.fileName}: {u.error}</span>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white/60 text-xs truncate">{u.fileName}</span>
                    <span className="text-white/40 text-xs">{u.progress}%</span>
                  </div>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white transition-all duration-200"
                      style={{ width: `${u.progress}%` }}
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

              {img.pending && (
                <div className="absolute bottom-1 right-1 text-white/30 text-xs flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-white/30 text-xs">
          No images yet. Upload images to display them on the product page.
        </p>
      )}
    </div>
  );
}
