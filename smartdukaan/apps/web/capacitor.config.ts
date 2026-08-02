import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor packages the built web app (dist/) into native Android and iOS
 * apps that share this one React codebase.
 *
 * The webview runs from a local origin, so the app must talk to a DEPLOYED API.
 * Set VITE_API_BASE_URL at web-build time (e.g. https://api.smartdukaan.pk) so
 * requests are absolute. For quick device testing against a machine on the LAN
 * you can instead set `server.url` below to that dev server.
 */
const config: CapacitorConfig = {
  appId: 'pk.smartdukaan.app',
  appName: 'Smart Dukaan',
  webDir: 'dist',
  backgroundColor: '#0f766e',
  android: {
    allowMixedContent: false,
  },
  // server: {
  //   // Point at a running web/dev deployment for on-device testing:
  //   url: 'https://app.smartdukaan.pk',
  //   cleartext: false,
  // },
};

export default config;
