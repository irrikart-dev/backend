# IrriKart customer app: API contract

Audience: Flutter developers building the customer app (`mobile-app/`). It covers every customer-facing endpoint in the backend. Admin (`/admin/*`) and vendor (`/vendor/*`) endpoints are out of scope.

Source of truth: the current working tree of `backend/src` (routes, zod schemas, service DTOs, error throws). If this document and the code disagree, the code wins. Report the mismatch so the document can be fixed.

## How to use this contract

1. Read **Conventions** first. Every endpoint follows the same envelope, auth and error rules, so later sections don't repeat them.
2. Each area has an endpoint table. After the table, each endpoint lists its request (headers, params, body), a response example and an errors table. "Auth: yes" means the request must carry `Authorization: Bearer <Firebase ID token>`.
3. **Recommended app flows** puts the endpoints together in order for the main journeys.
4. **Not available yet** lists features the backend does not have. Don't build UI that depends on them.
5. **Open questions** lists behaviour that looks unintended or isn't settled. Check it before building on any of those points.

Messages in the error tables are the exact strings the server sends. The app may show them to the user, but branch on the **status code** (and `details` where noted), not on message text.

## Changelog

| Date | Change |
|---|---|
| 2026-10-16 | First full contract. Recent backend additions it covers: |
| | `vendor { id, storeName, slug, rating, reviewCount }` on every product. Seller rating is the average of approved reviews across all of that vendor's products. |
| | Bulk quote requests (RFQ): `POST /rfq`, `GET /rfq`, with statuses `NEW` / `CONTACTED` / `CLOSED`. |
| | Address archive semantics. Editing an address that an order already uses returns a **new id**. Deleting such an address hides it. `isDefault:false` on the default address is ignored. |
| | Blocked accounts get `403 "This account has been blocked. Contact IrriKart support."` on every signed-in endpoint and on sync. |
| | Coupon codes are case-insensitive. |
| | `GET /catalog/banners` serves the home-screen hero banners. |
| 2026-10-16 (later) | User object trimmed to `{ id, name, phone, email, role, permissions, createdAt }`. |
| | Customer order detail no longer includes `vendorAmount` / `platformAmount`. |
| | Hidden products and unpayable sellers can't be carted or checked out. Cart lines carry `purchasable`. |
| | Malformed JSON bodies return `400 Malformed JSON body` (was 500). |

---

## Conventions

### Base URL

```
<host>/api/v1
```

Every path in this document is relative to `/api/v1`. The production and staging hosts are not in the repo (see Open questions). Local dev: `http://localhost:<PORT>/api/v1`. `PORT` defaults to 4000; the repo's check scripts use 8000.

Other unversioned paths: `GET /openapi.json` and `GET /docs` (Swagger UI) hold a partial spec. `GET /api/v1/health` returns `{ "status": "ok", "db": "up" }` (or 503 `{ "status": "error", "db": "down" }`). The health response does **not** use the envelope.

### Authentication

- Customers sign in with **Firebase phone OTP on the device** (Firebase Auth SDK). The backend never sees the OTP.
- Every authenticated request sends the Firebase **ID token**:
  ```
  Authorization: Bearer <Firebase ID token>
  ```
  Get it with `FirebaseAuth.instance.currentUser!.getIdToken()`. Tokens expire after about 1 hour. The SDK refreshes them; call `getIdToken()` before each request (or on a 401, as described below), not once at startup.
- After **every** sign-in, call `POST /auth/firebase/sync` once. It creates the backend user on first sign-in. Every other authenticated endpoint returns `401 "No account linked to this Firebase user"` until sync has run.
- The server checks for revoked tokens on every request, so `POST /auth/logout-all` takes effect immediately on all devices.

### Response envelope

Success (all JSON endpoints except `204` responses and the invoice PDF):

```json
{ "success": true, "data": { } }
```

`data` may be an object, an array or `null`.

Error:

```json
{ "success": false, "message": "Human-readable reason", "details": { } }
```

`details` is present only for validation errors (400) and the cart vendor conflict (409). Otherwise it is absent.

### Validation errors (400)

Request bodies, query strings and params are validated with zod. A failure returns:

```json
{
  "success": false,
  "message": "Validation failed",
  "details": {
    "formErrors": [],
    "fieldErrors": {
      "body": ["String must contain at least 10 character(s)", "Required", "Pincode must be 6 digits"]
    }
  }
}
```

**Important:** the schemas wrap `body` / `query` / `params`, so `fieldErrors` is keyed by **`body`, `query` or `params`**, not by the individual field name. Each entry is a list of messages, and you can't reliably map a message back to a form field. Validate on the client using the constraints in this document, and show `fieldErrors.body` as a generic list if the server still rejects the request. (Verified against zod 3.25. See Open questions.)

### Status codes

| Status | Meaning | App action |
|---|---|---|
| 200 | OK | |
| 201 | Created (checkout, address create, review, RFQ) | |
| 204 | OK, empty body (address delete/default, recently-viewed record, saved-method delete) | Don't parse a body |
| 400 | Validation failed, or a business rule rejected the request (empty cart, COD not allowed, coupon expired, ...) | Show `message` |
| 401 | `Missing token`, `Invalid or expired token`, `Session revoked, please log in again`, or `No account linked to this Firebase user` | See the 401 handling below |
| 403 | `This account has been blocked. Contact IrriKart support.` (any signed-in endpoint and sync). Also `Insufficient permissions` (never for customer routes) and the admin/vendor account-delete rule | Blocked: sign out of Firebase and show a "contact support" screen |
| 404 | Resource missing, **or it belongs to another user** (ownership failures are always 404, never 403). Unknown route: `Route <path> not found` | |
| 409 | Conflict: stock, cart vendor mismatch, order state changed, coupon limit, already reviewed, DB unique/foreign-key backstop | Show `message`, then refresh the resource |
| 429 | Rate limit | Back off. The body is **plain text** `Too many requests, please try again later.`, not JSON |
| 500 | `Internal server error` | Generic error with retry |

**401 handling:** on any 401 other than `No account linked...`, force-refresh the token (`getIdToken(true)`) and retry the request once. If it still returns 401, or the message is `Session revoked, please log in again`, sign out of Firebase and send the user to sign-in. On `No account linked to this Firebase user`, call `POST /auth/firebase/sync` and retry.

### Money

- All money fields are **rupees (INR)**. Only Razorpay's own SDK option `amount` is in paise, and the app computes it (see Payments).
- Order totals (`amount` on orders and checkout, and the coupon discount) are rounded to **whole rupees** by the server.
- Product, variant, cart-line and order-line prices come from `Decimal(10,2)` columns, and the admin forms accept decimals. Parse every money field as Dart `num` (or `double`), **not `int`** (see Open questions).

### IDs, dates, pagination, rate limit

- Every id is a **cuid string**, e.g. `cm2k9x7qz0001lb08h3f6d2ab`. Treat ids as opaque.
- Timestamps are ISO-8601 UTC strings, e.g. `2026-10-16T09:42:11.512Z`.
- Paginated responses (only `GET /catalog/products` today) use `{ "items": [...], "page": 1, "limit": 20, "total": 134 }`. Other lists are plain arrays.
- Rate limit: **300 requests per 15 minutes per client IP**, across all endpoints. Responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`. A 429 also carries `Retry-After`.
- Malformed JSON bodies return `400 Malformed JSON body`. Always send `Content-Type: application/json` on POST/PATCH.

---

## 1. Auth and account

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/firebase/sync` | yes | Create or fetch the backend user after Firebase sign-in |
| GET | `/auth/me` | yes | Caller's profile |
| PATCH | `/auth/me` | yes | Update display name |
| POST | `/auth/logout-all` | yes | Revoke every session on every device |
| DELETE | `/auth/account` | yes | Permanently delete the account |

### User object

`sync`, `GET /auth/me` and `PATCH /auth/me` all return the same user object:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Backend user id |
| `phone` | string \| null | E.164 from the Firebase token, e.g. `+919876543210`. Read-only |
| `email` | string \| null | From the Firebase token. Read-only. Usually null for phone sign-in |
| `name` | string \| null | Null until the user sets it with `PATCH /auth/me` |
| `role` | `"CUSTOMER"` \| `"ADMIN"` \| `"SUB_ADMIN"` \| `"VENDOR"` | Customers are `CUSTOMER` |
| `permissions` | string[] | Always `[]` for customers |
| `createdAt` | ISO string | |

