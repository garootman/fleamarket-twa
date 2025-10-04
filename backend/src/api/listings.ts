import { Context } from "hono";
import { createDatabase } from "../db";
import { ListingService } from "../services/listing-service";
import { BumpService } from "../services/bump-service";
import { AdminService } from "../services/admin-service";
import { ImageService } from "../services/image-service";
import { SessionManager } from "../services/session-manager";
import type { Env } from "../types/env";
import type { ImageUploadData } from "../services/image-service";
import {
  getBotInstance,
  sendPostDeletedNotification,
} from "../services/notification-service";
import { CATEGORIES, PRICE_MIN, PRICE_MAX } from "../../../shared/constants";
import type { CategoryId, ListingStatus } from "../../../shared/constants";

// Helper: Extract and validate session
async function authenticateUser(c: Context<{ Bindings: Env }>) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    return {
      error: { message: "Authentication required", status: 401 as const },
    };
  }

  let sessionId: string;
  if (authHeader.startsWith("Bearer ")) {
    sessionId = authHeader.substring(7).trim();
  } else if (authHeader.startsWith("Session ")) {
    sessionId = authHeader.substring(8).trim();
  } else {
    sessionId = authHeader.trim();
  }

  if (!sessionId) {
    return {
      error: { message: "Authentication required", status: 401 as const },
    };
  }

  const sessionManager = SessionManager.create(c.env);
  const session = await sessionManager.validateSession(sessionId);
  if (!session) {
    return {
      error: { message: "Invalid or expired session", status: 401 as const },
    };
  }

  return { session };
}

// Helper: Parse pagination and filters
function parseListingFilters(c: Context) {
  const limitParam = c.req.query("limit") || "50";
  const offsetParam = c.req.query("offset") || "0";
  const limit = Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 100);
  const offset = Math.max(parseInt(offsetParam, 10) || 0, 0);

  const category = c.req.query("category") || undefined;
  const priceMin = c.req.query("priceMin")
    ? parseInt(c.req.query("priceMin")!, 10)
    : undefined;
  const priceMax = c.req.query("priceMax")
    ? parseInt(c.req.query("priceMax")!, 10)
    : undefined;
  const search = c.req.query("search") || undefined;
  const sortBy = (c.req.query("sortBy") as "price" | "date") || "date";
  const sortOrder = (c.req.query("sortOrder") as "asc" | "desc") || "desc";
  const statusParam = c.req.query("status");
  const status = statusParam
    ? (statusParam.split(",") as ListingStatus[])
    : undefined;

  return {
    limit,
    offset,
    category,
    priceMin,
    priceMax,
    search,
    sortBy,
    sortOrder,
    status,
  };
}

// Helper: Parse and validate listing ID
function parseListingId(c: Context) {
  const listingId = parseInt(c.req.param("listingId"), 10);
  if (isNaN(listingId)) {
    return { error: { message: "Invalid listing ID", status: 400 as const } };
  }
  return { listingId };
}

// Helper: Create pagination response
function createPaginationResponse(
  listings: unknown[],
  limit: number,
  offset: number,
) {
  return {
    listings,
    pagination: {
      limit,
      offset,
      hasMore: listings.length === limit,
    },
  };
}

export const getAllListings = async (c: Context<{ Bindings: Env }>) => {
  try {
    const filters = parseListingFilters(c);

    const db = createDatabase(c.env.DB);
    const listingService = new ListingService(db, c.env);

    // Expire old listings first
    await listingService.expireOldListings();

    const listings = await listingService.getListingsWithImages(filters);

    const responseData = createPaginationResponse(
      listings,
      filters.limit,
      filters.offset,
    );

    return c.json(responseData);
  } catch (error) {
    console.error("Error fetching listings:", error);
    return c.json({ error: "Failed to fetch listings" }, 500);
  }
};

