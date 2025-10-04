export const CATEGORIES = [
  { id: "electronics", name: "Electronics", emoji: "📱" },
  { id: "clothing", name: "Clothing", emoji: "👕" },
  { id: "furniture", name: "Furniture", emoji: "🛋️" },
  { id: "books", name: "Books", emoji: "📚" },
  { id: "toys", name: "Toys", emoji: "🧸" },
  { id: "sports", name: "Sports", emoji: "⚽" },
  { id: "tools", name: "Tools", emoji: "🔧" },
  { id: "home", name: "Home & Garden", emoji: "🏡" },
  { id: "automotive", name: "Automotive", emoji: "🚗" },
  { id: "other", name: "Other", emoji: "📦" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

// Listing status enum
export const LISTING_STATUS = {
  ACTIVE: "active",
  EXPIRED: "expired",
  ARCHIVED: "archived",
} as const;

export type ListingStatus =
  (typeof LISTING_STATUS)[keyof typeof LISTING_STATUS];

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
