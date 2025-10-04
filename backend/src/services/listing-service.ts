import { eq, desc, and, or, gte, lte, sql, like } from "drizzle-orm";
import type { Database } from "../db";
import { listings, listingImages, userProfiles } from "../db/schema";
import type { ImageUrlData } from "./image-service";
import type { Env } from "../types/env";
import {
  EXPIRY_DEFAULT_DAYS,
  LISTING_STATUS,
  type CategoryId,
  type ListingStatus,
} from "../../../shared/constants";

export interface CreateListingInput {
  title: string;
  description: string;
  price: number; // in cents
  category: CategoryId;
}

export interface UpdateListingInput {
  title?: string;
  description?: string;
  price?: number;
  category?: CategoryId;
}

export interface GetListingsInput {
  limit: number;
  offset: number;
  category?: string;
  priceMin?: number;
  priceMax?: number;
  search?: string;
  sortBy?: "price" | "date";
  sortOrder?: "asc" | "desc";
  status?: ListingStatus[];
  userId?: number; // Filter by user
}

export class ListingService {
  constructor(
    private db: Database,
    private env: Env,
  ) {}

  async createListing(
    userId: number,
    username: string,
    displayName: string,
    input: CreateListingInput,
  ) {
    const now = new Date().toISOString();
    const expiresAt = Date.now() + EXPIRY_DEFAULT_DAYS * 24 * 60 * 60 * 1000;

    const [newListing] = await this.db
      .insert(listings)
      .values({
        userId,
        username,
        displayName,
        title: input.title,
        content: input.description,
        price: input.price,
        category: input.category,
        status: LISTING_STATUS.ACTIVE,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return newListing;
  }

  async getListings(input: GetListingsInput) {
    // Build where conditions
    const conditions = [];

    // Status filter (default to active only if not specified)
    if (input.status && input.status.length > 0) {
      conditions.push(
        or(...input.status.map((status) => eq(listings.status, status)))!,
      );
    } else {
      conditions.push(eq(listings.status, LISTING_STATUS.ACTIVE));
    }

    // Category filter
    if (input.category) {
      conditions.push(eq(listings.category, input.category));
    }

    // Price range filter
    if (input.priceMin !== undefined) {
      conditions.push(gte(listings.price, input.priceMin));
    }
    if (input.priceMax !== undefined) {
      conditions.push(lte(listings.price, input.priceMax));
    }

    // User filter
    if (input.userId !== undefined) {
      conditions.push(eq(listings.userId, input.userId));
    }

    // Search filter (title, content, category)
    if (input.search) {
      const searchTerm = `%${input.search}%`;
      conditions.push(
        or(
          like(listings.title, searchTerm),
          like(listings.content, searchTerm),
          like(listings.category, searchTerm),
        )!,
      );
    }

    // Build order by
    let orderBy;
    if (input.sortBy === "price") {
      orderBy =
        input.sortOrder === "asc" ? listings.price : desc(listings.price);
    } else {
      orderBy =
        input.sortOrder === "asc" ? listings.createdAt : desc(listings.createdAt);
    }

    // Execute query
    const query = this.db
      .select()
      .from(listings)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderBy)
      .limit(input.limit)
      .offset(input.offset);

    return await query;
  }

  async getListingById(id: number) {
    const [listing] = await this.db
      .select()
      .from(listings)
      .where(eq(listings.id, id))
      .limit(1);

    return listing;
  }

  async updateListing(id: number, userId: number, input: UpdateListingInput) {
    const now = new Date().toISOString();

    const updateData: any = {
      updatedAt: now,
    };

    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined)
      updateData.content = input.description;
    if (input.price !== undefined) updateData.price = input.price;
    if (input.category !== undefined) updateData.category = input.category;

    const [updatedListing] = await this.db
      .update(listings)
      .set(updateData)
      .where(and(eq(listings.id, id), eq(listings.userId, userId)))
      .returning();

    return updatedListing;
  }

  async deleteListing(id: number, userId: number) {
    const [deletedListing] = await this.db
      .delete(listings)
      .where(and(eq(listings.id, id), eq(listings.userId, userId)))
      .returning();

    return deletedListing;
  }

  async deleteListingByIdOnly(id: number) {
    const [deletedListing] = await this.db
      .delete(listings)
      .where(eq(listings.id, id))
      .returning();

    return deletedListing;
  }

  async archiveListing(id: number) {
    const now = new Date().toISOString();

    const [archivedListing] = await this.db
      .update(listings)
      .set({
        status: LISTING_STATUS.ARCHIVED,
        updatedAt: now,
      })
      .where(eq(listings.id, id))
      .returning();

    return archivedListing;
  }

  async updateUserDisplayNameInListings(
    userId: number,
    newDisplayName: string,
  ) {
    const now = new Date().toISOString();

    await this.db
      .update(listings)
      .set({
        displayName: newDisplayName,
        updatedAt: now,
      })
      .where(eq(listings.userId, userId));

    return true;
  }

