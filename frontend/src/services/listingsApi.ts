import { config } from "../config";
import type { CategoryId, ListingStatus } from "../constants";

export interface Listing {
  id: number;
  userId: number;
  username: string;
  displayName: string;
  title: string;
  description: string;
  price: number; // in cents
  category: CategoryId;
  status: ListingStatus;
  expiresAt: number; // Unix timestamp in milliseconds
  lastBumpedAt: number | null;
  bumpCount: number;
  starCount: number;
  paymentId: string | null;
  isPaymentPending: number;
  createdAt: string;
  updatedAt: string;
  profile?: {
    displayName: string | null;
    bio: string | null;
    profileImageKey: string | null;
    username: string | null;
  } | null;
  images?: ImageData[];
}

export interface ImageData {
  id: number;
  imageKey: string;
  thumbnailKey: string;
  width: number;
  height: number;
  originalName: string;
  fileSize: number;
  uploadOrder: number;
}

export interface CreateListingData {
  title: string;
  description: string;
  price: number; // in cents
  category: CategoryId;
}

export interface UpdateListingData {
  title?: string;
  description?: string;
  price?: number;
  category?: CategoryId;
}

export interface ListingsResponse {
  listings: Listing[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface ListingFilters {
  category?: string;
  priceMin?: number;
  priceMax?: number;
  search?: string;
  sortBy?: "price" | "date";
  sortOrder?: "asc" | "desc";
  status?: ListingStatus[];
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new ApiError(response.status, errorData.error || "Request failed");
  }
  return response.json();
};

export const listingsApi = {
  // Fetch all listings with filters
  async getAllListings(
    filters: ListingFilters = {},
    limit = 50,
    offset = 0,
  ): Promise<ListingsResponse> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });

    if (filters.category) params.append("category", filters.category);
    if (filters.priceMin !== undefined)
      params.append("priceMin", filters.priceMin.toString());
    if (filters.priceMax !== undefined)
      params.append("priceMax", filters.priceMax.toString());
    if (filters.search) params.append("search", filters.search);
    if (filters.sortBy) params.append("sortBy", filters.sortBy);
    if (filters.sortOrder) params.append("sortOrder", filters.sortOrder);
    if (filters.status && filters.status.length > 0) {
      params.append("status", filters.status.join(","));
    }

    const response = await fetch(
      `${config.apiBaseUrl}/api/listings?${params}`,
      {
        credentials: "include",
      },
    );
    return handleResponse(response);
  },

  // Fetch single listing by ID
  async getListingById(listingId: number): Promise<{ listing: Listing }> {
    const response = await fetch(
      `${config.apiBaseUrl}/api/listings/${listingId}`,
      {
        credentials: "include",
      },
    );
    return handleResponse(response);
  },

  // Fetch listings by user ID
  async getUserListings(
    userId: number,
    filters: ListingFilters = {},
    limit = 50,
    offset = 0,
  ): Promise<ListingsResponse> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });

    if (filters.status && filters.status.length > 0) {
      params.append("status", filters.status.join(","));
    }

    const response = await fetch(
      `${config.apiBaseUrl}/api/listings/user/${userId}?${params}`,
      {
        credentials: "include",
      },
    );
    return handleResponse(response);
  },

  // Create a new listing
  async createListing(
    data: CreateListingData,
    sessionId: string,
  ): Promise<{ listing: Listing }> {
    const response = await fetch(`${config.apiBaseUrl}/api/listings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionId}`,
      },
      body: JSON.stringify(data),
      credentials: "include",
    });

    return handleResponse(response);
  },

  // Update a listing
  async updateListing(
    listingId: number,
    data: UpdateListingData,
    sessionId: string,
  ): Promise<{ listing: Listing }> {
    const response = await fetch(
      `${config.apiBaseUrl}/api/listings/${listingId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionId}`,
        },
        body: JSON.stringify(data),
        credentials: "include",
      },
    );

    return handleResponse(response);
  },

  // Delete a listing
  async deleteListing(
    listingId: number,
    sessionId: string,
  ): Promise<{ message: string }> {
    const response = await fetch(
      `${config.apiBaseUrl}/api/listings/${listingId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${sessionId}`,
        },
        credentials: "include",
      },
    );

    return handleResponse(response);
  },

  // Bump a listing (free or paid)
  async bumpListing(
    listingId: number,
    isPaid: boolean,
    sessionId: string,
  ): Promise<{ listing: Listing } | { message: string }> {
    const response = await fetch(
      `${config.apiBaseUrl}/api/listings/${listingId}/bump`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionId}`,
        },
        body: JSON.stringify({ isPaid }),
        credentials: "include",
      },
    );

    return handleResponse(response);
  },

  // Archive a listing (admin only)
  async archiveListing(
    listingId: number,
    reason: string,
    sessionId: string,
  ): Promise<{ message: string; listing: Listing }> {
    const response = await fetch(
      `${config.apiBaseUrl}/api/admin/listings/${listingId}/archive`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionId}`,
        },
        body: JSON.stringify({ reason }),
        credentials: "include",
      },
    );

    return handleResponse(response);
  },

  // Upload images to a listing
  async uploadImages(
    listingId: number,
    formData: FormData,
    sessionId: string,
  ): Promise<{ message: string; images: ImageData[] }> {
    const response = await fetch(
      `${config.apiBaseUrl}/api/listings/${listingId}/images`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionId}`,
        },
        body: formData,
        credentials: "include",
      },
    );

    return handleResponse(response);
  },

  // Delete an image from a listing
  async deleteImage(
    listingId: number,
    imageId: number,
    sessionId: string,
  ): Promise<{ message: string }> {
    const response = await fetch(
      `${config.apiBaseUrl}/api/listings/${listingId}/images/${imageId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${sessionId}`,
        },
        credentials: "include",
      },
    );

    return handleResponse(response);
  },
};

export { ApiError };
