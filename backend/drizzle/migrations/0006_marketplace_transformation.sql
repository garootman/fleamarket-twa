-- Marketplace Transformation: posts → listings, postImages → listingImages
-- This migration transforms the existing feed-based app into a marketplace

-- Step 1: Rename posts table to listings
ALTER TABLE `posts` RENAME TO `listings`;

-- Step 2: Add new columns to listings table
ALTER TABLE `listings` ADD `title` text NOT NULL DEFAULT 'Untitled';
ALTER TABLE `listings` ADD `price` integer NOT NULL DEFAULT 0;
ALTER TABLE `listings` ADD `category` text NOT NULL DEFAULT 'other';
ALTER TABLE `listings` ADD `status` text NOT NULL DEFAULT 'active';
ALTER TABLE `listings` ADD `expires_at` integer NOT NULL DEFAULT 0;
ALTER TABLE `listings` ADD `last_bumped_at` integer;
ALTER TABLE `listings` ADD `bump_count` integer DEFAULT 0 NOT NULL;

-- Step 3: Rename content column to description (SQLite doesn't support RENAME COLUMN directly)
-- We'll keep 'content' for now and map it in the service layer, or handle in a data migration

-- Step 4: Rename post_images table to listing_images
ALTER TABLE `post_images` RENAME TO `listing_images`;

-- Step 4b: Rename post_id to listing_id in listing_images
ALTER TABLE `listing_images` RENAME COLUMN `post_id` TO `listing_id`;

-- Step 5: Update payments table columns
ALTER TABLE `payments` ADD `listing_id` integer;
ALTER TABLE `payments` ADD `payment_type` text NOT NULL DEFAULT 'premium_listing';

-- Step 6: Drop old indexes
DROP INDEX IF EXISTS `idx_posts_created_at`;
DROP INDEX IF EXISTS `idx_posts_user_id`;
DROP INDEX IF EXISTS `idx_post_images_post_id`;
DROP INDEX IF EXISTS `idx_post_images_upload_order`;
DROP INDEX IF EXISTS `idx_payments_post_id`;

-- Step 7: Create new indexes for listings
CREATE INDEX `idx_listings_created_at` ON `listings` (`created_at`);
CREATE INDEX `idx_listings_user_id` ON `listings` (`user_id`);
CREATE INDEX `idx_listings_category` ON `listings` (`category`);
CREATE INDEX `idx_listings_status` ON `listings` (`status`);
CREATE INDEX `idx_listings_expires_at` ON `listings` (`expires_at`);
CREATE INDEX `idx_listings_price` ON `listings` (`price`);

-- Step 8: Create new indexes for listing_images
CREATE INDEX `idx_listing_images_listing_id` ON `listing_images` (`listing_id`);
CREATE INDEX `idx_listing_images_upload_order` ON `listing_images` (`listing_id`, `upload_order`);

-- Step 9: Create new indexes for payments
CREATE INDEX `idx_payments_listing_id` ON `payments` (`listing_id`);

-- Step 10: Migrate existing data - copy post_id to listing_id in payments
UPDATE `payments` SET `listing_id` = `post_id` WHERE `post_id` IS NOT NULL;

-- Step 11: Set expires_at for existing listings (3 days from creation)
UPDATE `listings` SET `expires_at` = CAST((julianday(created_at) + 3) * 86400000 AS INTEGER) WHERE `expires_at` = 0;
