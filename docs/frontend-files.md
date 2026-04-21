# Frontend File Reference

A guide to every file in the `frontend/` directory — what it is, why it exists, and what it does.

---

## Table of Contents

1. [Root Config Files](#root-config-files)
2. [src/ Root Files](#src-root-files)
3. [Services — API Layer](#services--api-layer)
4. [Store — Global State](#store--global-state)
5. [Types — TypeScript Interfaces](#types--typescript-interfaces)
6. [Components / Common](#components--common)
7. [Components / Layout](#components--layout)
8. [Pages / Auth](#pages--auth)
9. [Pages / Customer](#pages--customer)
10. [Pages / Admin](#pages--admin)
11. [Pages / Staff](#pages--staff)
12. [Technology Summary](#technology-summary)

---

## Root Config Files

### `index.html`
**Purpose:** The single HTML shell that Vite injects the React bundle into.  
Contains one `<div id="root">` that React mounts onto. Also loads the Razorpay payment gateway script globally so it's available before the checkout page renders.

### `package.json`
**Purpose:** Project manifest — declares dependencies, scripts, and the Node version.  
Defines `dev`, `build`, `preview`, and `lint` scripts. Key runtime dependencies include React 18, React Router 6, TanStack Query 5, Zustand 4, Axios, Framer Motion, and Tailwind CSS.

### `vite.config.ts`
**Purpose:** Configures the Vite bundler and dev server.  
Sets the dev port to `5173`, loads the React plugin for JSX/Fast Refresh, and disables source maps in production builds to reduce bundle size.

### `tsconfig.json`
**Purpose:** TypeScript compiler configuration.  
Targets ES2020, enables strict type checking, configures React JSX transform, and sets up the `@/*` path alias so files can import from `src/` using `@/` instead of relative paths.

### `tailwind.config.js`
**Purpose:** Extends Tailwind CSS with project-specific design tokens.  
Adds custom colors (`primary`, `surface` palette), glassmorphism shadows (`shadow-glass`, `shadow-glow`), and custom animations (`fade-in`, `slide-up`, `shimmer`) used throughout the UI.

### `postcss.config.js`
**Purpose:** Configures the CSS processing pipeline.  
Runs Tailwind CSS and Autoprefixer so Tailwind classes are generated and vendor prefixes are added automatically during build.

### `frontend/Dockerfile`
**Purpose:** Builds the production frontend container.  
Multi-stage build: first compiles the React app with Vite, then serves the static output via Nginx. Environment variables (`VITE_*_SERVICE_URL`) are injected as build args so API endpoints can be configured per environment.

---

## src/ Root Files

### `src/main.tsx`
**Purpose:** Application bootstrap — the entry point React mounts from.  
Creates the TanStack Query client (60-second stale time, 1 retry on failure), wraps the app in `QueryClientProvider`, and renders `<App />` into the `#root` div.

### `src/App.tsx`
**Purpose:** Root router that defines every URL route in the app.  
Uses React Router v6 with `React.lazy()` code-splitting so each page is only loaded when navigated to. Wraps routes in `ProtectedRoute` to enforce role-based access (customer / admin / staff). Also renders the global `<Toaster>` for toast notifications.

### `src/index.css`
**Purpose:** Global stylesheet imported by `main.tsx`.  
Sets up Tailwind's base/components/utilities layers and adds ~50 custom utility classes via `@layer components` — button variants (`btn-primary`, `btn-ghost`), input styles, card variants (`card-glass`), badge colors, and skeleton shimmer animations.

### `src/vite-env.d.ts`
**Purpose:** TypeScript ambient type declarations for Vite and third-party globals.  
Declares `ImportMeta` types for `import.meta.env` variables and extends `Window` with `google` (Google Maps) and `Razorpay` so TypeScript doesn't error when those globals are used.

---

## Services — API Layer

> All services live in `src/services/` and use Axios clients created in `api.ts`.

### `src/services/api.ts`
**Purpose:** Creates and configures the Axios HTTP clients used by every other service.  
Instantiates five separate clients — one per microservice (`authClient`, `productClient`, `cartClient`, `orderClient`, `aiClient`) — each pointing to its own base URL from environment variables. Attaches a request interceptor that injects the `Authorization: Bearer <token>` header from the Zustand auth store, and a response interceptor that automatically retries with a refreshed token on `401` errors (then logs out if the refresh also fails).

### `src/services/auth.ts`
**Purpose:** All authentication and user-account API calls.  
Methods: `register`, `login`, `me` (get own profile), `updateMe`, `changePassword`, `forgotPassword`, `resetPassword`, and staff management (`createStaff`, `listStaff`, `getStaff`, `updateStaffPermissions`, `suspendStaff`).

### `src/services/cart.ts`
**Purpose:** Shopping cart and wishlist API calls.  
Methods: `getCart`, `addItem`, `updateItem`, `removeItem`, `clearCart`, `getSaved` (wishlist), `saveForLater`, `moveToCart`, `removeSaved`.

### `src/services/orders.ts`
**Purpose:** Order lifecycle, address book, and admin analytics API calls.  
Methods: full address CRUD, `listOrders`, `getOrder`, `createOrder`, `verifyPayment`, `updateOrderStatus`, `cancelOrder`, `requestReturn`, `approveReturn`, admin KPI endpoints (`getKPIs`, `getTopProducts`, `getPincodeMap`).

### `src/services/products.ts`
**Purpose:** Product catalog, search, deals, events, reviews, and AI recommendation API calls.  
The largest service — 30+ methods covering: product CRUD, stock updates, bulk CSV import/export, category CRUD, deal CRUD, event CRUD, filter/search, AI search (with intent parsing), autocomplete, review CRUD with staff replies, and all AI recommendation endpoints (similar products, frequently-bought-together, user picks, category picks).

---

## Store — Global State

> Built with Zustand. State persists to `localStorage` where noted.

### `src/store/authStore.ts`
**Purpose:** Holds the authenticated user's session across the app.  
State: `user` (profile object), `accessToken`, `refreshToken`, `isAuthenticated`. Methods: `setUser`, `setTokens`, `logout`, `hasPermission(permission)` for role-based checks. Entire store is persisted to `localStorage` so the user stays logged in across page refreshes.

### `src/store/cartStore.ts`
**Purpose:** Tracks cart item count in the navigation header badge.  
State: `cart` (full cart object), `itemCount`. Methods: `setCart`, `clearCart`. Updated whenever the cart API is called so the header badge stays in sync without a separate API call.

---

## Types — TypeScript Interfaces

### `src/types/index.ts`
**Purpose:** Single source of truth for all TypeScript types used across the frontend.  
Exports 20+ interfaces grouped by domain:
- **Auth:** `User`, `TokenResponse`, `StaffPermission`, `StaffUser`
- **Products:** `Product`, `ProductImage`, `Category`, `Deal`, `Event`, `Review`, `ReviewReply`, `ProductVariant`
- **Cart:** `CartLine`, `Cart`
- **Orders:** `Address`, `OrderItem`, `Order`, `StatusHistory`
- **Pagination:** `Paginated<T>` generic wrapper
- **Search:** `SearchResponse`, `SearchHit`, `SearchFilter`
- **Recommendations:** `RecommendationItem`

---

## Components / Common

> Shared, reusable components imported across many pages.

### `src/components/common/ProductCard.tsx`
**Purpose:** Standard product tile used in grids across the app.  
Shows product image (lazy-loaded), name, selling price vs MRP, discount percentage badge, promotion badge, star rating, stock status, and a wishlist heart toggle. Handles the add-to-wishlist mutation internally.

### `src/components/common/ProtectedRoute.tsx`
**Purpose:** Route guard that enforces authentication and role-based access.  
Wraps any `<Route>` element. Redirects unauthenticated users to `/login`. Checks the user's role against an allowed `roles` prop; if the role doesn't match, redirects to a configurable `redirectTo` path (defaults to `/403`).

### `src/components/common/LoadingSpinner.tsx`
**Purpose:** Animated spinner for async loading states.  
A simple CSS-animated border-based circle. Accepts a `size` prop (`sm` / `md` / `lg`) to control dimensions.

### `src/components/common/Skeleton.tsx`
**Purpose:** Placeholder content shown while data is loading — prevents layout shift.  
Exports five variants: `Skeleton` (generic block), `ProductCardSkeleton`, `ProductGridSkeleton` (n×cards), `CartItemSkeleton`, `OrderCardSkeleton`. All use the `shimmer` animation defined in `index.css`.

### `src/components/common/StarRating.tsx`
**Purpose:** Displays star ratings and optionally allows the user to pick a rating.  
Read-only mode: renders filled/half/empty stars from a `rating` number. Interactive mode: hover-highlighting and click-to-select for review submission forms.

### `src/components/common/ChatWidget.tsx`
**Purpose:** The AI shopping assistant chat interface — a floating widget on every customer page.  
A toggle button opens an expandable panel. Messages are sent to the AI service (`/api/ai/chat`). Responses can include plain text or embedded product cards. Handles session IDs for conversation continuity, shows a "connecting to agent" state when human handoff is triggered, and displays a rate-limit warning if the user sends too many messages.

### `src/components/common/AnimatedPage.tsx`
**Purpose:** Provides Framer Motion entrance/exit animations to reduce visual jumpiness.  
Exports four wrappers:
- `AnimatedPage` — fade + slide-up on mount/unmount
- `StaggerContainer` — orchestrates staggered child animations
- `StaggerItem` — individual item inside a `StaggerContainer`
- `FadeInView` — scroll-triggered fade using Framer Motion's `whileInView`

### `src/components/common/AddressAutocomplete.tsx`
**Purpose:** Text input with address suggestions powered by Nominatim (OpenStreetMap).  
Debounces keystrokes by 400ms, queries the Nominatim API, and shows a dropdown. Selecting a result calls `onPlaceSelected` with parsed address components (line 1, city, state, pincode, country, lat/lng).

### `src/components/common/MapLocationPicker.tsx`
**Purpose:** Interactive map for picking a delivery location visually.  
Uses Leaflet + React Leaflet. Features: click to drop a pin, search bar, "Use My Location" button (browser geolocation). On pin placement it reverse-geocodes the coordinates via Nominatim and returns the address components to the parent via a callback.

---

## Components / Layout

> Wrappers that provide consistent chrome (header, sidebar, footer) for different user roles.

### `src/components/layout/Header.tsx`
**Purpose:** Top navigation bar shown on all customer pages.  
Contains: logo, search bar with AI mode toggle (sends queries through the AI intent-parsing endpoint), autocomplete suggestions, cart icon with item count badge, dark mode toggle, user menu (profile link, logout), and links to the admin/staff portal if the user has the right role.

### `src/components/layout/CustomerLayout.tsx`
**Purpose:** Shell for all customer-facing pages.  
Renders `<Header />`, the `<ChatWidget />` floating button, the page content via `<Outlet />`, and a footer with company info, policy links, and contact details.

### `src/components/layout/AdminLayout.tsx`
**Purpose:** Shell for the admin dashboard.  
Collapsible left sidebar with 11 navigation items (Dashboard, Products, Categories, Deals, Events, Orders, Returns, Reviews, Staff, Documents, Live Chat). Mobile-responsive: collapses to a hamburger-triggered drawer. All routes inside are protected to `admin` role only.

### `src/components/layout/StaffLayout.tsx`
**Purpose:** Shell for the staff portal.  
Similar to `AdminLayout` but with only 6 navigation items and each item is conditionally shown based on the logged-in staff member's permissions (`manage_orders`, `manage_reviews`, `manage_stock`, `manage_deals`).

---

## Pages / Auth

### `src/pages/auth/Login.tsx`
**Purpose:** Login page at `/login`.  
Email + password form with validation. On success, fetches the user profile, updates the Zustand store, and redirects based on role: admins → `/admin`, staff → `/staff`, customers → `/`.

### `src/pages/auth/Register.tsx`
**Purpose:** Customer registration page at `/register`.  
Collects full name, email, optional phone, and password (min 8 chars, must have uppercase + digit). On success, auto-logs in the new user and redirects to the home page.

---

## Pages / Customer

### `src/pages/customer/Home.tsx`
**Purpose:** Main landing page at `/`.  
Shows a product marquee, featured/promoted product sections, a category grid, and a personalized recommendations section. Recommendations blend multiple algorithms: search-based, view-history-based, order-history-based, and category-affinity-based.

### `src/pages/customer/ProductList.tsx`
**Purpose:** Search results and browse page at `/products`.  
Left sidebar with filters (price range, in-stock only, discount only, categories). Product grid with pagination. If an AI search was used, shows a natural-language summary of what the AI understood from the query.

### `src/pages/customer/ProductDetail.tsx`
**Purpose:** Individual product page at `/products/:id`.  
Shows image gallery, full description, pricing, stock status, add-to-cart / add-to-wishlist buttons, star rating, and all customer reviews. Tracks the view in `localStorage` so it can feed the "recently viewed" recommendation algorithm. Customers who ordered the product can submit a review. Shows "Similar Products" and "Frequently Bought Together" carousels below.

### `src/pages/customer/Cart.tsx`
**Purpose:** Shopping cart page at `/cart`.  
Lists all cart items with quantity controls, remove, and "Save for Later" actions. Shows the "Saved for Later" (wishlist) section below. Displays AI-powered cart-based product recommendations. Links to checkout.

### `src/pages/customer/Checkout.tsx`
**Purpose:** Multi-step checkout flow at `/checkout`.  
Four steps: Cart Review → Shipping Address → Payment → Confirmation. Handles address selection or creation (with map/autocomplete), automatically applies any active deals, and triggers a Razorpay payment modal. Also supports a "buy now" mode when arriving from a single-product purchase.

### `src/pages/customer/Orders.tsx`
**Purpose:** Order history page at `/orders`.  
Tabbed by status (All, Pending, Confirmed, Dispatched, Delivered, Cancelled, Returns). Time filter (last 30/90/all days). Allows cancelling pending orders or requesting a return on delivered orders via modal with a reason selector.

### `src/pages/customer/OrderDetail.tsx`
**Purpose:** Single order detail page at `/orders/:id`.  
Shows a status timeline, itemized list, shipping address (with a Leaflet map if coordinates are stored), payment status, and estimated delivery. Options to cancel, request a return, retry payment, or download a PDF receipt.

### `src/pages/customer/Events.tsx`
**Purpose:** Store events listing page at `/events`.  
Displays upcoming and live events with countdown timers, status badges, descriptions, and registration links. Timers update every second using `setInterval`.

### `src/pages/customer/Wishlist.tsx`
**Purpose:** Saved items (wishlist) page at `/wishlist`.  
Shows all items the user saved for later. Actions: move to cart, remove from wishlist. Empty state encourages browsing.

### `src/pages/customer/Addresses.tsx`
**Purpose:** Address book management at `/addresses`.  
List of saved delivery addresses. Add or edit addresses using the map location picker or the autocomplete input. Mark an address as default.

### `src/pages/customer/Support.tsx`
**Purpose:** Support contact page at `/support`.  
Static informational page with links to Live Chat (opens the ChatWidget), email, phone number, and support hours. Quick links to Help Center, Returns, and Shipping Info.

### `src/pages/customer/HelpCenter.tsx`
**Purpose:** FAQ page at `/help`.  
Accordion-style list of 8 common questions (order tracking, address changes, payments, cancellations, returns, refunds, account security, deals). Each expands to show the answer inline.

### `src/pages/customer/ShippingInfo.tsx`
**Purpose:** Shipping policy page at `/shipping`.  
Static page detailing Standard vs Express shipping, delivery coverage areas, and packaging information.

### `src/pages/customer/Returns.tsx`
**Purpose:** Returns and refund policy page at `/returns`.  
Static page with category-specific return windows, the step-by-step return process, and cancellation policy.

---

## Pages / Admin

### `src/pages/admin/Dashboard.tsx`
**Purpose:** Admin home at `/admin`.  
10 KPI metric cards (orders today, dispatched today, pending, revenue this month, cancelled, return requests, confirmed, delivered). Auto-refreshes every 30 seconds. Below the cards: a recent orders table, a low-stock product list, and a return requests summary.

### `src/pages/admin/Products.tsx`
**Purpose:** Product inventory table at `/admin/products`.  
Paginated list with search and category filter. Inline toggles for active/featured/promoted status. Delete with confirmation. Buttons to add a product, export CSV, and import CSV for bulk operations.

### `src/pages/admin/AddProduct.tsx`
**Purpose:** Product creation form at `/admin/products/add`.  
Fields: SKU, name, description, MRP, selling price, stock quantity, stock status, categories (multi-select), tags, image upload with preview, featured/promoted flags. Validates that selling price ≤ MRP.

### `src/pages/admin/EditProduct.tsx`
**Purpose:** Product edit form at `/admin/products/:id/edit`.  
Same fields as Add, plus a second tab for managing product variants (size, color, price adjustment, stock per variant). Each variant has its own add/edit/delete flow.

### `src/pages/admin/Categories.tsx`
**Purpose:** Category management at `/admin/categories`.  
Create categories by name (slug is auto-generated). List existing categories. Delete with confirmation dialog.

### `src/pages/admin/Orders.tsx`
**Purpose:** Order pipeline view at `/admin/orders`.  
Kanban board with 7 columns (Pending, Confirmed, Dispatched, Delivered, Return Requested, Returned, Cancelled). Drag-and-drop cards to move orders between allowed statuses. Each card shows order ID, customer, and total.

### `src/pages/admin/Reviews.tsx`
**Purpose:** Review moderation at `/admin/reviews`.  
Select a product, view all its reviews sorted by rating, post or retract staff replies, and delete inappropriate reviews.

### `src/pages/admin/Deals.tsx`
**Purpose:** Promotional deal management at `/admin/deals`.  
Create deals with type (percentage / flat / BOGO), scope (all products / categories / specific SKUs), start/end dates. Warns if a new deal overlaps with an existing one. Lists active and upcoming deals with edit/delete.

### `src/pages/admin/Events.tsx`
**Purpose:** Store event management at `/admin/events`.  
Create/edit/delete events with title, description, registration URL, event date, and image. Toggle active/inactive status.

### `src/pages/admin/Staff.tsx`
**Purpose:** Staff account management at `/admin/staff`.  
Create staff with email, name, phone, and password. Assign permissions per module (manage_orders, manage_reviews, manage_stock, manage_deals). Suspend or unsuspend accounts.

### `src/pages/admin/Documents.tsx`
**Purpose:** AI knowledge base document management at `/admin/documents`.  
Upload files (`.txt`, `.md`, `.pdf`, `.csv` — max 5 MB) that get chunked and indexed into the FAISS vector store powering the chatbot's RAG system. Shows uploaded docs with chunk count and character count.

### `src/pages/admin/Handoff.tsx`
**Purpose:** Live chat agent console at `/admin/handoff`.  
Shows a queue of customers who requested a human agent. Admin can claim a ticket, exchange messages via WebSocket in real time, view full message history, and close/reassign tickets.

### `src/pages/admin/ReturnRequests.tsx`
**Purpose:** Return and cancellation approval at `/admin/returns`.  
Two tabs: Return Requests and Cancellations. Each request shows the customer, reason, and items. Admin can approve or deny with an optional internal note.

---

## Pages / Staff

### `src/pages/staff/Dashboard.tsx`
**Purpose:** Staff home at `/staff`.  
4 KPI cards: pending orders count, dispatched today, unresolved reviews, low-stock items. Below: a recent orders list and a low-stock product list for quick action.

### `src/pages/staff/Orders.tsx`
**Purpose:** Order dispatch management at `/staff/orders`.  
Shows all confirmed orders waiting to be dispatched. Staff can mark an order as dispatched by entering a tracking number in a modal.

### `src/pages/staff/Reviews.tsx`
**Purpose:** Review reply management at `/staff/reviews`.  
Lists all product reviews. Staff can write a reply to any unresponded review or retract an existing reply.

### `src/pages/staff/Stock.tsx`
**Purpose:** Inventory stock management at `/staff/stock`.  
Paginated product list with current stock quantity and status. Inline editing: click a row to update quantity and status (in_stock / low_stock / out_of_stock), then save or cancel.

---

## Technology Summary

| Layer | Technology | Why |
|---|---|---|
| UI framework | React 18 | Component model, hooks, concurrent features |
| Language | TypeScript | Type safety across 60+ files |
| Routing | React Router v6 | Lazy-loaded code splitting, nested layouts |
| Server state | TanStack Query v5 | Caching, background refetching, mutations |
| Client state | Zustand v4 | Lightweight auth + cart state with localStorage persistence |
| Styling | Tailwind CSS v3 | Utility-first, custom design tokens |
| Animation | Framer Motion v11 | Page transitions, stagger effects, scroll-reveal |
| HTTP client | Axios | Interceptors for token refresh / auth |
| Forms | React Hook Form | Validation, controlled inputs |
| Notifications | react-hot-toast | Non-blocking toast messages |
| Maps | Leaflet + React Leaflet | Delivery address picker, order location display |
| Geocoding | Nominatim (OpenStreetMap) | Free, no API key required |
| Payments | Razorpay | Indian payment gateway |
| Build tool | Vite 5 | Fast HMR, optimized production builds |
| Container | Nginx (via Dockerfile) | Serves static build, proxies API calls |
