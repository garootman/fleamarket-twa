# 🛒 Flea Market Marketplace - Implementation Plan

## Overview
Transform the current feed-based app into a full marketplace where users can both sell and buy items. This plan covers all technical changes required to support listings, categories, search/filter, lifecycle management, and marketplace-specific features.

---

## 📋 Requirements Summary

### Listings (evolved from Posts)
- **Dedicated listing detail page**
- **Price**: $0 - $1,000,000 USD
- **Category**: From predefined flat list (10 categories)
- **Status**: `active`, `expired`, `archived`
- **Lifecycle**:
  - Expires in 3 days by default
  - Can be bumped once per day per listing:
    - Free bump → extends 3 days
    - Paid bump (1 Star) → extends 7 days
  - Visual timer showing time left
- **Title + Description** (already exists)
- **Images** (already exists, keep 10 max)

### Categories
- Flat list of 10 categories (text + emoji)
- Hardcoded in shared constants file
- Added to feed navigation
- Included in search

### Search & Filters
- **Filters** (combinable):
  - By category
  - By price range
  - By text (fulltext fuzzy search in title + description + category)
- **Sorting**:
  - By price (asc/desc)
  - By date (newest/oldest)
- **Pagination**: Infinite scroll (already implemented)

### Profile Pages
- **My Profile**: Show all listings (active, expired, archived)
- **Other's Profile**: Show only active listings
- **Admin viewing others**: Show all listings

### Admin Features
- Delete listings (already works with posts)
- Archive other's listings with message → user receives Telegram notification explaining why

### Contact & Share
- **Contact Button**: Opens Telegram DM with seller (link to profile)
- **Share**: Deferred to later phase

### Deployment
- No cron triggers - check expiry on-demand when loading feed/listings

---

## 🗂️ Implementation Phases

### **Phase 1: Database Schema & Categories**
**Estimated: 2-3 hours**

#### 1.1 Update Database Schema (`backend/src/db/schema.ts`)
- Rename `posts` table → `listings`
- Add columns:
  - `title` (VARCHAR, NOT NULL) - separate from description
  - `price` (INTEGER, NOT NULL) - stored in cents (0 - 100,000,000)
  - `category` (VARCHAR, NOT NULL) - from predefined list
  - `status` (VARCHAR, NOT NULL) - enum: active, expired, archived
  - `expiresAt` (INTEGER, NOT NULL) - Unix timestamp
  - `lastBumpedAt` (INTEGER, NULLABLE) - Unix timestamp of last bump
  - `bumpCount` (INTEGER, DEFAULT 0) - track bump history
- Keep existing: `userId`, `description`, `createdAt`, `updatedAt`

#### 1.2 Update Related Tables
- Rename `postImages` → `listingImages`
- Update foreign key: `postId` → `listingId`
- Update `payments` table: add `listingId` for bump payments

#### 1.3 Create Migration
```bash
cd backend && npm run db:generate
```
- Review generated migration
- Apply locally: `npm run db:migrate:local`

#### 1.4 Define Categories (`shared/constants.ts` - new file)
```typescript
export const CATEGORIES = [
  { id: 'electronics', name: 'Electronics', emoji: '📱' },
  { id: 'clothing', name: 'Clothing', emoji: '👕' },
  { id: 'furniture', name: 'Furniture', emoji: '🛋️' },
  { id: 'books', name: 'Books', emoji: '📚' },
  { id: 'toys', name: 'Toys', emoji: '🧸' },
  { id: 'sports', name: 'Sports', emoji: '⚽' },
  { id: 'tools', name: 'Tools', emoji: '🔧' },
  { id: 'home', name: 'Home & Garden', emoji: '🏡' },
  { id: 'automotive', name: 'Automotive', emoji: '🚗' },
  { id: 'other', name: 'Other', emoji: '📦' },
] as const;

export type CategoryId = typeof CATEGORIES[number]['id'];
```
- Share between frontend and backend via symlink or copy

---

### **Phase 2: Backend API Updates**
**Estimated: 4-5 hours**

#### 2.1 Update Listing Service (`backend/src/services/listings.ts`)
Rename from `posts.ts`, update:
- `createListing()`:
  - Add title, price, category validation
  - Set `status = 'active'`
  - Calculate `expiresAt = now + 3 days`
- `updateListing()`: Allow updating title, price, category, description
- `getListing()`: Return single listing with all fields
- `getListings()`:
  - Add filters: category, priceMin, priceMax, search, status
  - Add sorting: price, date
  - Check expiry on-demand: if `expiresAt < now` && `status === 'active'`, update to `expired`
  - Support pagination (offset/limit)

#### 2.2 New: Bump Service (`backend/src/services/bump.ts`)
- `bumpListing(listingId, userId, isPaid: boolean)`:
  - Validate: user owns listing
  - Validate: last bump > 24h ago (check `lastBumpedAt`)
  - If paid: create Telegram Stars invoice, await payment
  - Update listing:
    - `expiresAt = now + (isPaid ? 7 : 3) days`
    - `lastBumpedAt = now`
    - `bumpCount += 1`
    - `status = 'active'` (if was expired)
  - Return updated listing

