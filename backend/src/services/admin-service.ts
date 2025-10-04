import { eq } from "drizzle-orm";
import type { Database } from "../db";
import { listings } from "../db/schema";
import type { Env } from "../types/env";
import { LISTING_STATUS } from "../../../shared/constants";

export class AdminService {
  constructor(
    private db: Database,
    private env: Env,
  ) {}

  async archiveListing(listingId: number, reason: string): Promise<{
    success: boolean;
    listing?: any;
    error?: string;
  }> {
    try {
      // Get the listing first
      const [listing] = await this.db
        .select()
        .from(listings)
        .where(eq(listings.id, listingId))
        .limit(1);

      if (!listing) {
        return { success: false, error: "Listing not found" };
      }

      const now = new Date().toISOString();

      // Archive the listing
      const [archivedListing] = await this.db
        .update(listings)
        .set({
          status: LISTING_STATUS.ARCHIVED,
          updatedAt: now,
        })
        .where(eq(listings.id, listingId))
        .returning();

      // Send Telegram notification to listing owner
      await this.sendArchiveNotification(listing.userId, listing.title, reason);

      return { success: true, listing: archivedListing };
    } catch (error) {
      console.error("Error archiving listing:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async sendArchiveNotification(
    userId: number,
    listingTitle: string,
    reason: string,
  ): Promise<void> {
    const botToken = this.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      console.error("TELEGRAM_BOT_TOKEN not configured");
      return;
    }

    const message = `⚠️ Your listing "${listingTitle}" has been archived by an admin.\n\nReason: ${reason}`;

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: userId,
            text: message,
            parse_mode: "HTML",
          }),
        },
      );

      const data = await response.json() as { ok: boolean };

      if (!data.ok) {
        console.error("Failed to send Telegram notification:", data);
      }
    } catch (error) {
      console.error("Error sending Telegram notification:", error);
    }
  }
}