export const getUserListings = async (c: Context<{ Bindings: Env }>) => {
  try {
    const userIdParam = c.req.param("userId");
    if (!userIdParam || userIdParam === "undefined" || userIdParam === "null") {
      return c.json({ error: "User ID is required" }, 400);
    }

    const userId = parseInt(userIdParam, 10);
    if (isNaN(userId)) {
      return c.json({ error: "Invalid user ID" }, 400);
    }

    const filters = parseListingFilters(c);

    const db = createDatabase(c.env.DB);
    const listingService = new ListingService(db, c.env);

    // Check if target user is banned
    const { ProfileService } = await import("../services/profile-service");
    const profileService = new ProfileService(c.env.DB);
    const targetProfile = await profileService.getProfile(userId);

    if (targetProfile && targetProfile.isBanned === 1) {
      // Check if viewer is admin
      const auth = await authenticateUser(c);
      const isViewerAdmin =
        "session" in auth && auth.session && auth.session.role === "admin";

      // If user is banned and viewer is not admin, return empty array
      if (!isViewerAdmin) {
        return c.json(
          createPaginationResponse([], filters.limit, filters.offset),
        );
      }
    }

    // Expire old listings first
    await listingService.expireOldListings();

    const listings = await listingService.getListingsWithImages({
      ...filters,
      userId,
    });

    return c.json(
      createPaginationResponse(listings, filters.limit, filters.offset),
    );
  } catch (error) {
    console.error("Error fetching user listings:", error);
    return c.json({ error: "Failed to fetch user listings" }, 500);
  }
};

export const getListingById = async (c: Context<{ Bindings: Env }>) => {
  try {
    const listingIdResult = parseListingId(c);
    if (listingIdResult.error) {
      return c.json(
        { error: listingIdResult.error.message },
        listingIdResult.error.status,
      );
    }

    const db = createDatabase(c.env.DB);
    const listingService = new ListingService(db, c.env);

    // Expire old listings first
    await listingService.expireOldListings();

    const listing = await listingService.getListingByIdWithImages(
      listingIdResult.listingId,
    );

    if (!listing) {
      return c.json({ error: "Listing not found" }, 404);
    }

    return c.json({ listing });
  } catch (error) {
    console.error("Error fetching listing:", error);
    return c.json({ error: "Failed to fetch listing" }, 500);
  }
};

export const createListing = async (c: Context<{ Bindings: Env }>) => {
  try {
    const authResult = await authenticateUser(c);
    if (authResult.error) {
      return c.json(
        { error: authResult.error.message },
        authResult.error.status,
      );
    }

    const body = await c.req.json();

    // Validate input
    if (
      !body.title ||
      typeof body.title !== "string" ||
      body.title.trim() === ""
    ) {
      return c.json({ error: "Title is required" }, 400);
    }
    if (!body.description || typeof body.description !== "string") {
      return c.json({ error: "Description is required" }, 400);
    }
    if (
      typeof body.price !== "number" ||
      body.price < PRICE_MIN ||
      body.price > PRICE_MAX
    ) {
      return c.json(
        {
          error: `Price must be between $${PRICE_MIN / 100} and $${PRICE_MAX / 100}`,
        },
        400,
      );
    }
    if (!body.category || !CATEGORIES.find((cat) => cat.id === body.category)) {
      return c.json({ error: "Valid category is required" }, 400);
    }

    const db = createDatabase(c.env.DB);
    const listingService = new ListingService(db, c.env);

    const newListing = await listingService.createListing(
      authResult.session.userId,
      authResult.session.username || `user_${authResult.session.userId}`,
      authResult.session.displayName,
      {
        title: body.title.trim(),
        description: body.description,
        price: body.price,
        category: body.category as CategoryId,
      },
    );

    return c.json({ listing: newListing }, 201);
  } catch (error) {
    console.error("Error creating listing:", error);
    return c.json({ error: "Failed to create listing" }, 500);
  }
};