#### 2.3 New: Admin Archive Service
- `archiveListing(listingId, adminId, reason: string)`:
  - Validate: admin role
  - Update listing: `status = 'archived'`
  - Send Telegram message to listing owner with reason
  - Use Telegram Bot API: `sendMessage(userId, message)`

#### 2.4 Update API Routes (`backend/src/api/`)
- Rename `/api/posts` → `/api/listings`
- `GET /api/listings`: Add query params for filters/sort
- `GET /api/listings/:id`: Return single listing
- `POST /api/listings`: Create with new fields
- `PATCH /api/listings/:id`: Update listing
- `DELETE /api/listings/:id`: Soft delete (set archived)
- `POST /api/listings/:id/bump`: Bump listing (free or paid)
- `POST /api/admin/listings/:id/archive`: Archive with reason (admin only)

#### 2.5 Update Payment Webhook (`backend/src/webhook.ts`)
- Handle bump payments (distinguish from post premium payments)
- On `successful_payment`: call `bumpListing()` with `isPaid = true`

---

### **Phase 3: Frontend - Core Listing Features**
**Estimated: 5-6 hours**

#### 3.1 Update API Client (`frontend/src/services/api.ts`)
- Rename post methods → listing methods
- Add types: `Listing`, `CreateListingDto`, `UpdateListingDto`
- Add filter/sort params to `getListings()`
- Add `getListing(id)`, `bumpListing(id, isPaid)`, `archiveListing(id, reason)`

#### 3.2 Create Listing Detail Page (`frontend/src/pages/ListingDetail.tsx`)
- Route: `/listings/:id`
- Fetch listing via API
- Display:
  - Image carousel (existing component)
  - Title, price (formatted USD), category badge
  - Description
  - Seller info (avatar, name, link to profile)
  - Time left countdown (visual timer)
  - Contact button (Telegram link: `https://t.me/{username}`)
  - Bump button (if owner):
    - Show "Free Bump (3 days)" or "Paid Bump (7 days, 1 Star)"
    - Disable if bumped < 24h ago
  - Archive button (if admin): modal with reason input
  - Delete button (if owner or admin)

#### 3.3 Update Feed Page (`frontend/src/pages/Feed.tsx`)
- Show listings as cards with:
  - Thumbnail (first image)
  - Title, price, category badge
  - Time left (e.g., "2d 5h left")
  - Click → navigate to `/listings/:id`
- Add category tabs (horizontal scroll)
- Add filters UI:
  - Category dropdown/tabs
  - Price range sliders
  - Search input (debounced)
  - Sort dropdown (price, date)
- Infinite scroll already implemented

#### 3.4 Update Create/Edit Listing (`frontend/src/pages/CreatePost.tsx` → `CreateListing.tsx`)
- Add form fields:
  - Title input
  - Price input (USD, validate 0-1,000,000)
  - Category dropdown
- Keep existing: description, image uploads
- On submit: POST to `/api/listings`

#### 3.5 Update Profile Page (`frontend/src/pages/UnifiedProfile.tsx`)
- **My Profile**: Show all listings (tabs: active, expired, archived)
- **Other's Profile**: Show only active listings
- **Admin viewing others**: Show all listings
- Replace post cards with listing cards

---

### **Phase 4: Lifecycle & Timer UI**
**Estimated: 3-4 hours**

#### 4.1 Expiry Check Middleware (`backend/src/middleware/expiry-check.ts`)
- On every `GET /api/listings` or `GET /api/listings/:id`:
  - Query listings with `status = 'active' AND expiresAt < now`
  - Batch update to `status = 'expired'`
  - Run before returning results

#### 4.2 Countdown Timer Component (`frontend/src/components/ListingTimer.tsx`)
- Input: `expiresAt` timestamp
- Display: "2d 5h 30m left" or "Expired"
- Update every minute
- Color code: green (>24h), yellow (24h-1h), red (<1h)

#### 4.3 Bump Flow
- **Frontend**:
  - Free bump: direct API call
  - Paid bump: create Telegram Stars invoice → open payment sheet → await webhook
- **Backend**:
  - Validate bump eligibility (24h cooldown)
  - Update `expiresAt`, `lastBumpedAt`, `bumpCount`

---

### **Phase 5: Search & Filters**
**Estimated: 3-4 hours**

#### 5.1 Backend Search (`backend/src/services/listings.ts`)
```typescript
getListings(filters: {
  category?: string,
  priceMin?: number,
  priceMax?: number,
  search?: string,
  sortBy?: 'price' | 'date',
  sortOrder?: 'asc' | 'desc',
  status?: string[],
  offset: number,
  limit: number
})
```
- Use Drizzle ORM `.where()` chaining
- Search: `WHERE (title LIKE %search% OR description LIKE %search% OR category LIKE %search%)`
- Consider SQLite FTS5 for better performance (optional enhancement)

