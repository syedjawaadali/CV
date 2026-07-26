# Smart Dukaan API — production image.
# Build context is the repo root (the monorepo). Produces a small runtime image
# that runs migrations then starts the API.

# ---- build stage: install workspaces and compile the server ----
FROM node:22-slim AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build -w @smartdukaan/server

# ---- runtime stage: only the server's production deps + compiled output ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Install ONLY the server's production dependencies. `@smartdukaan/shared` is
# bundled into the compiled output, so the workspace link is not needed at runtime.
COPY apps/server/package.json ./package.json
RUN node -e "const fs=require('fs');const p=require('./package.json');if(p.dependencies)delete p.dependencies['@smartdukaan/shared'];delete p.devDependencies;delete p.scripts;fs.writeFileSync('./package.json',JSON.stringify(p,null,2))" \
 && npm install --omit=dev --no-audit --no-fund

# Compiled server + migrate + the .sql migrations (copied into dist by the build).
COPY --from=build /app/apps/server/dist ./dist

EXPOSE 4000
# Apply migrations (idempotent), then start the API.
CMD ["sh", "-c", "node dist/migrate.js && node dist/server.js"]