export const updateListing = async (c: Context<{ Bindings: Env }>) => {
  try {
    const authResult = await authenticateUser(c);
    if (authResult.error) {
      return c.json(
        { error: authResult.error.message },
        authResult.error.status,
      );
    }

    const listingIdResult = parseListingId(c);
    if (listingIdResult.error) {
      return c.json(
        { error: listingIdResult.error.message },
        listingIdResult.error.status,
      );
    }

    const body = await c.req.json();

    // Validate optional fields
    if (
      body.title !== undefined &&
      (typeof body.title !== "string" || body.title.trim() === "")
    ) {
      return c.json({ error: "Title must be a non-empty string" }, 400);
    }
    if (
      body.price !== undefined &&
      (typeof body.price !== "number" ||
        body.price < PRICE_MIN ||
        body.price > PRICE_MAX)
    ) {
      return c.json(
        {
          error: `Price must be between $${PRICE_MIN / 100} and $${PRICE_MAX / 100}`,
        },
        400,
      );
    }
    if (
      body.category !== undefined &&
      !CATEGORIES.find((cat) => cat.id === body.category)
    ) {
      return c.json({ error: "Invalid category" }, 400);
    }

    const db = createDatabase(c.env.DB);
    const listingService = new ListingService(db, c.env);

    // Check ownership
    const existingListing = await listingService.getListingById(
      listingIdResult.listingId,
    );
    if (!existingListing) {
      return c.json({ error: "Listing not found" }, 404);
    }
    if (existingListing.userId !== authResult.session.userId) {
      return c.json({ error: "Not authorized to update this listing" }, 403);
    }

    const updatedListing = await listingService.updateListing(
      listingIdResult.listingId,
      authResult.session.userId,
      {
        title: body.title ? body.title.trim() : undefined,
        description: body.description,
        price: body.price,
        category: body.category,
      },
    );

    if (!updatedListing) {
      return c.json({ error: "Failed to update listing" }, 500);
    }

    return c.json({ listing: updatedListing });
  } catch (error) {
    console.error("Error updating listing:", error);
    return c.json({ error: "Failed to update listing" }, 500);
  }
};

export const deleteListing = async (c: Context<{ Bindings: Env }>) => {
  try {
    const authResult = await authenticateUser(c);
    if (authResult.error) {
      return c.json(
        { error: authResult.error.message },
        authResult.error.status,
      );
    }

    const listingIdResult = parseListingId(c);
    if (listingIdResult.error) {
      return c.json(
        { error: listingIdResult.error.message },
        listingIdResult.error.status,
      );
    }

    const db = createDatabase(c.env.DB);
    const listingService = new ListingService(db, c.env);
    const imageService = new ImageService(db, c.env.IMAGES);

    // Check ownership or admin status
    const existingListing = await listingService.getListingById(
      listingIdResult.listingId,
    );
    if (!existingListing) {
      return c.json({ error: "Listing not found" }, 404);
    }

    const isOwner = existingListing.userId === authResult.session.userId;
    const isAdmin = authResult.session.role === "admin";

    if (!isOwner && !isAdmin) {
      return c.json({ error: "Not authorized to delete this listing" }, 403);
    }

    // If admin is deleting someone else's listing, notify the owner
    const shouldNotify = isAdmin && !isOwner;
    let listingOwnerTelegramId: number | null = null;

    if (shouldNotify) {
      const { ProfileService } = await import("../services/profile-service");
      const profileService = new ProfileService(c.env.DB);
      const profile = await profileService.getProfile(existingListing.userId);
      listingOwnerTelegramId = profile?.telegramId ?? null;
    }

    // Clean up R2 images before deleting listing
    await imageService.cleanupListingImages(listingIdResult.listingId);

    // Delete listing
    const deletedListing =
      isAdmin && !isOwner
        ? await listingService.deleteListingByIdOnly(listingIdResult.listingId)
        : await listingService.deleteListing(
            listingIdResult.listingId,
            authResult.session.userId,
          );

    if (!deletedListing) {
      return c.json({ error: "Failed to delete listing" }, 500);
    }

    // Send notification if admin deleted another user's listing
    if (shouldNotify && listingOwnerTelegramId) {
      const bot = getBotInstance(c.env);
      await sendPostDeletedNotification(
        listingOwnerTelegramId,
        listingIdResult.listingId,
        bot,
      );
    }

    return c.json({ message: "Listing deleted successfully" });
  } catch (error) {
    console.error("Error deleting listing:", error);
    return c.json({ error: "Failed to delete listing" }, 500);
  }
};

