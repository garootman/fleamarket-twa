import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(), // UUID
    invoicePayload: text("invoice_payload").notNull().unique(),
    telegramPaymentChargeId: text("telegram_payment_charge_id").unique(), // Idempotency key
    providerPaymentChargeId: text("provider_payment_charge_id"),
    userId: integer("user_id").notNull(), // Telegram ID
    listingId: integer("listing_id"), // Renamed from postId; can be for premium listing or bump payment
    paymentType: text("payment_type").notNull(), // 'premium_listing' | 'bump'
    starAmount: integer("star_amount").notNull(),
    status: text("status").notNull(), // 'created' | 'pending' | 'succeeded' | 'failed' | 'refunded'
    rawUpdate: text("raw_update"), // JSON string of full webhook payload
    meta: text("meta"), // JSON string for additional data
    createdAt: text("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: text("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    userIdIdx: index("idx_payments_user_id").on(table.userId),
    listingIdIdx: index("idx_payments_listing_id").on(table.listingId),
    statusIdx: index("idx_payments_status").on(table.status),
    createdAtIdx: index("idx_payments_created_at").on(table.createdAt),
  }),
);

export const listings = sqliteTable(
  "listings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(), // Keep as 'content' for backward compatibility
    price: integer("price").notNull(), // Stored in cents (0 - 100,000,000)
    category: text("category").notNull(), // From predefined category list
    status: text("status").notNull().default("active"), // 'active' | 'expired' | 'archived'
    expiresAt: integer("expires_at").notNull(), // Unix timestamp in milliseconds
    lastBumpedAt: integer("last_bumped_at"), // Unix timestamp in milliseconds
    bumpCount: integer("bump_count").default(0).notNull(),
    starCount: integer("star_count").default(0).notNull(), // For premium listings
    paymentId: text("payment_id").references(() => payments.id),
    isPaymentPending: integer("is_payment_pending").default(0).notNull(), // 0 or 1
    createdAt: text("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: text("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    createdAtIdx: index("idx_listings_created_at").on(table.createdAt),
    userIdIdx: index("idx_listings_user_id").on(table.userId),
    categoryIdx: index("idx_listings_category").on(table.category),
    statusIdx: index("idx_listings_status").on(table.status),
    expiresAtIdx: index("idx_listings_expires_at").on(table.expiresAt),
    priceIdx: index("idx_listings_price").on(table.price),
  }),
);

export const userProfiles = sqliteTable(
  "user_profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    telegramId: integer("telegram_id").notNull().unique(),
    username: text("username"),
    displayName: text("display_name"),
    bio: text("bio"),
    phoneNumber: text("phone_number"),
    contactLinks: text("contact_links"), // JSON string
    profileImageKey: text("profile_image_key"),
    isBanned: integer("is_banned").default(0).notNull(),
    createdAt: text("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: text("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    telegramIdIdx: index("idx_user_profiles_telegram_id").on(table.telegramId),
    usernameIdx: index("idx_user_profiles_username").on(table.username),
    isBannedIdx: index("idx_user_profiles_is_banned").on(table.isBanned),
  }),
);

export const listingImages = sqliteTable(
  "listing_images",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    originalName: text("original_name").notNull(),
    imageKey: text("image_key").notNull(),
    thumbnailKey: text("thumbnail_key").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    uploadOrder: integer("upload_order").notNull(),
    createdAt: text("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    listingIdIdx: index("idx_listing_images_listing_id").on(table.listingId),
    uploadOrderIdx: index("idx_listing_images_upload_order").on(
      table.listingId,
      table.uploadOrder,
    ),
  }),
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type ListingImage = typeof listingImages.$inferSelect;
export type NewListingImage = typeof listingImages.$inferInsert;
export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;

// Legacy exports for backward compatibility (to be removed)
export const posts = listings;
export const postImages = listingImages;
export type Post = Listing;
export type NewPost = NewListing;
export type PostImage = ListingImage;
export type NewPostImage = NewListingImage;
