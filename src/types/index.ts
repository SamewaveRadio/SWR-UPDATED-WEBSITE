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
  artworkUrl?: string;
  startedAt?: string;
}

export interface AzuraCastDJ {
  name?: string;
}

export interface AzuraCastHistoryItem {
  title: string;
  artist: string;
  artworkUrl?: string;
  startedAt: string;
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

export interface ShopifyProduct {
  id: string;
  handle: string;
  title: string;
  imageUrl: string | null;
  imageAlt: string;
  price: number;
  compareAtPrice: number | null;
  currencyCode: string;
  availableForSale: boolean;
}

export interface ShopifyProductsResponse {
  items: ShopifyProduct[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
}

export interface ShopifyProductImage {
  url: string;
  altText: string;
}

export interface ShopifyProductOption {
  id: string;
  name: string;
  values: string[];
}

export interface ShopifyProductVariant {
  id: string;
  title: string;
  price: number;
  compareAtPrice: number | null;
  currencyCode: string;
  availableForSale: boolean;
  selectedOptions: { name: string; value: string }[];
}

export interface ShopifyProductDetail {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  images: ShopifyProductImage[];
  options: ShopifyProductOption[];
  variants: ShopifyProductVariant[];
}

export interface ShopifyCartLine {
  lineId: string;
  quantity: number;
  variantId: string;
  variantTitle: string;
  productTitle: string;
  productHandle: string;
  price: number;
  currencyCode: string;
  imageUrl: string | null;
}

export interface ShopifyCart {
  cartId: string;
  checkoutUrl: string;
  totalQuantity: number;
  subtotal: number;
  currencyCode: string;
  lines: ShopifyCartLine[];
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
