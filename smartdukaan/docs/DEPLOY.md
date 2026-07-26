# Deploying the Smart Dukaan API

The API is a stateless Node service that needs a PostgreSQL database. It reads
everything from environment variables and runs migrations on start, so it drops
onto any container/Node host. Two supported paths:

## Required environment variables

| Var | Required | Notes |
|-----|----------|-------|
| `DATABASE_URL` | ✅ | Postgres connection string (managed PG, Supabase, Neon, …). |
| `JWT_SECRET` | ✅ | Long random string (≥ 32 chars). Never commit it. |
| `NODE_ENV` | ✅ | `production` (enables secure cookies, fail-fast on DB). |
| `CORS_ORIGIN` | ✅ | Comma-separated allowed origins (web domain + native origins). |
| `PORT` | – | Defaults to 4000; most hosts inject their own. |

For the mobile apps, include the Capacitor origins in `CORS_ORIGIN`:
`https://localhost` (Android) and `capacitor://localhost` (iOS).

## Option A — Render blueprint (easiest, includes a free Postgres)

1. Push this repo to GitHub (a repo whose root — or configured Root Directory —
   is this project).
2. Go to https://dashboard.render.com/blueprints → **New Blueprint** → pick the
   repo. Render reads [`render.yaml`](../render.yaml): it provisions Postgres,
   wires `DATABASE_URL`, and generates `JWT_SECRET`.
3. Deploy. The service runs `node apps/server/dist/migrate.js` then
   `node apps/server/dist/server.js`; health check is `/health`.
4. Copy the service URL (e.g. `https://smartdukaan-api.onrender.com`).

## Option B — Docker (Railway, Fly.io, a VPS, anywhere)

A production [`Dockerfile`](../Dockerfile) is included (build context = repo root).

```bash
docker build -t smartdukaan-api .
docker run -p 4000:4000 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://…" \
  -e JWT_SECRET="$(openssl rand -base64 48)" \
  -e CORS_ORIGIN="https://app.your-domain.pk,https://localhost,capacitor://localhost" \
  smartdukaan-api
```

The container applies migrations on startup, then serves on `:4000`.
`/health` is a ready-made health-check endpoint.

## After the API is live

Point the apps at it:

- **Mobile (Capacitor):** rebuild with the API baked in, then re-sync/rebuild:
  ```bash
  cd apps/web
  VITE_API_BASE_URL="https://smartdukaan-api.onrender.com" npm run build
  npx cap sync android && (cd android && ./gradlew :app:assembleDebug)
  ```
- **Web:** host the static `apps/web/dist` (build with the same
  `VITE_API_BASE_URL`, or serve it behind the same origin as the API).

Optionally seed demo data once against the deployed DB:
`DATABASE_URL="…" npm run seed -w @smartdukaan/server`.
