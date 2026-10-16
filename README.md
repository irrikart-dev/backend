# IrriKart Backend

REST API for the IrriKart customer app and the admin/vendor dashboard.

Node 20 · Express 4 · Prisma 6 · PostgreSQL (Neon) · Firebase Auth · Razorpay · Shiprocket · Supabase Storage.

Full technical docs (architecture, schema, one page per module) live in [`../docs`](../docs/README.md).

## Run

```bash
npm install                  # also runs prisma generate
cp .env.example .env         # DB, Firebase Admin, Razorpay, Supabase, Shiprocket, MSG91
npx prisma migrate deploy    # apply migrations to DATABASE_URL / DIRECT_URL
npm run dev                  # http://localhost:4000/api/v1
```

- API reference: Swagger UI at `/docs`, raw spec at `/openapi.json`.
- First admin: sign in to the dashboard once, then `npm run promote-admin`.

## Layout

```
api/index.js          Vercel serverless entry (exports the Express app)
src/server.js         local entry (app.listen)
src/app.js            middleware + every module router under /api/v1/<module>
src/config/           env (only place that reads process.env), prisma, firebase, supabase, openapi
src/common/           auth / validate / upload / error middleware, AppError, logger
src/storage/          Storage abstraction (Supabase)
src/modules/<name>/   routes → controller → service → repository (+ validation, providers)
prisma/               schema.prisma + migrations
scripts/              self-checks and one-off maintenance scripts
```

## Checks

| Script | Needs | Notes |
|---|---|---|
| `node scripts/check-order-flows.js` | Postgres | Runs in CI against a throwaway database |
| `node scripts/check-catalog-api.js` | running server + DB | Public catalogue contract |
| `node scripts/check-admin-analytics.js` | nothing | Coupon analytics + vendor performance maths |
| `node scripts/check-rfq.js` | nothing | RFQ validation and service rules |

## Money

Whole rupees everywhere; converted to paise only at the Razorpay boundary (`payments.service.js`).
