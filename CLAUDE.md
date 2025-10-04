# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full-stack **marketplace** Telegram Web App with bot integration, deployed on Cloudflare Workers (backend) and Pages (frontend). Users can create listings with title, price, category, and images, browse/search/filter the marketplace, and contact sellers via Telegram. Features time-limited listings with bump system, admin moderation, and Telegram Stars payments for premium bumps.

Uses React + TypeScript frontend with Hono backend, D1 SQLite database, KV sessions, and R2 image storage.

## Architecture

### Monorepo Structure

- **Root**: Orchestration scripts and shared tooling
- **Backend** (`backend/`): Cloudflare Worker (Hono framework)
  - API endpoints (`src/api/`)
  - Telegram webhook handler (`src/webhook.ts`)
  - Database schema (`src/db/schema.ts` - Drizzle ORM)
  - Service layer (`src/services/`)
- **Frontend** (`frontend/`): React SPA
  - Uses Vite dev proxy to backend (localhost:8787)
  - Telegram WebApp SDK integration (`@twa-dev/sdk`)
  - API client (`src/services/api.ts`)

### Key Flows

**Authentication**:

1. Telegram WebApp sends `initData` via `window.Telegram.WebApp.initData`
2. Frontend POSTs to `/api/auth` with initData
3. Backend validates HMAC signature using `TELEGRAM_BOT_TOKEN`
4. Session stored in KV (SESSIONS binding), cookie returned
5. Middleware (`telegram-auth.ts`, `admin-auth.ts`) validates subsequent requests

**Marketplace Listings**:

1. User creates listing with title, price, category, description, images
2. Listing expires after 3 days (default) from creation/last bump
3. On-demand expiry checking: `listingService.expireOldListings()` called in API endpoints
4. Owner can bump listing once per 24 hours:
   - Free bump: +3 days extension
   - Paid bump (1 Telegram Star): +7 days extension, initiates Stars payment flow
5. Browse/filter by category, price range, search query; sort by price/date
6. Contact seller via Telegram deep link (`https://t.me/{username}`)
7. Admin can archive listings with reason (sends Telegram notification to owner)

**Telegram Webhook** (`src/webhook.ts`):

- Bot commands: `/start`, `/repo`
- Telegram Payments:
  - `pre_checkout_query` → validates payment
  - `successful_payment` → updates DB atomically (listing expiry extended or post premium status) → notifications
  - `refunded_payment` → reverts changes
- Payment types: `listing_bump` (paid bump), `post_premium` (legacy)

**Database** (D1 SQLite):

- `listings` (aliased as `posts` for backward compatibility) - marketplace listings with title, price, category, status, expiry, bump tracking
- `listingImages` (aliased as `postImages`) - image metadata (R2 keys for originals + thumbnails)
- `payments` - Telegram Stars payment records with `listingId` and `paymentType`
- `userProfiles` - user profiles with avatar & contact info

**Shared Constants** (`/shared/constants.ts`):

- 10 predefined categories (electronics, fashion, home, vehicles, etc.) with emoji
- Listing statuses: `active`, `expired`, `archived`
- Price range: $0 to $1,000,000 (stored in cents: 0-100,000,000)
- Expiry durations: 3d default, +3d free bump, +7d paid bump
- Bump cooldown: 24 hours

**Image Flow**:

1. Frontend uploads to `/api/listings/:listingId/images` or `/api/profile/me/avatar`
2. Backend receives multipart form, uses `browser-image-compression` for thumbnails
3. Stores in R2 bucket (IMAGES binding), saves keys to D1
4. Local dev serves via `/r2/*` endpoint; production uses R2 public domain
5. Max 10 images per listing

### Environment Strategy

**Local Development**:

- Backend: `wrangler dev --local --port 8787` (from `backend/`)
- Frontend: `vite` on port 3000 (proxies API to 8787)
- Database: `.wrangler/state/v3/d1` (local D1)
- Auth bypass available: `DEV_AUTH_BYPASS_ENABLED=true` in `.env`

**Production**:

- Worker: Deployed via `wrangler deploy` (uses `wrangler.toml` bindings)
- Pages: Built frontend deployed to Cloudflare Pages
- Worker URL passed as `VITE_WORKER_URL` during frontend build
- CORS validation uses `PAGES_URL` env var

## Common Commands

### Development

```bash
npm run dev              # Start both backend (8787) and frontend (3000)
npm run dev:backend      # Backend only
npm run dev:frontend     # Frontend only
npm run stop             # Kill all dev servers
```

### Testing & Quality

```bash
npm run test             # Run all tests (backend + frontend)
npm test:backend         # Backend tests only (vitest)
npm test:frontend        # Frontend tests only (vitest)
npm run typecheck        # TypeScript check (both)
npm run lint             # ESLint (both)
npm run check            # typecheck + lint + test
npm run clean-check      # clean + install + build + check
```

### Database

```bash
npm run db:migrate:local      # Apply migrations to local D1
cd backend && npm run db:generate  # Generate migration from schema changes
cd backend && npm run db:studio    # Open Drizzle Studio
```

### Local Telegram Integration