export const bumpListing = async (c: Context<{ Bindings: Env }>) => {
  try {
    const authResult = await authenticateUser(c);
    if (authResult.error) {
      return c.json(
        { error: authResult.error.message },
        authResult.error.status,
      );
    }

    const listingIdResult = parseListingId(c);
    if (listingIdResult.error) {
      return c.json(
        { error: listingIdResult.error.message },
        listingIdResult.error.status,
      );
    }

    const body = await c.req.json();
    const isPaid = body.isPaid === true;

    const db = createDatabase(c.env.DB);
    const bumpService = new BumpService(db, c.env);

    // For paid bumps, payment will be handled through webhook
    // For now, we'll handle free bumps directly
    if (!isPaid) {
      const bumpedListing = await bumpService.bumpListing({
        listingId: listingIdResult.listingId,
        userId: authResult.session.userId,
        isPaid: false,
      });

      return c.json({ listing: bumpedListing });
    } else {
      // Paid bump flow will be handled via Telegram payment webhook
      // Return payment URL/invoice here
      return c.json({
        message:
          "Paid bump requires payment - to be implemented with Telegram Stars",
      });
    }
  } catch (error) {
    console.error("Error bumping listing:", error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to bump listing",
      },
      500,
    );
  }
};

export const archiveListing = async (c: Context<{ Bindings: Env }>) => {
  try {
    const authResult = await authenticateUser(c);
    if (authResult.error) {
      return c.json(
        { error: authResult.error.message },
        authResult.error.status,
      );
    }

    // Admin only
    if (authResult.session.role !== "admin") {
      return c.json({ error: "Admin access required" }, 403);
    }

    const listingIdResult = parseListingId(c);
    if (listingIdResult.error) {
      return c.json(
        { error: listingIdResult.error.message },
        listingIdResult.error.status,
      );
    }

    const body = await c.req.json();
    if (!body.reason || typeof body.reason !== "string") {
      return c.json({ error: "Reason is required" }, 400);
    }

    const db = createDatabase(c.env.DB);
    const adminService = new AdminService(db, c.env);

    const result = await adminService.archiveListing(
      listingIdResult.listingId,
      body.reason,
    );

    if (!result.success) {
      return c.json(
        { error: result.error || "Failed to archive listing" },
        500,
      );
    }

    return c.json({
      message: "Listing archived successfully",
      listing: result.listing,
    });
  } catch (error) {
    console.error("Error archiving listing:", error);
    return c.json({ error: "Failed to archive listing" }, 500);
  }
};