  async expireOldListings() {
    const now = Date.now();
    const nowIso = new Date().toISOString();

    const expiredListings = await this.db
      .update(listings)
      .set({
        status: LISTING_STATUS.EXPIRED,
        updatedAt: nowIso,
      })
      .where(
        and(
          eq(listings.status, LISTING_STATUS.ACTIVE),
          lte(listings.expiresAt, now),
        ),
      )
      .returning();

    return expiredListings;
  }

  async getListingsWithImages(input: GetListingsInput) {
    // Filter out listings from banned users
    const listingList = await this.db
      .select({
        id: listings.id,
        userId: listings.userId,
        username: listings.username,
        displayName: listings.displayName,
        title: listings.title,
        description: listings.content,
        price: listings.price,
        category: listings.category,
        status: listings.status,
        expiresAt: listings.expiresAt,
        lastBumpedAt: listings.lastBumpedAt,
        bumpCount: listings.bumpCount,
        starCount: listings.starCount,
        paymentId: listings.paymentId,
        isPaymentPending: listings.isPaymentPending,
        createdAt: listings.createdAt,
        updatedAt: listings.updatedAt,
      })
      .from(listings)
      .leftJoin(userProfiles, eq(listings.userId, userProfiles.telegramId))
      .where(
        and(
          eq(userProfiles.isBanned, 0),
          ...(input.status && input.status.length > 0
            ? [or(...input.status.map((status) => eq(listings.status, status)))!]
            : [eq(listings.status, LISTING_STATUS.ACTIVE)]),
          ...(input.category ? [eq(listings.category, input.category)] : []),
          ...(input.priceMin !== undefined
            ? [gte(listings.price, input.priceMin)]
            : []),
          ...(input.priceMax !== undefined
            ? [lte(listings.price, input.priceMax)]
            : []),
          ...(input.userId !== undefined
            ? [eq(listings.userId, input.userId)]
            : []),
          ...(input.search
            ? [
                or(
                  like(listings.title, `%${input.search}%`),
                  like(listings.content, `%${input.search}%`),
                  like(listings.category, `%${input.search}%`),
                )!,
              ]
            : []),
        ),
      )
      .orderBy(
        input.sortBy === "price"
          ? input.sortOrder === "asc"
            ? listings.price
            : desc(listings.price)
          : input.sortOrder === "asc"
            ? listings.createdAt
            : desc(listings.createdAt),
      )
      .limit(input.limit)
      .offset(input.offset);

    // Get images and profile data for all listings
    const listingsWithImages = await Promise.all(
      listingList.map(async (listing) => {
        const images = await this.getListingImagesData(listing.id);

        // Get profile data for this user
        const profileResult = await this.db
          .select()
          .from(userProfiles)
          .where(eq(userProfiles.telegramId, listing.userId))
          .limit(1);

        const profile = profileResult[0] || null;

        // Use profile display name if available, otherwise use listing's display name
        const effectiveDisplayName = profile?.displayName || listing.displayName;

        return {
          ...listing,
          displayName: effectiveDisplayName,
          profile: profile
            ? {
                displayName: profile.displayName,
                bio: profile.bio,
                profileImageKey: profile.profileImageKey,
                username: profile.username,
              }
            : null,
          images,
        };
      }),
    );

    return listingsWithImages;
  }

  async getListingByIdWithImages(id: number) {
    const [listing] = await this.db
      .select()
      .from(listings)
      .where(eq(listings.id, id))
      .limit(1);

    if (!listing) {
      return null;
    }

    const images = await this.getListingImagesData(listing.id);

    // Get profile data for this user
    const profileResult = await this.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.telegramId, listing.userId))
      .limit(1);

    const profile = profileResult[0] || null;

    // Use profile display name if available, otherwise use listing's display name
    const effectiveDisplayName = profile?.displayName || listing.displayName;

    return {
      ...listing,
      displayName: effectiveDisplayName,
      profile: profile
        ? {
            displayName: profile.displayName,
            bio: profile.bio,
            profileImageKey: profile.profileImageKey,
            username: profile.username,
          }
        : null,
      images,
    };
  }

  private async getListingImagesData(
    listingId: number,
  ): Promise<ImageUrlData[]> {
    const images = await this.db
      .select()
      .from(listingImages)
      .where(eq(listingImages.listingId, listingId))
      .orderBy(listingImages.uploadOrder);

    return images.map((image) => ({
      id: image.id,
      imageKey: image.imageKey,
      thumbnailKey: image.thumbnailKey,
      width: image.width,
      height: image.height,
      originalName: image.originalName,
      fileSize: image.fileSize,
      uploadOrder: image.uploadOrder,
    }));
  }
}