```bash
npm run tunnel:start     # Start ngrok tunnel (requires ngrok auth)
npm run tunnel:status    # Check tunnel status
npm run tunnel:stop      # Stop tunnel
npm run webhook:set      # Set Telegram webhook to tunnel URL
npm run webhook:status   # Check webhook status
npm run webhook:clear    # Clear webhook
```

### Deployment

See `.github/workflows/` for CI/CD pipeline:

1. `1-build-test.yml` - Validation
2. `2-deploy-worker.yml` - Deploy backend
3. `3-deploy-pages.yml` - Deploy frontend
4. `4-setup-webhook.yml` - Configure webhook

## Important Notes

### Authentication

- All API endpoints (except `/api/health`) require authentication
- Session cookies are httpOnly, validated against KV store
- Admin endpoints check `role === 'admin'` (set when `telegramId === TELEGRAM_ADMIN_ID`)
- Dev bypass: Creates mock user when `DEV_AUTH_BYPASS_ENABLED=true`

### Marketplace API Endpoints

**Listings**:

- `GET /api/listings` - Browse listings with filters (category, price range, search), sorting, pagination
- `GET /api/listings/:listingId` - Get single listing with images and seller profile
- `GET /api/listings/user/:userId` - Get user's listings
- `POST /api/listings` - Create new listing (auth required)
- `PUT /api/listings/:listingId` - Update listing (owner only)
- `DELETE /api/listings/:listingId` - Delete listing (owner or admin)
- `POST /api/listings/:listingId/bump` - Bump listing (free or paid, owner only)
- `POST /api/listings/:listingId/images` - Upload images (owner only)

**Admin**:

- `POST /api/admin/listings/:listingId/archive` - Archive listing with reason (admin only, sends Telegram notification)

**Services** (`backend/src/services/`):

- `listing-service.ts` - CRUD, filters, search, sorting, expiry management
- `bump-service.ts` - Bump validation (cooldown check), free/paid bump execution
- `admin-service.ts` - Archive listings with Telegram notifications
- `image-service.ts` - Upload/delete images for listings (backward compat for posts)
- `payment-service.ts` - Handle Telegram Stars payments for bumps
- `post-service.ts` - Legacy service, wraps listing-service for backward compat

### Payment Flow

- Uses Telegram Stars API
- Payment types: `listing_bump` (paid bump), `post_premium` (legacy)
- Atomic updates via `db.batch()` to ensure listing/post + payment consistency
- Idempotency via `telegram_payment_charge_id`
- Webhook handlers MUST be registered before generic message handler in `webhook.ts`
- Paid bump flow:
  1. User clicks "Paid Bump" button in ListingDetail page
  2. Frontend calls `POST /api/listings/:listingId/bump` with `isPaid: true`
  3. Backend creates payment invoice via Telegram Bot API
  4. User completes payment in Telegram
  5. Telegram webhook receives `successful_payment` event
  6. Backend extends listing expiry by 7 days, marks as active

### Image Handling

- Max 10 images per listing (or post)
- Frontend crops images before upload (`react-easy-crop`)
- Backend generates thumbnails (max 800x800)
- R2 keys: `{userId}/{uuid}.{ext}` and `{userId}/thumb_{uuid}.{ext}`

### Frontend Routing

- React Router v6 with client-side routing
- Main routes:
  - `/` - Marketplace feed (ListingsFeed) with category tabs, search, filters
  - `/listings/:id` - Listing detail page with image carousel, bump buttons, seller contact
  - `/create-listing` - Create new listing form
  - `/profile/:telegramId` - User profile (UnifiedProfile)
  - `/edit-profile` - Edit user profile
  - `/payments` - Payment history
  - `/feed` - Legacy feed view (kept for backward compat)
- AuthRequired wrapper protects routes
- Bottom navigation for mobile UX

### Frontend Components

**Marketplace-Specific**:

- `ListingTimer.tsx` - Real-time countdown timer with color coding (green >24h, yellow >1h, red <1h)
- `ListingDetail.tsx` - Full listing page with:
  - Image carousel with prev/next navigation
  - Price, category, description display
  - Seller info with profile image and Telegram contact button
  - Bump buttons (free/paid) with 24h cooldown display
  - Edit/Delete for owners
  - Archive modal for admins
- `ListingsFeed.tsx` - Marketplace feed with:
  - Horizontal scrolling category tabs
  - Search bar
  - Collapsible filters panel (price range, sort options)
  - Grid layout (2 columns) with listing cards
  - Infinite scroll pagination
- `CreateListing.tsx` - Form with title, category, price, description, image upload (max 10)

### Environment Variables

Required in `.env` (local) or Worker secrets (production):

- `TELEGRAM_BOT_TOKEN` - Bot API token
- `TELEGRAM_ADMIN_ID` - Admin user Telegram ID
- `PAGES_URL` - Frontend URL for CORS (optional, defaults to wildcard)
- `DEV_AUTH_BYPASS_ENABLED` - Enable mock auth (local only)

Wrangler bindings in `wrangler.toml`:

- `SESSIONS` (KV) - Session storage
- `DB` (D1) - Main database
- `IMAGES` (R2) - Image storage
