export const CATEGORIES = [
  { id: 'electronics', name: 'Electronics', emoji: '📱' },
  { id: 'clothing', name: 'Clothing', emoji: '👕' },
  { id: 'furniture', name: 'Furniture', emoji: '🛋️' },
  { id: 'books', name: 'Books', emoji: '📚' },
  { id: 'toys', name: 'Toys', emoji: '🧸' },
  { id: 'sports', name: 'Sports', emoji: '⚽' },
  { id: 'tools', name: 'Tools', emoji: '🔧' },
  { id: 'home', name: 'Home & Garden', emoji: '🏡' },
  { id: 'automotive', name: 'Automotive', emoji: '🚗' },
  { id: 'other', name: 'Other', emoji: '📦' },
] as const;

export type CategoryId = typeof CATEGORIES[number]['id'];

// Listing status enum
export const LISTING_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  ARCHIVED: 'archived',
} as const;

export type ListingStatus = typeof LISTING_STATUS[keyof typeof LISTING_STATUS];

// Price constraints (in cents)
export const PRICE_MIN = 0;
export const PRICE_MAX = 100_000_000; // $1,000,000 in cents

// Expiry durations (in milliseconds)
export const EXPIRY_DEFAULT_DAYS = 3;
export const EXPIRY_FREE_BUMP_DAYS = 3;
export const EXPIRY_PAID_BUMP_DAYS = 7;
export const BUMP_COOLDOWN_HOURS = 24;

// Payment constants
export const BUMP_PAYMENT_AMOUNT_STARS = 1;

// Helper functions
export function formatPrice(priceInCents: number): string {
  return `$${(priceInCents / 100).toFixed(2)}`;
}

export function parsePriceInput(priceString: string): number {
  const cleaned = priceString.replace(/[^0-9.]/g, '');
  const dollars = parseFloat(cleaned) || 0;
  return Math.round(dollars * 100);
}

export function getCategoryById(id: string) {
  return CATEGORIES.find(cat => cat.id === id);
}

export function formatTimeRemaining(expiresAt: number): string {
  const now = Date.now();
  const diff = expiresAt - now;

  if (diff <= 0) {
    return 'Expired';
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

export function getTimeRemainingColor(expiresAt: number): string {
  const now = Date.now();
  const diff = expiresAt - now;
  const hours = diff / (1000 * 60 * 60);

  if (hours > 24) return 'text-green-600';
  if (hours > 1) return 'text-yellow-600';
  return 'text-red-600';
}