A blocked user never gets a 200 from these endpoints (403 instead), so there is no status field.

Example:

```json
{
  "success": true,
  "data": {
    "id": "cm2k9x7qz0001lb08h3f6d2ab",
    "phone": "+919876543210",
    "email": null,
    "name": "Ramesh Patil",
    "role": "CUSTOMER",
    "permissions": [],
    "createdAt": "2026-10-01T06:12:40.101Z"
  }
}
```

### POST /auth/firebase/sync

Call this after every successful Firebase sign-in. It is idempotent: it returns the existing user, or creates one with `phone`/`email` copied from the token.

- Body: none.
- Response 200: the user object. `name` is null for a new user, so prompt for it and then `PATCH /auth/me`.

| Status | Message | When |
|---|---|---|
| 401 | `Missing token` | No `Bearer` header |
| 401 | `Invalid or expired token` | Bad or expired token |
| 401 | `Session revoked, please log in again` | Token issued before a logout-all |
| 403 | `This account has been blocked. Contact IrriKart support.` | User is blocked |
| 409 | `A record with this phone already exists` | Another backend user already holds this phone number (DB backstop. Should not happen in normal use) |

### GET /auth/me

- Response 200: the user object.
- Errors: the 401s above, `401 No account linked to this Firebase user`, and the 403 for blocked accounts.

### PATCH /auth/me

Body:

| Field | Type | Constraints |
|---|---|---|
| `name` | string | Required. Trimmed, 1 to 100 chars |

```json
{ "name": "Ramesh Patil" }
```

Response 200: the updated user object. Phone and email can't be changed through the API. They come from Firebase.

Errors: 400 `Validation failed`, plus the common 401/403.

### POST /auth/logout-all

Revokes every Firebase refresh token for this user. On their next request, all devices get `401 Session revoked, please log in again`, **including the current one**. Afterwards, call `FirebaseAuth.instance.signOut()` locally.

- Body: none. The blocked-account check does **not** apply here.
- Response 200:

```json
{ "success": true, "data": { "message": "All sessions revoked" } }
```

### DELETE /auth/account

Permanently deletes the account (Google Play policy requires in-app deletion). The blocked-account check does **not** apply. Show a confirmation dialog first.

What happens:

- **Deleted:** saved addresses that no order uses, cart items, carts that never became orders, wishlist, recently viewed, reviews (product and vendor ratings are recomputed), RFQs, device tokens, notifications, and saved payment methods at Razorpay (best effort). The Firebase Auth user is also deleted.
- **Kept, with identity removed:** placed orders and the addresses they shipped to, which Indian GST record-keeping requires. The user row is kept with phone, email, name and Razorpay customer cleared and status `BLOCKED`.
- The call is idempotent, so retrying after a partial failure is safe.

Response 200:

```json
{ "success": true, "data": { "message": "Account deleted" } }
```

Afterwards, sign out of Firebase locally and clear all local state. Signing in again with the same phone creates a brand-new, empty account.

| Status | Message | When |
|---|---|---|
| 403 | `Admin and vendor accounts cannot be deleted from the app. Contact IrriKart support.` | Role is not `CUSTOMER` |
| 401 | (common) | |

---

