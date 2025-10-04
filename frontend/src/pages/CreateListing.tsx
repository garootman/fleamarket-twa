import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listingsApi, type CreateListingData } from '../services/listingsApi';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORIES, parsePriceInput, PRICE_MAX, type CategoryId } from '../constants';

export default function CreateListing() {
  const navigate = useNavigate();
  const { sessionId } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<CategoryId>('other');
  const [images, setImages] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      if (images.length + files.length > 10) {
        setError('Maximum 10 images allowed');
        return;
      }
      setImages(prev => [...prev, ...files]);
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!sessionId) {
      setError('Not authenticated');
      return;
    }

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (!description.trim()) {
      setError('Description is required');
      return;
    }

    const priceInCents = parsePriceInput(price);
    if (priceInCents < 0 || priceInCents > PRICE_MAX) {
      setError('Invalid price');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Create listing
      const data: CreateListingData = {
        title: title.trim(),
        description: description.trim(),
        price: priceInCents,
        category,
      };

      const { listing } = await listingsApi.createListing(data, sessionId);

      // Upload images if any
      if (images.length > 0) {
        const formData = new FormData();

        for (let i = 0; i < images.length; i++) {
          const image = images[i];

          // For simplicity, we'll upload original images without client-side processing
          // In production, you'd want to compress/resize on the client
          formData.append(`image_${i}`, image);
          formData.append(`thumbnail_${i}`, image); // Same for now
          formData.append(`order_${i}`, i.toString());
          formData.append(`width_${i}`, '800');
          formData.append(`height_${i}`, '600');
        }

        await listingsApi.uploadImages(listing.id, formData, sessionId);
      }

      navigate(`/listings/${listing.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create listing');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-2xl mx-auto p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Create Listing</h1>
          <button
            onClick={() => navigate(-1)}
            className="text-gray-600 hover:text-gray-900"
          >
            ✕ Cancel
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What are you selling?"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={100}
              required
            />
            <p className="text-xs text-gray-500 mt-1">{title.length}/100</p>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CategoryId)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.emoji} {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Price (USD) *
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                step="0.01"
                min="0"
                max="1000000"
                required
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Enter 0 for free items</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your item in detail..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={6}
              maxLength={2000}
              required
            />
            <p className="text-xs text-gray-500 mt-1">{description.length}/2000</p>
          </div>

          {/* Images */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Images (up to 10)
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageChange}
              className="hidden"
              id="image-upload"
            />
            <label
              htmlFor="image-upload"
              className="block w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
            >
              <span className="text-gray-600">📷 Click to upload images</span>
            </label>

            {images.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {images.map((image, index) => (
                  <div key={index} className="relative">
                    <img
                      src={URL.createObjectURL(image)}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-2">ℹ️ Listing Info</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Your listing will be active for 3 days</li>
              <li>• You can bump it once per day to extend visibility</li>
              <li>• Free bump: +3 days | Paid bump (1 ⭐): +7 days</li>
              <li>• Buyers can contact you via Telegram</li>
            </ul>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !title.trim() || !description.trim() || !price}
            className="w-full bg-blue-500 text-white py-4 rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Listing'}
          </button>
        </form>
      </div>
    </div>
  );
}