export const uploadListingImages = async (c: Context<{ Bindings: Env }>) => {
  try {
    const authResult = await authenticateUser(c);
    if (authResult.error) {
      return c.json(
        { error: authResult.error.message },
        authResult.error.status,
      );
    }

    const listingIdResult = parseListingId(c);
    if (listingIdResult.error) {
      return c.json(
        { error: listingIdResult.error.message },
        listingIdResult.error.status,
      );
    }

    const db = createDatabase(c.env.DB);
    const listingService = new ListingService(db, c.env);
    const imageService = new ImageService(db, c.env.IMAGES);

    // Check if listing exists and user owns it
    const existingListing = await listingService.getListingById(
      listingIdResult.listingId,
    );
    if (!existingListing) {
      return c.json({ error: "Listing not found" }, 404);
    }
    if (existingListing.userId !== authResult.session.userId) {
      return c.json(
        { error: "Not authorized to upload images to this listing" },
        403,
      );
    }

    // Parse multipart form data
    const formData = await c.req.formData();
    const images: ImageUploadData[] = [];

    for (const [key, value] of formData.entries()) {
      if (key.startsWith("image_") && value instanceof File) {
        const arrayBuffer = await value.arrayBuffer();

        // Validate image
        if (!(await imageService.validateImageFile(arrayBuffer, value.type))) {
          return c.json({ error: `Invalid image file: ${value.name}` }, 400);
        }

        // Get thumbnail data from form
        const thumbnailKey = key.replace("image_", "thumbnail_");
        const thumbnailFile = formData.get(thumbnailKey) as File;
        if (!thumbnailFile) {
          return c.json(
            { error: `Thumbnail missing for image: ${value.name}` },
            400,
          );
        }

        const thumbnailBuffer = await thumbnailFile.arrayBuffer();
        if (!(await imageService.validateThumbnailFile(thumbnailBuffer))) {
          return c.json(
            { error: `Invalid thumbnail file: ${value.name}` },
            400,
          );
        }

        // Get metadata from form
        const orderKey = key.replace("image_", "order_");
        const widthKey = key.replace("image_", "width_");
        const heightKey = key.replace("image_", "height_");

        const uploadOrder = parseInt(formData.get(orderKey) as string) || 1;
        const width = parseInt(formData.get(widthKey) as string) || 0;
        const height = parseInt(formData.get(heightKey) as string) || 0;

        images.push({
          originalName: value.name,
          mimeType: value.type,
          fileSize: arrayBuffer.byteLength,
          width,
          height,
          uploadOrder,
          imageBuffer: arrayBuffer,
          thumbnailBuffer,
        });
      }
    }

    if (images.length === 0) {
      return c.json({ error: "No valid images provided" }, 400);
    }

    if (images.length > 10) {
      return c.json({ error: "Maximum 10 images allowed per listing" }, 400);
    }

    // Check if adding these images would exceed the limit
    const currentImageCount = await imageService.getListingImageCount(
      listingIdResult.listingId,
    );
    if (currentImageCount + images.length > 10) {
      return c.json({ error: "Maximum 10 images allowed per listing" }, 400);
    }

    // Upload all images
    const uploadedImages = await imageService.uploadListingImages(
      listingIdResult.listingId,
      images,
    );

    return c.json(
      {
        message: "Images uploaded successfully",
        images: uploadedImages.map((img) => ({
          id: img.id,
          originalName: img.originalName,
          uploadOrder: img.uploadOrder,
          width: img.width,
          height: img.height,
          fileSize: img.fileSize,
        })),
      },
      201,
    );
  } catch (error) {
    console.error("Error uploading images:", error);
    return c.json({ error: "Failed to upload images" }, 500);
  }
};

export const deleteListingImage = async (c: Context<{ Bindings: Env }>) => {
  try {
    const authResult = await authenticateUser(c);
    if (authResult.error) {
      return c.json(
        { error: authResult.error.message },
        authResult.error.status,
      );
    }

    const listingIdResult = parseListingId(c);
    if (listingIdResult.error) {
      return c.json(
        { error: listingIdResult.error.message },
        listingIdResult.error.status,
      );
    }

    const imageId = parseInt(c.req.param("imageId"), 10);
    if (isNaN(imageId)) {
      return c.json({ error: "Invalid image ID" }, 400);
    }

    const db = createDatabase(c.env.DB);
    const listingService = new ListingService(db, c.env);
    const imageService = new ImageService(db, c.env.IMAGES);

    // Check if listing exists and user owns it
    const existingListing = await listingService.getListingById(
      listingIdResult.listingId,
    );
    if (!existingListing) {
      return c.json({ error: "Listing not found" }, 404);
    }
    if (existingListing.userId !== authResult.session.userId) {
      return c.json(
        { error: "Not authorized to delete images from this listing" },
        403,
      );
    }

    const deleted = await imageService.deleteListingImage(
      imageId,
      listingIdResult.listingId,
    );
    if (!deleted) {
      return c.json({ error: "Image not found" }, 404);
    }

    return c.json({ message: "Image deleted successfully" });
  } catch (error) {
    console.error("Error deleting image:", error);
    return c.json({ error: "Failed to delete image" }, 500);
  }
};