## 2. Catalog

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/catalog/categories` | no | All categories, by name |
| GET | `/catalog/brands` | no | All brands, by name |
| GET | `/catalog/banners` | no | Active home banners, in display order |
| GET | `/catalog/products` | no | Paginated, filterable product list |
| GET | `/catalog/products/:idOrSlug` | no | One product |
| GET | `/catalog/wishlist` | yes | Caller's wishlist |
| POST | `/catalog/wishlist/:productId` | yes | Add to wishlist (idempotent) |
| DELETE | `/catalog/wishlist/:productId` | yes | Remove from wishlist |
| GET | `/catalog/recently-viewed` | yes | Last 20 products viewed |
| POST | `/catalog/recently-viewed/:productId` | yes | Record a product view |

**Visibility rule:** the catalogue only serves products with status `PUBLISHED` whose vendor can be paid out. A hidden product returns 404 and is indistinguishable from a missing one. Wishlist and recently viewed silently drop products that have become hidden.

### GET /catalog/categories

The list is flat and sorted by name. The parent/child tree is not exposed.

```json
{
  "success": true,
  "data": [
    {
      "id": "cm1cat0001drip0000000001",
      "slug": "drip-irrigation",
      "name": "Drip Irrigation",
      "blurb": "Emitters, laterals and complete drip kits",
      "imageUrl": "https://xyz.supabase.co/storage/v1/object/public/irrikart-uploads/categories/drip.jpg",
      "productCount": 42
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `id`, `slug`, `name` | string | Pass `id` as the `category` filter |
| `blurb` | string | `""` when unset |
| `imageUrl` | string \| null | |
| `productCount` | int | Counts **all** products in the category, including hidden ones, so it may exceed what the list returns |

### GET /catalog/brands

```json
{ "success": true, "data": [ { "id": "cm1brd0001jain000000001", "slug": "jain", "name": "Jain", "productCount": 18 } ] }
```

`productCount` also includes hidden products.

### GET /catalog/banners

Only active banners, sorted by `position`, then by creation time.

```json
{
  "success": true,
  "data": [
    {
      "id": "cm2bnr0001home000000001",
      "eyebrow": "Monsoon sale",
      "title": "Drip kits from ₹1,499",
      "subtitle": "Free delivery above ₹999",
      "ctaLabel": "Shop kits",
      "link": "/category/kits",
      "imageUrl": "https://xyz.supabase.co/storage/v1/object/public/irrikart-uploads/banners/monsoon.jpg",
      "position": 0,
      "active": true
    }
  ]
}
```

`eyebrow`, `subtitle` and `ctaLabel` are `""` when unset. `link` (string \| null) is an **app route** that the CTA should open (e.g. `/category/kits`), not a web URL. Agree the route vocabulary with the admin team. `imageUrl` may be null.

### GET /catalog/products

Query parameters (all optional):

| Param | Type | Constraints / meaning |
|---|---|---|
| `category` | string | Category **id** |
| `brand` | string | Brand **id** |
| `vendor` | string | Vendor **id** (e.g. "more from this seller") |
| `search` | string | Min 1 char. Case-insensitive substring match on product title, slug or any variant SKU |
| `minPrice` | number | ≥ 0. Matches if **any** variant's price is ≥ this |
| `maxPrice` | number | ≥ 0. Matches if **any** variant's price is ≤ this. `minPrice` must be ≤ `maxPrice` |
| `minRating` | number | 0 to 5. Product `rating` ≥ value |
| `inStock` | `true` \| `false` \| `1` \| `0` | `true`/`1`: only products flagged in stock **and** with at least one variant with stock > 0. `false`/`0` applies **no** filter. Any other value returns 400 |
| `sort` | enum | See below. Omitted means most recently **edited** first (`updatedAt` desc) |
| `page` | int | ≥ 1, default 1. A page past the end returns `items: []` |
| `limit` | int | 1 to 100, default 20 |

`sort` values:

| Value | Order |
|---|---|
| `newest` | Most recently created first |
| `price_asc` / `price_desc` | By the **default variant's** price (`variants[0]`) |
| `popular` | Most reviews first, then rating (reviewCount stands in for popularity) |
| `rating` | Highest rating first, then most reviews |

Response 200: `{ items: Product[], page, limit, total }` (see the product object below).

```json
{
  "success": true,
  "data": {
    "items": [ { "id": "cm2prd0001drip0000000001", "name": "Drip Irrigation Kit – 1 Acre", "price": 4999 } ],
    "page": 1,
    "limit": 20,
    "total": 134
  }
}
```

(The item is abbreviated here. Every item is the full product object.)

Errors: `400 Validation failed`, with `fieldErrors.query`, e.g. `["Number must be less than or equal to 100", "minPrice must not exceed maxPrice"]`.

Note: price filters match on any variant, but a card's `price` shows the default variant. A card can therefore show a price outside the filtered range.

### GET /catalog/products/:idOrSlug

`idOrSlug` is a product id or its slug. Response 200: one product object.

| Status | Message | When |
|---|---|---|
| 404 | `Product not found` | Missing, not `PUBLISHED`, or vendor not sellable |

### The public product object

```json
{
  "id": "cm2prd0001drip0000000001",
  "variantId": "cm2var0001drip0000000001",
  "sku": "DRIP-KIT-1AC",
  "slug": "drip-irrigation-kit-1-acre",
  "name": "Drip Irrigation Kit – 1 Acre",
  "vendorId": "cm1vnd0001green000000001",
  "vendor": {
    "id": "cm1vnd0001green000000001",
    "storeName": "GreenFlow Irrigation",
    "slug": "greenflow-irrigation",
    "rating": 4.4,
    "reviewCount": 87
  },
  "category": "cm1cat0001drip0000000001",
  "categoryName": "Drip Irrigation",
  "brandId": "cm1brd0001jain000000001",
  "brandName": "Jain",
  "imageUrl": "https://xyz.supabase.co/storage/v1/object/public/irrikart-uploads/products/kit-front.jpg",
  "images": [
    "https://xyz.supabase.co/storage/v1/object/public/irrikart-uploads/products/kit-front.jpg",
    "https://xyz.supabase.co/storage/v1/object/public/irrikart-uploads/products/kit-field.jpg"
  ],
  "videoUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "variants": [
    { "id": "cm2var0001drip0000000001", "sku": "DRIP-KIT-1AC", "size": "1 acre", "color": null, "unit": "piece", "price": 4999, "stockQty": 25, "available": 22 },
    { "id": "cm2var0002drip0000000002", "sku": "DRIP-KIT-2AC", "size": "2 acre", "color": null, "unit": "piece", "price": 8999, "stockQty": 0, "available": 0 }
  ],
  "tagline": "Everything to drip-irrigate one acre",
  "description": "16 mm laterals, 4 LPH inline emitters, screen filter and fittings.",
  "features": ["16 mm laterals, 400 m", "Screen filter included", "2-year warranty"],
  "specs": [ { "label": "Emitter flow", "value": "4 LPH" }, { "label": "Lateral size", "value": "16 mm" } ],
  "unit": "piece",
  "price": 4999,
  "rating": 4.6,
  "reviewCount": 31,
  "inStock": true,
  "stockQty": 25,
  "updatedAt": "2026-10-14T08:20:55.300Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Product id. Use it for wishlist, recently viewed, reviews and RFQ |
| `variantId` | string \| null | **Default variant** (`variants[0]`). Use it for "add to cart" from list cards. Null only if the product has no variants |
| `sku` | string | Default variant SKU, or `""` |
| `slug` | string | Use it for share links and to fetch the detail |
| `name` | string | Product title |
| `vendorId` | string | Seller id. Also in `vendor.id` |
| `vendor` | object \| null | `{ id, storeName, slug, rating (0 to 5 float, 0 when no reviews), reviewCount (int) }`. Seller rating averages approved reviews across all of the vendor's products |
| `category` | string | Category **id** (not an object) |
| `categoryName` | string | |
| `brandId`, `brandName` | string \| null | |
| `imageUrl` | string \| null | First image. Use it for cards |
| `images` | string[] | Full gallery, ordered. `[]` if none |
| `videoUrl` | string \| null | YouTube URL for the PDP media viewer |
| `variants` | Variant[] | Every option, ordered. `variants[0]` is the default |
| `tagline`, `description` | string | `""` when unset |
| `features` | string[] | Bullet points |
| `specs` | `{label, value}[]` | `[]` when unset. Stored as JSON, so parse defensively |
| `unit` | string | Default variant's unit. Values in use: `piece`, `dozen`, `carton`. It is a free string, so render unknown values as is |
| `price` | number (rupees) | Default variant's price |
| `rating` | number | 0 to 5 average of approved reviews. 0 when there are none |
| `reviewCount` | int | |
| `inStock` | bool | Admin "available for sale" flag. It does not reflect stock levels |
| `stockQty` | int | Default variant's raw stock. Ignores reservations, so **don't** use it for buyability |
| `updatedAt` | ISO string | |

Variant object: `{ id, sku, size: string|null, color: string|null, unit: string, price: number, stockQty: int, available: int }`. `available` = stock minus units held by unpaid orders. **Use `available` to decide buyability and the maximum quantity.** Recommended rule: a variant can be bought when `product.inStock && variant.available > 0`, and the quantity stepper caps at `variant.available`.

### Wishlist

`GET /catalog/wishlist` → 200, array of product objects, newest first.

`POST /catalog/wishlist/:productId` → 200, the **full updated wishlist** (array). Calling it again for the same product is a no-op. `productId` must be the product **id** (see Open questions on slugs).

| Status | Message | When |
|---|---|---|
| 404 | `Product not found` | Product hidden or missing |
| 409 | `This record is still referenced by other data and can't be removed` | A slug was passed instead of an id (DB backstop) |

`DELETE /catalog/wishlist/:productId` → 200, the full updated wishlist. Removing a product that isn't wishlisted still returns 200.

### Recently viewed

`POST /catalog/recently-viewed/:productId` → **204**. Call it when the PDP opens. Viewing the same product again moves it to the top without creating a duplicate. Errors: 404 `Product not found`. Pass the id, not the slug.

`GET /catalog/recently-viewed` → 200, array of up to 20 product objects, most recent first.

---

## 3. Cart

All cart endpoints need auth. A user has one active cart.

| Method | Path | Purpose |
|---|---|---|
| GET | `/cart` | Get the cart (an empty shape if none) |
| POST | `/cart/items` | Add a variant, or add to its quantity |
| PATCH | `/cart/items/:itemId` | Set a line's quantity |
| DELETE | `/cart/items/:itemId` | Remove a line |
| DELETE | `/cart` | Clear the cart |
| POST | `/cart/merge` | Merge a guest cart after sign-in |

### Cart object

Every cart endpoint (except merge, which wraps it) returns:

```json
{
  "success": true,
  "data": {
    "id": "cm2crt0001user0000000001",
    "status": "ACTIVE",
    "vendorId": "cm1vnd0001green000000001",
    "items": [
      {
        "id": "cm2cti0001line0000000001",
        "variantId": "cm2var0001drip0000000001",
        "productId": "cm2prd0001drip0000000001",
        "name": "Drip Irrigation Kit – 1 Acre",
        "slug": "drip-irrigation-kit-1-acre",
        "image": "https://xyz.supabase.co/storage/v1/object/public/irrikart-uploads/products/kit-front.jpg",
        "sku": "DRIP-KIT-1AC",
        "unit": "piece",
        "quantity": 2,
        "price": 4999,
        "lineTotal": 9998,
        "purchasable": true,
        "available": 22
      }
    ],
    "itemCount": 2,
    "subtotal": 9998,
    "total": 9998
  }
}
```

| Field | Notes |
|---|---|
| `id` | `null` when the user has no cart yet (the empty shape: `{ id:null, status:"ACTIVE", vendorId:null, items:[], itemCount:0, subtotal:0, total:0 }`) |
| `vendorId` | The single seller whose items are in the cart. `null` when empty |
| `items[].id` | **Cart line id**. Use it for PATCH and DELETE |
| `items[].price` | Price captured when the line was last added or updated. Checkout re-prices from live data, so the order total can differ if the price changed in between |
| `items[].purchasable` | `false` once the product was hidden or its seller can't be paid. Show the line as unavailable and ask the user to remove it. Checkout refuses the cart until they do |
| `items[].available` | Live available stock for that variant (`0` when not purchasable). Warn when `quantity > available` |
| `itemCount` | Sum of quantities (for the badge) |
| `subtotal`, `total` | Equal. The cart does not apply coupons. The discount shows only on the order |

After an order is paid (online) or placed (COD), that cart is converted and `GET /cart` returns the empty shape.

### One vendor per cart

A cart holds items from **one vendor only**. Adding an item from a different vendor fails with 409, and `details` tells you which vendors are involved:

```json
{
  "success": false,
  "message": "Your cart has items from GreenFlow Irrigation — clear it before adding items from AquaAgro Supplies.",
  "details": {
    "currentVendorId": "cm1vnd0001green000000001",
    "currentVendorName": "GreenFlow Irrigation",
    "newVendorId": "cm1vnd0002aqua0000000002",
    "newVendorName": "AquaAgro Supplies"
  }
}
```

The app should offer "Clear cart and add", which calls `DELETE /cart` and then retries `POST /cart/items`. Tell this 409 apart from the stock 409 by checking for `details.currentVendorId`. The vendor lock clears when the last line is removed.

### POST /cart/items

| Field | Type | Constraints |
|---|---|---|
| `variantId` | string | Required. Use `product.variantId` or the selected `variants[i].id` |
| `quantity` | int | Optional, default 1, must be > 0. **Added to** any existing quantity of the same variant |

```json
{ "variantId": "cm2var0001drip0000000001", "quantity": 2 }
```

Response 200: cart object.

| Status | Message | When |
|---|---|---|
| 400 | `Validation failed` | Bad body |
| 404 | `Product variant not found` | Unknown variantId |
| 404 | `This product is no longer available` | Product hidden or its seller can't be paid (also on `PATCH /cart/items/:itemId`) |
| 409 | `Only 3 of this item available` | Existing + requested quantity > `available` |
| 409 | `Your cart has items from X — clear it before adding items from Y.` (with `details`) | Different vendor |

### PATCH /cart/items/:itemId

Body: `{ "quantity": 3 }`. `quantity` is an int > 0 and **replaces** the line's quantity. `0` returns 400. Use DELETE to remove a line.

Response 200: cart object. Errors: 400 `Validation failed`; 404 `Cart item not found` (also when the line belongs to another user); 404 `Product variant not found`; 409 `Only N of this item available`.

### DELETE /cart/items/:itemId

Response 200: cart object. Errors: 404 `Cart item not found`.

### DELETE /cart

Response 200: cart object (empty). It succeeds even when there is no cart.

### POST /cart/merge

Call this once right after sign-in (after sync) if the user built a cart while signed out. Keep the guest cart locally as `{variantId, quantity}` lines.

| Field | Type | Constraints |
|---|---|---|
| `items` | array | 1 to 100 entries. **Don't call with an empty array** (400) |
| `items[].variantId` | string | Required |
| `items[].quantity` | int | > 0 |

```json
{ "items": [ { "variantId": "cm2var0001drip0000000001", "quantity": 1 }, { "variantId": "cm2var0009aqua0000000009", "quantity": 4 } ] }
```

Each line is added the same way `POST /cart/items` adds it (onto any existing quantity). This is best effort per line: a line that fails is **skipped whole** (no partial quantity) and reported. The other lines still merge.

Response 200:

```json
{
  "success": true,
  "data": {
    "cart": { "id": "cm2crt0001user0000000001", "status": "ACTIVE", "vendorId": "cm1vnd0001green000000001", "items": [], "itemCount": 1, "subtotal": 4999, "total": 4999 },
    "skipped": [
      { "variantId": "cm2var0009aqua0000000009", "quantity": 4, "reason": "Your cart has items from GreenFlow Irrigation — clear it before adding items from AquaAgro Supplies." }
    ]
  }
}
```

(`cart.items` is abbreviated here.) `skipped[].reason` is the error message the line would have got from `POST /cart/items`: `Product variant not found`, `Only N of this item available`, or the vendor message. If `skipped` is non-empty, show a summary, then clear the local guest cart either way.

---

## 4. Addresses

All address endpoints need auth.

| Method | Path | Purpose |
|---|---|---|
| GET | `/addresses` | List live addresses (default first, then newest) |
| POST | `/addresses` | Create |
| PATCH | `/addresses/:id` | Edit (**may return a new id**) |
| DELETE | `/addresses/:id` | Delete or hide |
| POST | `/addresses/:id/default` | Make default |

### Address object

```json
{
  "id": "cm2adr0001home0000000001",
  "name": "Ramesh Patil",
  "phone": "9876543210",
  "line1": "Gat No. 112, Shivaji Nagar",
  "line2": "Near Gram Panchayat",
  "city": "Baramati",
  "state": "Maharashtra",
  "pincode": "413102",
  "isDefault": true
}
```

`line2` may be `null` or `""`.

### Rules (all enforced server-side)

1. **Exactly one default** once the user has any address. The first address is always the default, whatever `isDefault` says. Setting a new default clears the old one. Deleting the default promotes the newest remaining address.
2. **`isDefault:false` on the current default is ignored.** It would leave the user with no default. To move the default, make another address the default.
3. **Editing an address that an order already uses returns a NEW id.** The old row is archived so the order and invoice keep the exact address they shipped to, and a new row is created with the edited fields (and the old row's default status). **The client must replace the old id with the returned `id`** everywhere it holds one: the selected checkout address, local caches, and so on. The old id disappears from `GET /addresses` and returns 404 from then on. An edit that changes only `isDefault`, or changes nothing, keeps the same id.
4. **Deleting an address that an order already uses hides it** (archives it) instead of deleting it. To the app this is the same as a delete: it is gone from the list and its id returns 404.
5. Archived addresses can't be edited, deleted, made default, or used at checkout (404 `Address not found`).

### POST /addresses

| Field | Type | Constraints |
|---|---|---|
| `name` | string | Required. Recipient name, trimmed, min 1 |
| `phone` | string | Required. Recipient phone, trimmed, **10 to 15 chars** (the server checks length only. Validate digits on the client) |
| `line1` | string | Required, min 1 |
| `line2` | string | Optional |
| `city` | string | Required, min 1 |
| `state` | string | Required, min 1 |
| `pincode` | string | Required. Exactly 6 digits (`Pincode must be 6 digits`) |
| `isDefault` | bool | Optional. `true` makes it the default |

Response **201**: address object.

Errors: 400 `Validation failed`, plus the common 401/403.

### PATCH /addresses/:id

The body has the same fields as create, all optional. Omitted fields keep their current value. `line2` can't be set back to null; send `""` to blank it.

Response 200: address object. **Use `data.id` from now on**, since it may differ from `:id` (rule 3).

Errors: 400 `Validation failed`; 404 `Address not found` (missing, archived or not yours).

### DELETE /addresses/:id

Response **204**. Errors: 404 `Address not found`. After deleting the default, re-fetch the list to see which address was promoted.

### POST /addresses/:id/default

Body: none. Response **204**. Errors: 404 `Address not found`.

---

## 5. Checkout and orders

All order endpoints need auth.

| Method | Path | Purpose |
|---|---|---|
| POST | `/orders/checkout` | Place an order from the cart (ONLINE or COD) |
| GET | `/orders` | Order history (latest 50, newest first) |
| GET | `/orders/:id` | Order detail |
| POST | `/orders/:id/pay` | Reopen payment for an unpaid online order |
| POST | `/orders/:id/cancel` | Cancel |
| POST | `/orders/:id/reorder` | Put a past order's items back in the cart |
| GET | `/orders/:id/invoice` | Invoice PDF |

### POST /orders/checkout

| Field | Type | Constraints |
|---|---|---|
| `addressId` | string | Required. A live address of the caller |
| `couponCode` | string | Optional. Trimmed, 1 to 40 chars, case-insensitive |
| `paymentMethod` | `"ONLINE"` \| `"COD"` | Optional, default `ONLINE` |

```json
{ "addressId": "cm2adr0001home0000000001", "couponCode": "monsoon10", "paymentMethod": "ONLINE" }
```

What the server does, in order:

1. Checks the address (404 if missing or archived).
2. Auto-cancels any online orders (from any user) left unpaid past `ORDER_PAYMENT_TIMEOUT_MINUTES` (default **30**), which frees their held stock.
3. Loads the active cart (400 if empty) and checks that the seller is still active.
4. Re-prices every line from **live** variant prices and checks live `available` stock.
5. Applies the coupon, if one was given (see Coupons).
6. `total = max(round(subtotal − discount), 0)`. It must be ≥ ₹1.
7. Places the order:
   - **COD**: COD must be enabled (default **enabled**) and `total ≤ COD_MAX_ORDER_AMOUNT` (default **₹5000**, inclusive). The order is created as **`CONFIRMED`** immediately, stock is taken, the cart is converted, and a shipment is booked in the background. No payment step follows.
   - **ONLINE**: stock is **reserved** (held), the order is created as **`PLACED`**, and a Razorpay order is created. **The cart is left untouched** until payment is confirmed. The response holds what you need to open Razorpay.

A coupon use is recorded at checkout for both methods. It is given back if the order is cancelled (including auto-cancel).

Response **201**, ONLINE:

```json
{
  "success": true,
  "data": {
    "orderId": "cm2ord0001user0000000001",
    "orderNumber": "ORD-20261016-A1B2C3",
    "paymentMethod": "ONLINE",
    "amount": 8998,
    "currency": "INR",
    "providerOrderId": "order_PQx7Yh3kL9mN2a",
    "customerId": "cust_Pq8sT2uV4wX6yZ",
    "provider": "razorpay",
    "keyId": "rzp_live_AbCdEf123456"
  }
}
```

| Field | Notes |
|---|---|
| `orderId` | **Our** order id. Use it for `/payments/verify`, `/orders/:id`, `/orders/:id/pay` |
| `orderNumber` | Human-facing number, format `ORD-YYYYMMDD-XXXXXX` |
| `amount` | **Rupees** (whole). The Razorpay SDK `amount` option is paise, so pass `amount * 100` |
| `currency` | Always `INR` |
| `providerOrderId` | Razorpay order id. Pass it as `order_id` |
| `customerId` | Razorpay customer id for saved cards/UPI. Pass it as `customer_id`. **May be `null`** if Razorpay customer creation failed; checkout still works, just without saved methods |
| `provider` | `"razorpay"` |
| `keyId` | Razorpay public key. Pass it as `key` |

Response **201**, COD:

```json
{
  "success": true,
  "data": {
    "orderId": "cm2ord0002user0000000002",
    "orderNumber": "ORD-20261016-9F3E1D",
    "paymentMethod": "COD",
    "status": "CONFIRMED",
    "amount": 1499,
    "currency": "INR"
  }
}
```

Errors:

| Status | Message | When |
|---|---|---|
| 400 | `Validation failed` | Missing `addressId`, bad `paymentMethod`, coupon > 40 chars |
| 404 | `Address not found` | Address missing, archived or not yours |
| 400 | `Cart is empty` | |
| 400 | `This seller is no longer available` | Cart's vendor suspended or missing |
| 409 | `Drip Irrigation Kit – 1 Acre is no longer available — remove it from your cart` | A line's product was hidden or its seller can't be paid |
| 409 | `Only 2 of DRIP-KIT-1AC available` | A line exceeds live available stock |
| 409 | `Insufficient stock for one or more items` | Stock taken by someone else at the same moment (race) |
| 404 | `Coupon not found` | Unknown or deactivated code |
| 400 | `Coupon has expired` | |
| 400 | `Minimum cart value of 999 required` | Subtotal below the coupon minimum (the number is printed raw, without ₹) |
| 409 | `Coupon usage limit reached` | Global limit hit |
| 409 | `You have already used this coupon` | Per-user limit hit (unpaid PLACED orders count) |
| 400 | `Order total must be at least ₹1 — adjust your coupon or cart` | |
| 400 | `Cash on delivery is not available right now` | COD disabled |
| 400 | `Cash on delivery is available on orders up to ₹5000` | COD over the limit (the number follows the server setting) |
| 400 | `Payment gateway rejected this order: <reason>` | Razorpay order creation failed (ONLINE) |

**Important:** don't call checkout again for an order that is waiting on payment. Each ONLINE checkout creates a **new** order that holds stock **and** uses the coupon. To retry payment, use `POST /orders/:id/pay`.

### Order statuses

| Status | Meaning | Suggested UI |
|---|---|---|
| `PLACED` | Online order created, payment not yet confirmed. Stock is held. Auto-cancelled 30 min after `createdAt` if unpaid | "Awaiting payment". Show **Pay now** (`/pay`) and **Cancel** |
| `PAYMENT_FAILED` | Last online payment attempt failed. Stock still held. Same 30-min expiry | "Payment failed". Show **Retry payment** (`/pay`) and **Cancel** |
| `CONFIRMED` | Paid (online) or placed (COD). Check `accepted`: `false` means waiting for the seller, `true` means the seller accepted and is preparing it | "Confirmed" / "Seller is preparing your order". **Cancel** allowed within the cancel window |
| `PACKED` | Seller packed it | "Packed". No cancel |
| `SHIPPED` | Handed to the courier | "Shipped". Show the shipment (AWB/events) if present |
| `DELIVERED` | Delivered (currently set by IrriKart admin) | "Delivered". Offer reviews |
| `CANCELLED` | Cancelled. `cancelledBy` is `customer` / `vendor` (seller rejected) / `admin` / `system` (payment not completed in time). `cancelReason` holds the text | "Cancelled" plus reason. Mention a refund if it was paid online |
| `RETURNED` | In the enum, but nothing sets it today | Render generically |

`paymentStatus` (latest gateway attempt, online orders only): `CREATED` (attempt open), `CAPTURED` (paid), `FAILED`, or `null` for COD.

### GET /orders

Returns at most the **latest 50 orders**, newest first. It is a plain array without pagination, and each entry is a summary without line items.

```json
{
  "success": true,
  "data": [
    {
      "id": "cm2ord0001user0000000001",
      "orderNumber": "ORD-20261016-A1B2C3",
      "status": "CONFIRMED",
      "paymentMethod": "ONLINE",
      "paymentStatus": "CAPTURED",
      "accepted": false,
      "amount": 8998,
      "currency": "INR",
      "createdAt": "2026-10-16T09:42:11.512Z"
    }
  ]
}
```

### GET /orders/:id

```json
{
  "success": true,
  "data": {
    "id": "cm2ord0001user0000000001",
    "orderNumber": "ORD-20261016-A1B2C3",
    "status": "SHIPPED",
    "paymentMethod": "ONLINE",
    "paymentStatus": "CAPTURED",
    "accepted": true,
    "amount": 8998,
    "currency": "INR",
    "createdAt": "2026-10-16T09:42:11.512Z",
    "subtotal": 9998,
    "discount": 1000,
    "acceptedAt": "2026-10-16T10:05:00.000Z",
    "cancelledAt": null,
    "cancelledBy": null,
    "cancelReason": null,
    "items": [
      {
        "id": "cm2oit0001line0000000001",
        "variantId": "cm2var0001drip0000000001",
        "productId": "cm2prd0001drip0000000001",
        "name": "Drip Irrigation Kit – 1 Acre",
        "slug": "drip-irrigation-kit-1-acre",
        "image": "https://xyz.supabase.co/storage/v1/object/public/irrikart-uploads/products/kit-front.jpg",
        "sku": "DRIP-KIT-1AC",
        "unit": "piece",
        "quantity": 2,
        "unitPrice": 4999,
        "totalPrice": 9998
      }
    ],
    "address": {
      "name": "Ramesh Patil",
      "phone": "9876543210",
      "line1": "Gat No. 112, Shivaji Nagar",
      "line2": "Near Gram Panchayat",
      "city": "Baramati",
      "state": "Maharashtra",
      "pincode": "413102"
    },
    "shipment": {
      "status": "IN_TRANSIT",
      "awbNumber": "141123456789012",
      "trackingEvents": [
        { "status": "PICKED UP", "description": "Shipment picked up", "occurredAt": "2026-10-17T07:10:00.000Z" },
        { "status": "IN TRANSIT", "description": "Reached Pune hub", "occurredAt": "2026-10-18T02:31:00.000Z" }
      ]
    }
  }
}
```

| Field | Notes |
|---|---|
| summary fields | As in `GET /orders` |
| `subtotal` | Sum of line totals (prices frozen at checkout) |
| `discount` | `subtotal − amount`, never negative. Not stored separately |
| `acceptedAt` | When the seller accepted. Null before |
| `cancelledAt`, `cancelledBy`, `cancelReason` | Set when cancelled |
| `items[].id` | **Order item id**. Use it as `orderItemId` when posting a review |
| `items[].unitPrice`, `totalPrice` | Frozen at checkout |
| `address` | The address the order ships to (no id). Null only for legacy orders |
| `shipment` | `null` until a shipment is booked (see Shipping) |

Errors: 404 `Order not found` (missing or not yours).

### POST /orders/:id/pay

Reopens payment for an **ONLINE** order in `PLACED` or `PAYMENT_FAILED`, against the **same** Razorpay order. Body: none.

Response **200**: the same shape as an ONLINE checkout response (`orderId, orderNumber, paymentMethod, amount, currency, providerOrderId, customerId, provider, keyId`).

| Status | Message | When |
|---|---|---|
| 404 | `Order not found` | |
| 409 | `This order was cancelled — place it again from your cart` | Order is `CANCELLED` (including auto-expired) |
| 409 | `This order is already paid` | Any other status, **including COD orders** |

### POST /orders/:id/cancel

| Field | Type | Constraints |
|---|---|---|
| `reason` | string | Required. Trimmed, **3 to 500 chars** |

```json
{ "reason": "Ordered the wrong size" }
```

When cancelling is allowed:

- `PLACED` or `PAYMENT_FAILED`: always.
- `CONFIRMED`: only within `ORDER_CANCEL_WINDOW_HOURS` (default **24 h**) of `createdAt`. This holds even after the seller has accepted.
- Any other status: never.

Effects: held or sold stock goes back on sale, a coupon use is given back, and a **paid online** order is refunded in full to the original payment method. Unpaid and COD orders get no refund.

Response 200: the full order detail (as in `GET /orders/:id`, status `CANCELLED`) **plus** `refundStatus`:

```json
{ "success": true, "data": { "id": "cm2ord0001user0000000001", "status": "CANCELLED", "cancelledBy": "customer", "cancelReason": "Ordered the wrong size", "refundStatus": "processed" } }
```

(The response is abbreviated here.)

| `refundStatus` | Meaning / UI |
|---|---|
| `null` | No refund needed (unpaid, or COD) |
| `pending` / `processed` | Refund created at Razorpay. Show "Refund initiated. It reaches your account in 5 to 7 working days" |
| `failed` | Razorpay refund call failed. The order is still cancelled and IrriKart staff will follow up. Show "Refund will be processed by our team" |

| Status | Message | When |
|---|---|---|
| 400 | `Validation failed` | Reason missing, or under 3 or over 500 chars |
| 404 | `Order not found` | |
| 409 | `A packed order can't be cancelled` (also `shipped`, `delivered`, `cancelled`, `returned`) | Status doesn't allow it |
| 409 | `Orders can only be cancelled within 24 hours of placing them` | CONFIRMED past the window |
| 409 | `This order was just updated — refresh and try again` | The status changed at the same moment (e.g. seller packed it). Refetch |

### POST /orders/:id/reorder

Puts all of a past order's lines (any status) back into the cart, with the same semantics as `/cart/merge`. Body: none.

Response 200: `{ cart, skipped }`, exactly as in `POST /cart/merge`. Errors: 404 `Order not found`.

### GET /orders/:id/invoice

Returns a PDF (`Content-Type: application/pdf`, `Content-Disposition: attachment; filename="invoice-ORD-20261016-A1B2C3.pdf"`). Download it with your HTTP client **including the Authorization header**, save it to a file, then open or share it. A browser or `url_launcher` can't attach the token, so don't use them.

Only orders in `CONFIRMED`, `PACKED`, `SHIPPED`, `DELIVERED` or `RETURNED` are invoiceable.

| Status | Message | When |
|---|---|---|
| 404 | `Order not found` (JSON) | |
| 409 | `No invoice for a placed order` (likewise `payment_failed`, `cancelled`) (JSON) | Unpaid or cancelled |

---

## 6. Payments (Razorpay)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/payments/verify` | yes | Confirm a payment right after the SDK reports success |
| GET | `/payments/methods` | yes | Saved cards/UPI/wallets |
| DELETE | `/payments/methods/:id` | yes | Remove a saved method |

(`POST /payments/webhook` is called by Razorpay. The app never calls it.)

### Flow with the `razorpay_flutter` SDK

1. `POST /orders/checkout` with `paymentMethod: "ONLINE"` (or `POST /orders/:id/pay` for a retry). Keep `orderId`.
2. Open Razorpay:
   ```dart
   _razorpay.open({
     'key': data['keyId'],
     'amount': (data['amount'] * 100).round(),   // server sends rupees; SDK wants paise
     'currency': data['currency'],               // 'INR'
     'order_id': data['providerOrderId'],
     if (data['customerId'] != null) 'customer_id': data['customerId'],
     'name': 'IrriKart',
     'description': data['orderNumber'],
     'prefill': {'contact': user.phone, 'email': user.email ?? ''},
   });
   ```
   Saved methods are offered and saved inside the Razorpay sheet when `customer_id` is passed. Follow Razorpay's docs for its save/remember options. The backend only provides `customerId`.
3. **On `EVENT_PAYMENT_SUCCESS`** (`PaymentSuccessResponse { paymentId, orderId, signature }`), call:
   ```
   POST /payments/verify
   { "orderId": "<our orderId from step 1>", "providerPaymentId": "<paymentId>", "signature": "<signature>" }
   ```
   `orderId` here is **our** order id, **not** Razorpay's `order_...` id.
4. Handle the returned `status` (see below).
5. **On `EVENT_PAYMENT_ERROR`**, don't call verify. Razorpay's webhook moves a real failed attempt to `PAYMENT_FAILED`. If the user simply closed the sheet, the order stays `PLACED`. Either way, show the order with **Retry payment** (`POST /orders/:id/pay`, then step 2 again) and **Cancel**. Stock stays held until 30 minutes after `createdAt`, after which the order is auto-cancelled.

The backend confirms an order through either verify or the Razorpay webhook, whichever arrives first. The other one becomes a no-op. A valid signature alone never confirms an order: the server fetches the payment from Razorpay and trusts its status.

### POST /payments/verify

| Field | Type | Constraints |
|---|---|---|
| `orderId` | string | Required. Our order id |
| `providerPaymentId` | string | Required. `PaymentSuccessResponse.paymentId` (`pay_...`) |
| `signature` | string | Required. `PaymentSuccessResponse.signature` |

Response 200:

```json
{ "success": true, "data": { "orderId": "cm2ord0001user0000000001", "status": "CONFIRMED" } }
```

| `status` | Meaning | App action |
|---|---|---|
| `CONFIRMED` | Paid. The cart has been converted | Show success. Refresh the cart badge (now empty) |
| `PLACED` | Razorpay hasn't settled the payment yet (authorized, not captured) | Show "Confirming payment…" and **poll** `GET /orders/:id` |
| `PAYMENT_FAILED` | Razorpay reports the payment failed | Show failure with Retry / Cancel |
| `CANCELLED` | Payment landed after the order was cancelled or expired. The server refunds it automatically | "Order was cancelled; your payment will be refunded" |

**Polling advice:** after `PLACED`, poll `GET /orders/:id` every 3 s for up to about 60 s, until `status` is no longer `PLACED`. If it is still `PLACED` after that, stop and show "Payment is being confirmed. We'll update your order", and refresh when the user next opens Orders. The webhook settles it in the background.

| Status | Message | When |
|---|---|---|
| 400 | `Validation failed` | Missing fields |
| 404 | `Order not found` | Unknown order, not yours, or a COD order |
| 400 | `Payment signature verification failed` | Bad or mismatched signature (e.g. you sent Razorpay's order id as `orderId`) |
| 400 | `Payment does not belong to this order` | `paymentId` belongs to a different Razorpay order |
| 500 | `Internal server error` | Razorpay lookup failed. Fall back to polling `GET /orders/:id` |

### GET /payments/methods

Returns `[]` if the user has never done an online checkout.

```json
{
  "success": true,
  "data": [
    { "id": "token_PqR1sT2uV3wX4y", "method": "card", "card": { "last4": "1111", "network": "Visa", "issuer": "HDFC" }, "vpa": null, "wallet": null, "bank": null, "createdAt": "2026-10-10T12:00:00.000Z" },
    { "id": "token_AbC5dE6fG7hI8j", "method": "upi", "card": null, "vpa": "ramesh@okhdfcbank", "wallet": null, "bank": null, "createdAt": "2026-10-12T08:30:00.000Z" }
  ]
}
```

Fields: `id` (Razorpay token id), `method` (`card`, `upi`, `wallet`, …), `card` (`{last4, network, issuer}` or null), `vpa` (string or null), `wallet` (string or null), `bank` (string or null), `createdAt` (ISO string or null). Methods are added only through the Razorpay sheet.

Errors: Razorpay failures return 500.

### DELETE /payments/methods/:id

Response **204**. Errors: 404 `Saved method not found`.

---

## 7. Coupons

- Coupons are **entered at checkout only**, as `couponCode` on `POST /orders/checkout`. **There is no endpoint to validate a coupon or preview the discount beforehand.** The discount first appears on the created order (`discount` on `GET /orders/:id`). For ONLINE, the payable `amount` in the checkout response already includes it.
- Codes are **case-insensitive** and trimmed (`monsoon10` = `MONSOON10`).
- `FLAT` coupons take off a fixed rupee amount. `PERCENT` coupons take off a percentage of the subtotal. Either way, the discount is rounded to whole rupees and capped at the subtotal. The order total must still be ≥ ₹1.
- One coupon per order.
- A use is counted at checkout (online orders too, while unpaid) and given back when the order is cancelled or auto-expired.

Errors that can come back from checkout (checked in this order):

| Status | Message |
|---|---|
| 404 | `Coupon not found` (unknown or deactivated) |
| 400 | `Coupon has expired` |
| 400 | `Minimum cart value of <amount> required` |
| 409 | `Coupon usage limit reached` |
| 409 | `You have already used this coupon` |
| 400 | `Order total must be at least ₹1 — adjust your coupon or cart` |

UI suggestion: show a coupon field on the checkout screen. On a coupon error, show the message next to the field and let the user remove the code and place the order again.

---

## 8. Reviews

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/reviews/product/:productId` | no | Approved reviews for a product, newest first |
| POST | `/reviews` | yes | Review a purchased order item |

### GET /reviews/product/:productId

`productId` must be the product **id** (a slug returns `[]`). The response is an unpaginated array. An unknown product also returns `[]`.

```json
{
  "success": true,
  "data": [
    { "id": "cm2rev0001user0000000001", "rating": 5, "comment": "Good emitters, even flow across the plot.", "createdAt": "2026-10-15T14:22:03.000Z", "userName": "Ramesh Patil" }
  ]
}
```

`comment` may be null. `userName` is the reviewer's name, or `"Verified buyer"` when they have none. For the summary, use `product.rating` and `product.reviewCount`.

### POST /reviews

| Field | Type | Constraints |
|---|---|---|
| `orderItemId` | string | Required. `items[].id` from `GET /orders/:id` |
| `rating` | int | Required, 1 to 5 |
| `comment` | string | Optional. Trimmed, max 1000 chars |

```json
{ "orderItemId": "cm2oit0001line0000000001", "rating": 5, "comment": "Good emitters, even flow across the plot." }
```

Eligibility: the item must be on the caller's own order, and that order must be `CONFIRMED`, `PACKED`, `SHIPPED` or `DELIVERED` (i.e. paid or COD-placed, and not cancelled). One review per order item. Reviews are published immediately (auto-approved), and the product and seller ratings update at once.

Response **201**: `{ "success": true, "data": null }`.

| Status | Message | When |
|---|---|---|
| 400 | `Validation failed` | |
| 404 | `Order item not found` | Unknown or not yours |
| 400 | `This order has not been paid yet` | Order `PLACED`, `PAYMENT_FAILED`, `CANCELLED` or `RETURNED` |
| 409 | `You already reviewed this item` | |

The order API doesn't say whether an item has already been reviewed. Treat 409 as "already reviewed" and disable the button.

---

## 9. RFQ (bulk quote requests)

A request for a bulk price. It is a lead for IrriKart staff, not an order: staff contact the customer by phone or email **outside the app**. Nothing here touches cart, stock or payment.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/rfq` | yes | Submit a quote request |
| GET | `/rfq` | yes | Caller's own requests, newest first |

### POST /rfq

| Field | Type | Constraints |
|---|---|---|
| `productId` | string | Optional. Product id or slug of a **live** product |
| `quantity` | int | Required, 1 to 100000 |
| `requirements` | string | Optional. Trimmed, max 2000 chars |
| `targetPrice` | number | Optional, > 0. The customer's hoped-for price in rupees (per unit or total is not specified, so label it clearly in the UI) |

Rule: **send `productId`, a non-empty `requirements`, or both.** With neither, the server returns 400 `Validation failed` with `fieldErrors.body: ["Pick a product or describe what you need"]`.

```json
{ "productId": "cm2prd0001drip0000000001", "quantity": 50, "requirements": "Need delivery to Baramati before 1 Nov; GST invoice required.", "targetPrice": 4200 }
```

Response **201**:

```json
{
  "success": true,
  "data": {
    "id": "cm2rfq0001user0000000001",
    "status": "NEW",
    "quantity": 50,
    "requirements": "Need delivery to Baramati before 1 Nov; GST invoice required.",
    "targetPrice": 4200,
    "product": { "id": "cm2prd0001drip0000000001", "title": "Drip Irrigation Kit – 1 Acre", "slug": "drip-irrigation-kit-1-acre" },
    "createdAt": "2026-10-16T10:01:44.000Z"
  }
}
```

`product` is `{ id, title, slug }` (note: **`title`**, not `name`), or `null` for a requirements-only request. `requirements` and `targetPrice` may be null.

| Status | Message | When |
|---|---|---|
| 400 | `Validation failed` | Bad fields, or neither product nor requirements |
| 404 | `Product not found` | `productId` hidden or missing |

### GET /rfq

Returns a plain array of the RFQ objects above, newest first, with no pagination.

### RFQ statuses

| Status | Meaning | UI |
|---|---|---|
| `NEW` | Received, not yet handled | "Submitted. Our team will contact you" |
| `CONTACTED` | Staff have reached out | "We've contacted you" |
| `CLOSED` | Done (quoted, converted or dropped) | "Closed" |

Staff can move a request to any status. Staff notes (`adminNote`) are **never** returned to the customer. No quoted price is returned either (see Not available yet).

---

## 10. Shipping

The customer-visible part of shipping is the `shipment` field on `GET /orders/:id`. There is no separate customer shipping endpoint.

- After an order is confirmed (COD at checkout, online once payment is captured), the backend books a Shiprocket shipment **in the background**. If booking fails, `shipment` stays `null`, so the UI must handle `null` on any status.
- Shape: `{ status, awbNumber, trackingEvents[] }`.
  - `status`: `CREATED`, `IN_TRANSIT`, `DELIVERED`, `RTO` (returned to origin) or `FAILED` (cancelled or undelivered).
  - `awbNumber`: string or null. Null if the AWB isn't assigned yet.
  - `trackingEvents[]`: `{ status, description, occurredAt }`, oldest first. `status` is Shiprocket's raw uppercase string (e.g. `PICKED UP`, `IN TRANSIT`, `OUT FOR DELIVERY`, `DELIVERED`). `description` may be null.
- No courier name, tracking URL or ETA is exposed.
- The shipment `status` and the order `status` are independent. A shipment showing `DELIVERED` doesn't move the order to `DELIVERED` (admin does that).
- No pincode serviceability check or shipping fee exists. Totals contain no delivery charge.

---

## 11. Not available yet

Don't build UI that depends on these. Each was checked in the code:

| Feature | State in backend |
|---|---|
| Push notifications / FCM token registration | No endpoint. `/notifications` mounts an empty router (every path returns 404 `Route ... not found`). A `DeviceToken` table exists, but nothing writes it |
| In-app notification centre | Same. No list or read endpoints |
| Returns / return requests | No endpoint. `RETURNED` exists as an order status, but nothing sets it |
| Quote prices on RFQs | No quoted-price field. Staff reply outside the app |
| Coupon pre-validation / listing available coupons | `/discounts` mounts an empty router. Coupons only via `couponCode` at checkout |
| Shipping fee, pincode serviceability, delivery ETA | Not implemented |
| Order tracking URL / courier name | Not exposed (only AWB + events) |
| Category tree | `parentId` is not exposed. Categories are a flat list |
| Vendor storefront endpoint | None. Use `GET /catalog/products?vendor=<id>` plus `product.vendor` |
| Pagination on orders, reviews, RFQs, wishlist | Not implemented. Orders are capped at 50 |
| Profile email/phone change | Not via API (they come from Firebase) |

---

## 12. Recommended app flows

### A. Sign-in

1. The user enters a phone number. `FirebaseAuth.verifyPhoneNumber` sends the OTP, the user enters it, and `signInWithCredential` signs them in.
2. `POST /auth/firebase/sync` with the ID token.
   - 200: store the user. If `name == null`, show a "Your name" step, then `PATCH /auth/me { name }`.
   - 403 (blocked): `signOut()` and show the blocked screen.
3. If a local guest cart exists: `POST /cart/merge { items }`. Show any `skipped` lines, then clear the local guest cart.
4. `GET /cart` (badge), `GET /addresses`, `GET /catalog/wishlist` as needed.
5. On app start with an existing Firebase session: `GET /auth/me`. On `401 No account linked...` call sync. Handle other 401s and 403 per Conventions.

### B. Browse → cart → checkout (ONLINE)

1. Home: `GET /catalog/banners`, `GET /catalog/categories`, `GET /catalog/products?sort=popular&limit=10`.
2. Listing: `GET /catalog/products?category=<id>&page=1&limit=20` (plus filters and sort). Paginate with `page` until `page * limit >= total`.
3. PDP: `GET /catalog/products/<slug or id>`, then `POST /catalog/recently-viewed/<id>` (fire and forget), then `GET /reviews/product/<id>`. Variant picker: `variants[]`, buyable when `inStock && available > 0`.
4. Add to cart: `POST /cart/items { variantId, quantity }`.
   - 409 with `details.currentVendorId`: ask "Clear cart?". On yes, `DELETE /cart`, then retry.
   - 409 without details: stock message.
5. Cart screen: `GET /cart`. Change quantity with `PATCH /cart/items/<itemId>`, remove with `DELETE /cart/items/<itemId>`.
6. Address step: `GET /addresses`. Preselect `isDefault`. If the list is empty, show the add form (`POST /addresses`).
7. Checkout screen: an optional coupon field, then `ONLINE` / `COD`. Hide or disable COD when `cart.total > 5000` (server default; the server stays authoritative).
8. `POST /orders/checkout { addressId, couponCode?, paymentMethod: "ONLINE" }` → 201. Keep `orderId`.
9. Open Razorpay as described in Payments, then continue with flow D.

### C. Browse → cart → checkout (COD)

Steps 1 to 7 as in B, then:

8. `POST /orders/checkout { addressId, couponCode?, paymentMethod: "COD" }` → 201 with `status: "CONFIRMED"`.
9. Show the order-placed screen. The cart is now empty (`GET /cart` to refresh the badge). Open `GET /orders/<orderId>` for details.
10. On a 400 COD error, show the message and offer ONLINE instead.

### D. Payment verify / poll

1. SDK success: `POST /payments/verify { orderId, providerPaymentId: paymentId, signature }`.
2. `CONFIRMED`: success screen, then refresh the cart.
3. `PLACED`: "Confirming payment…". Poll `GET /orders/<orderId>` every 3 s for up to 60 s.
   - It becomes `CONFIRMED`: success.
   - It becomes `PAYMENT_FAILED`: failure screen (step 5).
   - It is still `PLACED` after 60 s: "We're confirming your payment" and send the user to Order detail.
4. `CANCELLED`: "Order expired; refund on its way".
5. SDK error, or `PAYMENT_FAILED`: show **Retry** and **Cancel**.
   - Retry: `POST /orders/<orderId>/pay`, then reopen Razorpay with the new response.
   - Cancel: flow E.
   - Don't call checkout again (that creates a second order).
6. Verify returned 500 or a network error: skip straight to polling (step 3).

### E. Cancel an order

1. Show **Cancel** when the status is `PLACED` or `PAYMENT_FAILED`, or when it is `CONFIRMED` and `now < createdAt + 24 h`.
2. Ask for a reason (min 3 chars, max 500. Offer presets like "Ordered by mistake", plus free text).
3. `POST /orders/<id>/cancel { reason }`.
4. 200: update the order from the response. Show the refund copy based on `refundStatus` (null, pending/processed, failed).
5. 409: show the message and refetch `GET /orders/<id>` (the status probably moved on).

### F. Edit an address

1. `PATCH /addresses/<id>` with the changed fields only.
2. **Replace `<id>` with `response.data.id` everywhere**: the list, the selected checkout address, and any cached default.
3. Refetch `GET /addresses` to be safe (the old row may have vanished and a new one appeared).
4. Set the default with `POST /addresses/<id>/default` (204), then refetch the list. Don't try to un-default by sending `isDefault:false`; it is ignored.
5. Delete with `DELETE /addresses/<id>` (204), then refetch (a new default may have been promoted).
6. If checkout returns 404 `Address not found`, refetch the address list and ask the user to pick again.

### G. Submit an RFQ

1. Entry points: a "Request bulk quote" button on the PDP (prefills `productId`), and a generic "Bulk enquiry" form (requirements only).
2. Validate on the client: quantity is an integer 1 to 100000; requirements ≤ 2000 chars; product or non-empty requirements; target price > 0 if given.
3. `POST /rfq { productId?, quantity, requirements?, targetPrice? }` → 201. Show "Submitted. Our team will contact you on <phone>".
4. "My quote requests": `GET /rfq`. Show the status chip (NEW / CONTACTED / CLOSED), quantity, product title and date.
5. On 404 `Product not found`, the product went offline. Let the user send it as requirements-only.

---

## 13. Open questions

1. **Hosts.** The production and staging base URLs are not in the backend repo. The Swagger `servers` entry is localhost only. Who supplies them?
2. **Validation error shape.** `details.fieldErrors` is keyed by `body` / `query` / `params`, not by field name, so the app can't highlight the failing field. Should `validate()` flatten `body`'s own errors (e.g. `{ name: [...], pincode: [...] }`)?
3. **Payment amount unit.** The checkout and `/pay` responses return `amount` in **rupees**. Razorpay's SDK needs paise, so the app multiplies by 100. Is that intended, or should the API return `amountPaise` as well?
4. **Integer rupees.** Order totals are rounded to whole rupees, but product, variant and cart prices are `Decimal(10,2)` and the admin forms accept decimals (`z.number().nonnegative()`). Should prices be restricted to integers, or should the app handle paise-level prices?
5. **Repeat checkout.** Each ONLINE checkout creates a new order, a new stock hold and a new coupon use, while the previous unpaid order still holds stock for 30 minutes. A user who backs out and taps "Place order" again can hit `You have already used this coupon` or false stock shortages. Should checkout reuse or cancel the caller's pending order?
6. **Expiry is lazy.** Unpaid orders are auto-cancelled only when someone checks out (or an admin opens orders), not on a timer. An order can show `PLACED` well past 30 minutes, and `/pay` doesn't check expiry. Should the app treat `createdAt + 30 min` as expired in the UI, or will the backend add a scheduled sweep?
7. **Order status vs shipment.** Shiprocket webhooks update only the shipment. The order moves to `DELIVERED` only when an admin sets it, and nothing ever sets `RETURNED`. Should a shipment `DELIVERED` advance the order?
8. **Review eligibility signal.** Order items carry no `reviewed` flag, so the app learns about a duplicate only from the 409. Add `reviewId`/`reviewed` to order items?
9. **Wishlist / recently viewed with a slug.** These endpoints accept a slug for the visibility check but then store it as a product id, which fails with a misleading 409. Should they resolve the slug to an id, or reject slugs explicitly?
10. **Rate limit per IP.** 300 requests per 15 minutes per IP may be tight for users behind carrier NAT sharing one IP. The 429 body is plain text, not the JSON envelope.
11. **Unpaginated lists.** Orders (capped at 50), reviews, RFQs and wishlist have no pagination. Is that acceptable for v1?
12. **Missing order fields.** Order summaries and details have no seller/store name and no item count. Should they be added for the order list UI?
13. **Coupon message format.** `Minimum cart value of 999 required` prints the raw decimal without ₹ (e.g. `999.5` is possible).
14. **Category/brand `productCount`** includes hidden products, so it can disagree with list results.
15. **Image URLs.** `scripts/check-catalog-api.js` asserts that image URLs are absolute, but no code converts legacy relative paths to absolute URLs. Confirm that every stored URL is an absolute Supabase URL.
16. **RFQ `targetPrice` semantics.** Is it per unit or for the whole quantity? The schema doesn't say.
