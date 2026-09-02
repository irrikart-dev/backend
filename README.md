# IrriKart Backend

Catalogue + admin API for the IrriKart storefront, mobile app and admin dashboard.

Node 18+ · Express · JSON file store (no external database in phase 1).

## Run

```bash
npm install
cp .env.example .env     # already done once; edit secrets before deploying
npm run dev              # http://localhost:4000/api/v1
```

On first boot `data/db.json` is created from the bundled fixtures in
`src/data/` — the 43 products and 11 categories carried over from the
IrriKart (Irigacio) site. Those rows are marked `source: "seed"`; products
created in the dashboard are `source: "admin"`. **Both are served from the
same public endpoints**, which is how a product added in the dashboard shows
up in the mobile app without an app release.

`npm run seed -- --force` rebuilds the store from fixtures and discards every
dashboard edit.

## Dummy admin (phase 1)

| | |
|---|---|
| Email | `admin@irrikart.in` |
| Password | `Admin@123` |

Defined by `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`, hashed with bcrypt at
boot. There is exactly one admin; replace `src/services/auth-service.js` with
a real user table when multi-admin is needed.

## Endpoints

### Public — `/api/v1`

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | liveness |
| GET | `/catalog` | categories + products in one response (used by the app) |
| GET | `/categories` | active categories |
| GET | `/products` | filters: `category`, `search`, `featured`, `inStock` |
| GET | `/products/:slug` | single product |

Only `active` products appear here.

### Public — `/api/v1/auth` (mobile app sign-up)

The app's sign-up flow: email → emailed 6-digit code → set password. The
Firebase account is created here, server-side, only once the code is
verified — nothing exists for an email nobody actually checked.

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/signup/request-otp` | `{email}` | emails a 6-digit code (60s resend cooldown, 10 min expiry) |
| POST | `/signup/verify-otp` | `{email, otp}` | 5 attempts; on success returns `{signupToken}` (10 min JWT) |
| POST | `/signup/complete` | `{signupToken, password}` | creates the Firebase user, returns `{customToken}` for the app to sign in with |

Needs the Firebase Admin SDK configured (`FIREBASE_SERVICE_ACCOUNT_PATH` or
the `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` trio)
— unset, `/complete` returns `503`. With no `SMTP_HOST`, the OTP is logged to
this server's console instead of emailed, which is enough to exercise the
whole flow with no mail provider (refused at boot in production). See
`.env.example` and `irrikart-mobile-app/docs/FIREBASE_SETUP.md`.

### Admin — `/api/v1/admin` (Bearer JWT)

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | `{email, password}` → `{token, user}` |
| GET | `/auth/me` | current admin |
| GET | `/stats` | dashboard counters |
| GET | `/products` | includes inactive; `search`, `category` |
| POST | `/products` | create |
| PATCH | `/products/:id` | full edit (name, SKU, specs, stock, flags…) |
| PATCH | `/products/:id/pricing` | `{mrp, price}` — inline price editor |
| DELETE | `/products/:id` | admin-created products only |
| GET/POST/PATCH | `/categories` | |

Seed products cannot be deleted (the app links to them); set `active: false`
to hide one instead. `price` may never exceed `mrp` — enforced on create,
update and the pricing endpoint.

## Money

Whole rupees, integers. Paise arrive with the payments feature; the app's
interim model matches this deliberately so the switch is one change on each side.

## Layout

```
src/
  config/     env → typed config
  data/       seed fixtures (mirror of the app's assets/mock/)
  middleware/ auth gate, error handler
  routes/     catalog.routes.js (public), auth.routes.js (app sign-up), admin.routes.js (dashboard)
  services/   store.js (persistence), product/category/auth services,
              signup-service.js (OTP), mailer.js, firebase-admin.js
  utils/
```

Every read and write goes through `services/store.js`, so replacing the JSON
file with Postgres is a one-file change.
