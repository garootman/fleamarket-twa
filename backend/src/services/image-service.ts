import { eq, and } from "drizzle-orm";
import type { Database } from "../db";
import { listingImages } from "../db/schema";
import type { ListingImage } from "../db/schema";
import type { Env } from "../types/env";

export interface ImageUploadData {
  originalName: string;
  mimeType: string;
  fileSize: number;
  width: number;
  height: number;
  uploadOrder: number;
  imageBuffer: ArrayBuffer;
  thumbnailBuffer: ArrayBuffer;
}

export interface ImageUrlData {
  id: number;
  imageKey: string;
  thumbnailKey: string;
  width: number;
  height: number;
  originalName: string;
  fileSize: number;
  uploadOrder: number;
}

export class ImageService {
  private r2: Env["IMAGES"];

  constructor(
    private db: Database,
    r2: Env["IMAGES"],
  ) {
    this.r2 = r2;
  }

  private generateImageKey(listingId: number, filename: string): string {
    const timestamp = Date.now();
    const uuid = crypto.randomUUID();
    const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
    return `images/${listingId}/full/${timestamp}_${uuid}.${ext}`;
  }

  private generateThumbnailKey(listingId: number, filename: string): string {
    const timestamp = Date.now();
    const uuid = crypto.randomUUID();
    const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
    return `images/${listingId}/thumbs/${timestamp}_${uuid}.${ext}`;
  }

  async uploadListingImage(
    listingId: number,
    imageData: ImageUploadData,
  ): Promise<ListingImage> {
    const imageKey = this.generateImageKey(listingId, imageData.originalName);
    const thumbnailKey = this.generateThumbnailKey(
      listingId,
      imageData.originalName,
    );

    // Upload full image to R2
    await this.r2.put(imageKey, imageData.imageBuffer, {
      httpMetadata: {
        contentType: imageData.mimeType,
      },
      customMetadata: {
        originalName: imageData.originalName,
        listingId: listingId.toString(),
        width: imageData.width.toString(),
        height: imageData.height.toString(),
      },
    });

    // Upload thumbnail to R2
    await this.r2.put(thumbnailKey, imageData.thumbnailBuffer, {
      httpMetadata: {
        contentType: imageData.mimeType,
      },
      customMetadata: {
        originalName: imageData.originalName,
        listingId: listingId.toString(),
        type: "thumbnail",
      },
    });

    // Save metadata to database
    const now = new Date().toISOString();
    const [newImage] = await this.db
      .insert(listingImages)
      .values({
        listingId,
        originalName: imageData.originalName,
        imageKey,
        thumbnailKey,
        mimeType: imageData.mimeType,
        fileSize: imageData.fileSize,
        width: imageData.width,
        height: imageData.height,
        uploadOrder: imageData.uploadOrder,
        createdAt: now,
      })
      .returning();

    return newImage;
  }

  async uploadListingImages(
    listingId: number,
    imagesData: ImageUploadData[],
  ): Promise<ListingImage[]> {
    const results: ListingImage[] = [];

    for (const imageData of imagesData) {
      try {
        const image = await this.uploadListingImage(listingId, imageData);
        results.push(image);
      } catch (error) {
        // If any upload fails, cleanup uploaded images and throw
        await this.cleanupListingImages(listingId);
        throw error;
      }
    }

    return results;
  }

  async getListingImages(listingId: number): Promise<ImageUrlData[]> {
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

  async deleteListingImage(imageId: number, listingId: number): Promise<boolean> {
    // Get image metadata
    const [image] = await this.db
      .select()
      .from(listingImages)
      .where(and(eq(listingImages.id, imageId), eq(listingImages.listingId, listingId)))
      .limit(1);

    if (!image) {
      return false;
    }

    // Delete from R2
    try {
      await this.r2.delete(image.imageKey);
      await this.r2.delete(image.thumbnailKey);
    } catch (error) {
      console.error("Failed to delete from R2:", error);
      // Continue to delete from database even if R2 deletion fails
    }

    // Delete from database
    const [deletedImage] = await this.db
      .delete(listingImages)
      .where(and(eq(listingImages.id, imageId), eq(listingImages.listingId, listingId)))
      .returning();

    return !!deletedImage;
  }

  async cleanupListingImages(listingId: number): Promise<void> {
    // Get all images for the listing
    const images = await this.db
      .select()
      .from(listingImages)
      .where(eq(listingImages.listingId, listingId));

    // Delete from R2
    for (const image of images) {
      try {
        await this.r2.delete(image.imageKey);
        await this.r2.delete(image.thumbnailKey);
      } catch (error) {
        console.error(`Failed to delete image ${image.id} from R2:`, error);
      }
    }

    // Delete from database
    await this.db.delete(listingImages).where(eq(listingImages.listingId, listingId));
  }

  async validateImageFile(
    buffer: ArrayBuffer,
    mimeType: string,
  ): Promise<boolean> {
    // Check file size (1MB limit for full images)
    if (buffer.byteLength > 1024 * 1024) {
      return false;
    }

    // Check MIME type - only accept compressed formats (all files are converted to JPEG on frontend)
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(mimeType)) {
      return false;
    }

    return true;
  }

  async validateThumbnailFile(buffer: ArrayBuffer): Promise<boolean> {
    // Check minimum file size (at least 1KB to ensure valid image)
    if (buffer.byteLength < 1024) {
      return false;
    }
    // Check maximum file size (150KB limit for thumbnails - compression isn't always exact)
    return buffer.byteLength <= 150 * 1024;
  }

  async getListingImageCount(listingId: number): Promise<number> {
    const [result] = await this.db
      .select({ count: listingImages.id })
      .from(listingImages)
      .where(eq(listingImages.listingId, listingId));

    return result?.count || 0;
  }

  // Legacy methods for backward compatibility (posts = listings)
  async uploadImage(postId: number, imageData: ImageUploadData) {
    return this.uploadListingImage(postId, imageData);
  }

  async uploadImages(postId: number, imagesData: ImageUploadData[]) {
    return this.uploadListingImages(postId, imagesData);
  }

  async getPostImages(postId: number) {
    return this.getListingImages(postId);
  }

  async deleteImage(imageId: number, postId: number) {
    return this.deleteListingImage(imageId, postId);
  }

  async cleanupPostImages(postId: number) {
    return this.cleanupListingImages(postId);
  }

  async getImageCount(postId: number) {
    return this.getListingImageCount(postId);
  }

  async uploadProfileImage(file: File, profileImageKey: string): Promise<void> {
    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Simple resize logic - for now, just upload as-is
    // In a real implementation, you might want to resize to exactly 512x512
    await this.r2.put(profileImageKey, arrayBuffer, {
      httpMetadata: {
        contentType: file.type,
      },
      customMetadata: {
        originalName: file.name,
        type: "profile_avatar",
        uploadedAt: new Date().toISOString(),
      },
    });
  }

  getProfileImageKey(key: string | null): string | null {
    return key;
  }

  async deleteProfileImage(profileImageKey: string): Promise<void> {
    try {
      await this.r2.delete(profileImageKey);
    } catch (error) {
      console.error(
        `Failed to delete profile image ${profileImageKey} from R2:`,
        error,
      );
      // Don't throw - allow profile update to continue even if R2 deletion fails
    }
  }
}
