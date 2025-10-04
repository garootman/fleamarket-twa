import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { listingsApi, type Listing } from "../services/listingsApi";
import { useAuth } from "../contexts/AuthContext";
import { ListingTimer } from "../components/ListingTimer";
import {
  formatPrice,
  getCategoryById,
  BUMP_COOLDOWN_HOURS,
} from "../constants";
import { config } from "../config";

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { sessionId, user, isAdmin } = useAuth();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    loadListing();
  }, [id]);

  const loadListing = async () => {
    try {
      setLoading(true);
      const { listing: data } = await listingsApi.getListingById(Number(id));
      setListing(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load listing");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!sessionId || !listing) return;

    if (!confirm("Are you sure you want to delete this listing?")) return;

    try {
      await listingsApi.deleteListing(listing.id, sessionId);
      navigate("/");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete listing");
    }
  };

  const handleFreeBump = async () => {
    if (!sessionId || !listing) return;

    try {
      const result = await listingsApi.bumpListing(
        listing.id,
        false,
        sessionId,
      );
      if ("listing" in result) {
        setListing(result.listing);
        alert("Listing bumped successfully! Extended for 3 more days.");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to bump listing");
    }
  };

  const handlePaidBump = async () => {
    if (!sessionId || !listing) return;

    try {
      const result = await listingsApi.bumpListing(listing.id, true, sessionId);
      if ("message" in result) {
        alert(result.message);
      }
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to create bump payment",
      );
    }
  };

  const handleArchive = async () => {
    if (!sessionId || !listing || !archiveReason.trim()) return;

    try {
      await listingsApi.archiveListing(listing.id, archiveReason, sessionId);
      setShowArchiveModal(false);
      alert("Listing archived successfully");
      navigate("/");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to archive listing");
    }
  };

  const canBump = () => {
    if (!listing || !listing.lastBumpedAt) return true;

    const hoursSinceLastBump =
      (Date.now() - listing.lastBumpedAt) / (1000 * 60 * 60);
    return hoursSinceLastBump >= BUMP_COOLDOWN_HOURS;
  };

  const getTimeUntilNextBump = () => {
    if (!listing?.lastBumpedAt) return 0;

    const hoursSinceLastBump =
      (Date.now() - listing.lastBumpedAt) / (1000 * 60 * 60);
    return Math.max(0, Math.ceil(BUMP_COOLDOWN_HOURS - hoursSinceLastBump));
  };

  const isOwner = listing && user && listing.userId === user.id;
  const category = listing ? getCategoryById(listing.category) : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading listing...</p>
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error || "Listing not found"}</p>
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Back to Feed
          </button>
        </div>
      </div>
    );
  }

  const images = listing.images || [];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Image Carousel */}
      {images.length > 0 && (
        <div className="relative bg-black">
          <img
            src={`${config.apiBaseUrl}/r2/${images[currentImageIndex].imageKey}`}
            alt={listing.title}
            className="w-full h-96 object-contain"
          />
          {images.length > 1 && (
            <>
              <button
                onClick={() =>
                  setCurrentImageIndex((prev) =>
                    prev > 0 ? prev - 1 : images.length - 1,
                  )
                }
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full"
              >
                ←
              </button>
              <button
                onClick={() =>
                  setCurrentImageIndex((prev) =>
                    prev < images.length - 1 ? prev + 1 : 0,
                  )
                }
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full"
              >
                →
              </button>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                {images.map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-2 h-2 rounded-full ${idx === currentImageIndex ? "bg-white" : "bg-white/50"}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Header */}
        <div>
          <div className="flex items-start justify-between mb-2">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {listing.title}
              </h1>
              {category && (
                <span className="inline-block mt-1 px-2 py-1 bg-gray-100 rounded text-sm">
                  {category.emoji} {category.name}
                </span>
              )}
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-blue-600">
                {formatPrice(listing.price)}
              </div>
              <ListingTimer
                expiresAt={listing.expiresAt}
                className="text-sm justify-end"
              />
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-2">Description</h2>
          <p className="text-gray-700 whitespace-pre-wrap">
            {listing.description}
          </p>
        </div>

        {/* Seller Info */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-2">Seller</h2>
          <div className="flex items-center gap-3">
            {listing.profile?.profileImageKey && (
              <img
                src={`${config.apiBaseUrl}/r2/${listing.profile.profileImageKey}`}
                alt={listing.displayName}
                className="w-12 h-12 rounded-full object-cover"
              />
            )}
            <div>
              <p className="font-medium text-gray-900">{listing.displayName}</p>
              {listing.profile?.username && (
                <p className="text-sm text-gray-600">
                  @{listing.profile.username}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          {/* Contact Button */}
          {listing.profile?.username && !isOwner && (
            <a
              href={`https://t.me/${listing.profile.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-blue-500 text-white text-center py-3 rounded-lg font-medium hover:bg-blue-600"
            >
              💬 Contact Seller
            </a>
          )}

          {/* Owner Actions */}
          {isOwner && (
            <>
              {canBump() ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleFreeBump}
                    className="bg-green-500 text-white py-3 rounded-lg font-medium hover:bg-green-600"
                  >
                    🆓 Free Bump (+3d)
                  </button>
                  <button
                    onClick={handlePaidBump}
                    className="bg-yellow-500 text-white py-3 rounded-lg font-medium hover:bg-yellow-600"
                  >
                    ⭐ Paid Bump (+7d)
                  </button>
                </div>
              ) : (
                <div className="bg-gray-100 text-gray-600 py-3 rounded-lg text-center">
                  Next bump available in {getTimeUntilNextBump()}h
                </div>
              )}

              <button
                onClick={() => navigate(`/edit-listing/${listing.id}`)}
                className="w-full bg-gray-200 text-gray-900 py-3 rounded-lg font-medium hover:bg-gray-300"
              >
                ✏️ Edit Listing
              </button>

              <button
                onClick={handleDelete}
                className="w-full bg-red-500 text-white py-3 rounded-lg font-medium hover:bg-red-600"
              >
                🗑️ Delete Listing
              </button>
            </>
          )}

          {/* Admin Actions */}
          {isAdmin && !isOwner && (
            <>
              <button
                onClick={() => setShowArchiveModal(true)}
                className="w-full bg-orange-500 text-white py-3 rounded-lg font-medium hover:bg-orange-600"
              >
                📦 Archive Listing
              </button>
              <button
                onClick={handleDelete}
                className="w-full bg-red-500 text-white py-3 rounded-lg font-medium hover:bg-red-600"
              >
                🗑️ Delete Listing
              </button>
            </>
          )}
        </div>

        {/* Listing Info */}
        <div className="bg-gray-100 rounded-lg p-3 text-sm text-gray-600 space-y-1">
          <p>Listing ID: {listing.id}</p>
          <p>Posted: {new Date(listing.createdAt).toLocaleDateString()}</p>
          {listing.bumpCount > 0 && <p>Bumped: {listing.bumpCount} time(s)</p>}
          <p>Status: {listing.status}</p>
        </div>
      </div>

      {/* Archive Modal */}
      {showArchiveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Archive Listing</h3>
            <p className="text-gray-600 mb-4">
              Please provide a reason for archiving this listing. The seller
              will be notified.
            </p>
            <textarea
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 mb-4"
              rows={4}
              placeholder="Reason for archiving..."
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowArchiveModal(false)}
                className="flex-1 bg-gray-200 text-gray-900 py-2 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleArchive}
                disabled={!archiveReason.trim()}
                className="flex-1 bg-orange-500 text-white py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