#### 5.2 Frontend Filter UI
- **Category Filter**: Horizontal scroll tabs (all categories + "All")
- **Price Filter**: Range slider (react-slider or native input range)
- **Search**: Input with debounce (300ms)
- **Sort**: Dropdown (newest, oldest, price low-high, high-low)
- Apply filters → refetch listings with query params

---

### **Phase 6: Admin Archive Feature**
**Estimated: 2 hours**

#### 6.1 Backend
- Add admin middleware check (already exists)
- `POST /api/admin/listings/:id/archive { reason: string }`
- Send Telegram message to seller:
  ```
  ⚠️ Your listing "[Title]" has been archived by an admin.
  Reason: [reason]
  ```

#### 6.2 Frontend
- Archive button visible only to admins on listing detail page
- Modal with textarea for reason
- Confirmation step

---

### **Phase 7: Testing & Polish**
**Estimated: 3-4 hours**

#### 7.1 Update Tests
- Backend: `listings.test.ts`, `bump.test.ts`
- Frontend: `ListingDetail.test.tsx`, `Feed.test.tsx`
- Test edge cases:
  - Expiry transitions
  - Bump cooldown
  - Filter combinations
  - Admin permissions

#### 7.2 Type Safety
- Run `npm run typecheck` in both frontend/backend
- Ensure shared types (Category, Listing status)

#### 7.3 Migration Path
- Existing posts → listings migration script
- Set default values: `price = 0`, `category = 'other'`, `status = 'active'`, `expiresAt = createdAt + 3 days`

---

## 📦 Deliverables Checklist

### Database
- [ ] Schema updated: listings table with new columns
- [ ] Migration generated and applied
- [ ] postImages → listingImages renamed
- [ ] payments table updated for bump payments

### Backend
- [ ] Listings service with filters/sort/search
- [ ] Bump service (free/paid)
- [ ] Admin archive service with Telegram notifications
- [ ] API routes updated
- [ ] Expiry check on-demand
- [ ] Payment webhook for bumps

### Frontend
- [ ] Listing detail page with timer
- [ ] Feed with category tabs, filters, search
- [ ] Create/edit listing forms (title, price, category)
- [ ] Profile page showing listings (filtered by role)
- [ ] Bump UI (free/paid buttons)
- [ ] Admin archive UI
- [ ] Contact button (Telegram link)
- [ ] Countdown timer component

### Shared
- [ ] Categories constants file
- [ ] Shared types for Listing, Category

### Testing
- [ ] Backend tests updated
- [ ] Frontend tests updated
- [ ] Manual testing: create, bump, expire, archive flows
- [ ] Admin permissions tested

### Documentation
- [ ] Update CLAUDE.md with new architecture
- [ ] Update README with marketplace features
- [ ] API documentation for new endpoints

---

## 🚀 Estimated Timeline

| Phase | Hours | Dependencies |
|-------|-------|--------------|
| Phase 1: Database & Categories | 2-3 | None |
| Phase 2: Backend API | 4-5 | Phase 1 |
| Phase 3: Frontend Core | 5-6 | Phase 2 |
| Phase 4: Lifecycle & Timers | 3-4 | Phase 2, 3 |
| Phase 5: Search & Filters | 3-4 | Phase 2, 3 |
| Phase 6: Admin Archive | 2 | Phase 2, 3 |
| Phase 7: Testing & Polish | 3-4 | All |
| **Total** | **22-29 hours** | |

---

## 🎯 Success Criteria

- [ ] Users can create listings with title, price, category
- [ ] Listings expire after 3 days, can be bumped (free 3d, paid 7d)
- [ ] Feed shows filterable/sortable listings with category navigation
- [ ] Search works across title, description, category
- [ ] Profile pages show appropriate listings based on role
- [ ] Admin can archive listings with notification to seller
- [ ] Countdown timer visible on listings
- [ ] Telegram payment integration for paid bumps
- [ ] All existing tests pass
- [ ] No breaking changes to existing features

---

## 🔮 Future Enhancements (Out of Scope)
- Share button (deep links)
- Saved/favorited listings
- Direct messaging in-app
- Listing analytics (views, contact clicks)
- User ratings/reviews
- Image optimization for faster load
- Push notifications for expiring listings

---

## 📝 Notes

### Technical Decisions
1. **Price stored in cents**: Avoids floating-point errors (store 1000 = $10.00)
2. **On-demand expiry check**: Simpler than cron, acceptable for MVP
3. **Flat categories**: Easier to implement, can nest later if needed
4. **Search via LIKE**: Simple, fast enough for MVP; FTS5 later if slow
5. **Bump cooldown**: Stored in `lastBumpedAt`, checked on bump attempt

### Migration Strategy
1. Deploy database migration first (backwards compatible)
2. Update backend API (keep old endpoints during transition)
3. Deploy frontend with new routes
4. Run data migration script to convert posts → listings
5. Remove old endpoints after verification

### Risk Mitigation
- **Expiry race conditions**: Use atomic DB updates
- **Bump payment failures**: Idempotency via payment charge ID
- **Category changes**: Version categories, handle deprecated IDs
- **Large datasets**: Add indexes on `category`, `status`, `expiresAt`, `price`
