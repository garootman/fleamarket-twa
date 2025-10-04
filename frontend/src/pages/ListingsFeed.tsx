import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { listingsApi, type Listing, type ListingFilters } from "../services/listingsApi";
import { ListingTimer } from "../components/ListingTimer";
import { CATEGORIES, formatPrice, getCategoryById } from "../constants";
import { config } from "../config";

export default function ListingsFeed() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [sortBy, setSortBy] = useState<'price' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);

  const limit = 20;

  const loadListings = useCallback(async (reset = false) => {
    try {
      setLoading(true);
      const offset = reset ? 0 : page * limit;

      const filters: ListingFilters = {
        category: selectedCategory || undefined,
        search: searchQuery || undefined,
        priceMin: priceMin ? parseInt(priceMin) * 100 : undefined,
        priceMax: priceMax ? parseInt(priceMax) * 100 : undefined,
        sortBy,
        sortOrder,
      };

      const response = await listingsApi.getAllListings(filters, limit, offset);

      if (reset) {
        setListings(response.listings);
        setPage(0);
      } else {
        setListings(prev => [...prev, ...response.listings]);
      }

      setHasMore(response.pagination.hasMore);
    } catch (err) {
      console.error('Failed to load listings:', err);
    } finally {
      setLoading(false);
    }
  }, [page, selectedCategory, searchQuery, priceMin, priceMax, sortBy, sortOrder]);

  useEffect(() => {
    loadListings(true);
  }, [selectedCategory, searchQuery, priceMin, priceMax, sortBy, sortOrder]);

  const handleLoadMore = () => {
    setPage(prev => prev + 1);
  };

  useEffect(() => {
    if (page > 0) {
      loadListings(false);
    }
  }, [page]);

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId === selectedCategory ? '' : categoryId);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const clearFilters = () => {
    setSelectedCategory('');
    setSearchQuery('');
    setPriceMin('');
    setPriceMax('');
    setSortBy('date');
    setSortOrder('desc');
  };

  return (
    <div className="max-w-4xl mx-auto pb-20">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-900">Marketplace</h1>
            <button
              onClick={() => navigate('/create-listing')}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-600"
            >
              + New Listing
            </button>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="mb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search listings..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </form>

          {/* Category Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <button
              onClick={() => setSelectedCategory('')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === ''
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {CATEGORIES.map((category) => (
              <button
                key={category.id}
                onClick={() => handleCategorySelect(category.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === category.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {category.emoji} {category.name}
              </button>
            ))}
          </div>

          {/* Filters Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="mt-2 text-sm text-blue-500 hover:text-blue-600 font-medium"
          >
            {showFilters ? '▼' : '▶'} Filters & Sort
          </button>

          {/* Filters Panel */}
          {showFilters && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg space-y-3">
              {/* Price Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price Range ($)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={priceMin}
                    onChange={(e) => setPriceMin(e.target.value)}
                    placeholder="Min"
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm"
                  />
                  <span className="self-center text-gray-500">-</span>
                  <input
                    type="number"
                    value={priceMax}
                    onChange={(e) => setPriceMax(e.target.value)}
                    placeholder="Max"
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm"
                  />
                </div>
              </div>

              {/* Sort */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sort By
                </label>
                <div className="flex gap-2">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'price' | 'date')}
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm"
                  >
                    <option value="date">Date</option>
                    <option value="price">Price</option>
                  </select>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm"
                  >
                    <option value="desc">{sortBy === 'price' ? 'High to Low' : 'Newest'}</option>
                    <option value="asc">{sortBy === 'price' ? 'Low to High' : 'Oldest'}</option>
                  </select>
                </div>
              </div>

              <button
                onClick={clearFilters}
                className="w-full bg-gray-200 text-gray-700 py-1.5 rounded text-sm font-medium hover:bg-gray-300"
              >
                Clear All Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Listings Grid */}
      <div className="p-4">
        {loading && listings.length === 0 ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading listings...</p>
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg mb-2">No listings found</p>
            <p className="text-gray-500 text-sm">Try adjusting your filters or create a new listing</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {listings.map((listing) => {
              const category = getCategoryById(listing.category);
              const image = listing.images?.[0];

              return (
                <div
                  key={listing.id}
                  onClick={() => navigate(`/listings/${listing.id}`)}
                  className="bg-white rounded-lg shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                >
                  {/* Image */}
                  {image ? (
                    <img
                      src={`${config.apiBaseUrl}/r2/${image.thumbnailKey}`}
                      alt={listing.title}
                      className="w-full h-40 object-cover"
                    />
                  ) : (
                    <div className="w-full h-40 bg-gray-200 flex items-center justify-center text-4xl">
                      {category?.emoji || '📦'}
                    </div>
                  )}

                  {/* Content */}
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 flex-1">
                        {listing.title}
                      </h3>
                      {category && (
                        <span className="text-lg flex-shrink-0">{category.emoji}</span>
                      )}
                    </div>

                    <div className="text-lg font-bold text-blue-600 mb-2">
                      {formatPrice(listing.price)}
                    </div>

                    <ListingTimer
                      expiresAt={listing.expiresAt}
                      className="text-xs"
                      showIcon={false}
                    />

                    {listing.profile && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                        {listing.profile.profileImageKey && (
                          <img
                            src={`${config.apiBaseUrl}/r2/${listing.profile.profileImageKey}`}
                            alt=""
                            className="w-4 h-4 rounded-full object-cover"
                          />
                        )}
                        <span className="truncate">{listing.displayName}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Load More */}
        {hasMore && !loading && listings.length > 0 && (
          <button
            onClick={handleLoadMore}
            className="w-full mt-4 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200"
          >
            Load More
          </button>
        )}

        {loading && listings.length > 0 && (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          </div>
        )}
      </div>
    </div>
  );
}
