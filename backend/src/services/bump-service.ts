import { eq, sql } from "drizzle-orm";
import type { Database } from "../db";
import { listings } from "../db/schema";
import type { Env } from "../types/env";
import {
  BUMP_COOLDOWN_HOURS,
  EXPIRY_FREE_BUMP_DAYS,
  EXPIRY_PAID_BUMP_DAYS,
  LISTING_STATUS,
} from "../../../shared/constants";

export interface BumpListingInput {
  listingId: number;
  userId: number;
  isPaid: boolean;
}

export class BumpService {
  constructor(
    private db: Database,
    private env: Env,
  ) {}

  async canBumpListing(listingId: number, userId: number): Promise<{
    canBump: boolean;
    reason?: string;
    hoursUntilNextBump?: number;
  }> {
    const [listing] = await this.db
      .select()
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);

    if (!listing) {
      return { canBump: false, reason: "Listing not found" };
    }

    if (listing.userId !== userId) {
      return { canBump: false, reason: "You don't own this listing" };
    }

    // Check bump cooldown (24 hours)
    if (listing.lastBumpedAt) {
      const hoursSinceLastBump =
        (Date.now() - listing.lastBumpedAt) / (1000 * 60 * 60);

      if (hoursSinceLastBump < BUMP_COOLDOWN_HOURS) {
        const hoursUntilNextBump = Math.ceil(
          BUMP_COOLDOWN_HOURS - hoursSinceLastBump,
        );
        return {
          canBump: false,
          reason: `You can bump again in ${hoursUntilNextBump} hour(s)`,
          hoursUntilNextBump,
        };
      }
    }

    return { canBump: true };
  }

  async bumpListing(input: BumpListingInput) {
    // Validate bump eligibility
    const eligibility = await this.canBumpListing(
      input.listingId,
      input.userId,
    );

    if (!eligibility.canBump) {
      throw new Error(eligibility.reason || "Cannot bump listing");
    }

    const now = Date.now();
    const nowIso = new Date().toISOString();

    // Calculate new expiry date
    const daysToAdd = input.isPaid
      ? EXPIRY_PAID_BUMP_DAYS
      : EXPIRY_FREE_BUMP_DAYS;
    const newExpiresAt = now + daysToAdd * 24 * 60 * 60 * 1000;

    // Update listing
    const [bumpedListing] = await this.db
      .update(listings)
      .set({
        expiresAt: newExpiresAt,
        lastBumpedAt: now,
        bumpCount: sql`${listings.bumpCount} + 1`,
        status: LISTING_STATUS.ACTIVE, // Reactivate if expired
        updatedAt: nowIso,
      })
      .where(eq(listings.id, input.listingId))
      .returning();

    return bumpedListing;
  }

  async getTimeUntilNextBump(
    listingId: number,
  ): Promise<number | null> {
    const [listing] = await this.db
      .select({ lastBumpedAt: listings.lastBumpedAt })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);

    if (!listing || !listing.lastBumpedAt) {
      return null;
    }

    const hoursSinceLastBump =
      (Date.now() - listing.lastBumpedAt) / (1000 * 60 * 60);

    if (hoursSinceLastBump >= BUMP_COOLDOWN_HOURS) {
      return 0; // Can bump now
    }

    return (BUMP_COOLDOWN_HOURS - hoursSinceLastBump) * 60 * 60 * 1000; // Return milliseconds
  }
}
