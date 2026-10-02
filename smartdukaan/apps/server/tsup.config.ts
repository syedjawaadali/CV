import { defineConfig } from 'tsup';

/**
 * Production build. Two entrypoints:
 *  - server.js  — the HTTP API
 *  - migrate.js — the forward-only migration runner (run on deploy)
 *
 * `@smartdukaan/shared` is a workspace package published only as TypeScript
 * source, so it MUST be bundled in (noExternal) — otherwise `node dist/server.js`
 * would try to import raw .ts at runtime and crash. Real npm deps (zod, pg, …)
 * stay external and are provided by node_modules in the deploy image.
 */
export default defineConfig({
  entry: { server: 'src/server.ts', migrate: 'src/db/migrate.ts' },
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: true,
  noExternal: ['@smartdukaan/shared'],
});
