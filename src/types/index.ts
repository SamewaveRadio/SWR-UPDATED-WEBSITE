export interface Resident {
  id: string;
  slug: string;
  name: string;
  bio: string;
  image_url?: string;
  instagram_handle?: string;
  mixcloud_url?: string;
  show_title: string;
  show_description: string;
  schedule_text: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduleEntry {
  id: string;
  resident_id: string;
  start_time: string;
  end_time: string;
  is_live: boolean;
  notes?: string;
  created_at: string;
  resident?: Resident;
}

export interface Episode {
  id: string;
  resident_id: string;
  title: string;
  broadcast_date: string;
  mixcloud_url?: string;
  duration_minutes?: number;
  created_at: string;
  resident?: Resident;
}

export interface AzuraCastTrack {
  title: string;
  artist: string;
  artworkUrl?: string | null;
  startedAt?: string | null;
}

export interface AzuraCastDJ {
  name?: string | null;
}

export interface AzuraCastHistoryItem {
  title: string;
  artist: string;
  artworkUrl?: string | null;
  startedAt: string | null;
}

export interface AzuraCastHistory {
  items: AzuraCastHistoryItem[];
}

export interface AzuraCastNowPlaying {
  isLive: boolean;
  track: AzuraCastTrack | null;
  dj: AzuraCastDJ | null;
  artworkUrl?: string;
  listenUrl?: string;
  stationName?: string;
  history: AzuraCastHistory;
}

export interface AzuraCastRawSong {
  title?: string;
  artist?: string;
  text?: string;
  art?: unknown;
  custom_fields?: Record<string, unknown>;
}

export interface AzuraCastRawNowPlaying {
  station?: {
    id?: number | string;
    name?: string;
    shortcode?: string;
    listen_url?: unknown;
    mounts?: Array<{
      url?: unknown;
    }>;
  };
  now_playing?: {
    played_at?: number | string | null;
    song?: AzuraCastRawSong;
  };
  playing_next?: {
    song?: AzuraCastRawSong;
  };
  song_history?: Array<{
    played_at?: number | string | null;
    song?: AzuraCastRawSong;
  }>;
  listeners?: {
    current?: number;
    total?: number;
    unique?: number;
  };
  live?: {
    is_live?: boolean;
    streamer_name?: string;
  };
  is_online?: boolean;
}

export interface AzuraCastStatus {
  isLive: boolean;
}

export type RadioCoTrack = AzuraCastTrack;
export type RadioCoDJ = AzuraCastDJ;
export type RadioCoNowPlaying = AzuraCastNowPlaying;
export type RadioCoHistoryItem = AzuraCastHistoryItem;
export type RadioCoHistory = AzuraCastHistory;
export type RadioCoStatus = AzuraCastStatus;

export interface PrintifyMockupImage {
  id: number;
  src: string;
  position: string;
  default: boolean;
}

export interface PrintifyVariant {
  variantId: number;
  sku: string;
  title: string;
  color: string | null;
  size: string | null;
  price: string;
  priceCents: number;
}

export interface PrintifyProduct {
  id: number;
  title: string;
  description: string;
  tags: string[];
  mockupImages: PrintifyMockupImage[];
  variants: PrintifyVariant[];
  /** 'printify' or 'manual' — controls URL routing */
  _source?: 'printify' | 'manual';
  /** For manual products, the slug used in the URL */
  _slug?: string;
  /** Visibility for noindex metadata */
  _visibility?: 'public' | 'unlisted';
}

export interface PrintifyProductsResponse {
  items: PrintifyProduct[];
}

export interface CartItem {
  productId: number;
  variantId: number;
  title: string;
  variantTitle: string;
  color: string | null;
  size: string | null;
  price: string;
  priceCents: number;
  imageUrl: string | null;
  quantity: number;
}

export type ProductSource = 'printify' | 'manual';
export type ProductVisibility = 'public' | 'unlisted' | 'draft' | 'archived';

export interface UnifiedProductImage {
  id: string;
  src: string;
  alt: string | null;
  position: number;
}

export interface UnifiedProductVariant {
  id: string;
  productId: string;
  printifyVariantId: number | null;
  sku: string | null;
  title: string;
  options: Record<string, string>;
  priceCents: number;
  position: number;
  isEnabled: boolean;
  inventoryQuantity: number;
}

export interface UnifiedProduct {
  id: string;
  slug: string;
  title: string;
  description: string;
  source: ProductSource;
  printifyProductId: number | null;
  basePriceCents: number;
  currency: string;
  sku: string | null;
  category: string | null;
  tags: string[];
  shippingClass: string;
  visibility: ProductVisibility;
  trackInventory: boolean;
  allowBackorders: boolean;
  isPublished: boolean;
  images: UnifiedProductImage[];
  variants: UnifiedProductVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductListItem {
  id: string;
  slug: string;
  title: string;
  source: ProductSource;
  basePriceCents: number;
  visibility: ProductVisibility;
  primaryImageSrc: string | null;
  inventoryStatus: 'in_stock' | 'out_of_stock' | 'not_tracked' | 'backorder';
  updatedAt: string;
}

export interface MixcloudTag {
  name: string;
  url: string;
}

export interface MixcloudPlaylistItem {
  name: string;
  url: string;
  created_time: string;
  pictures: {
    extra_large: string;
  };
  tags: MixcloudTag[];
}

export interface MixcloudPlaylistResponse {
  items: MixcloudPlaylistItem[];
}
