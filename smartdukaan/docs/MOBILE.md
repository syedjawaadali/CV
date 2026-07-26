# Cross-platform (Android & iOS) with Capacitor

The web app in `apps/web` is packaged into native **Android** and **iOS** apps
using [Capacitor](https://capacitorjs.com). One React codebase → web + Android +
iOS. The native projects live in `apps/web/android` and `apps/web/ios`.

- App ID: `pk.smartdukaan.app`
- App name: **Smart Dukaan**
- Config: `apps/web/capacitor.config.ts`

## Important: the native app needs a deployed API

On the web, the browser calls the API on the same origin (`/api`) and the Vite
dev server proxies it. Inside a packaged native app the webview runs from a
local origin, so there is **no** dev proxy and **no** same-origin backend. The
app must be pointed at an absolute, deployed API:

```bash
# Build the web assets with the API origin baked in:
cd apps/web
VITE_API_BASE_URL="https://api.your-domain.pk" npm run build
npx cap sync
```

`src/lib/api.ts` reads `VITE_API_BASE_URL` and prefixes every request with it
(empty → same-origin, which is correct for the web build). The backend must also
allow the app origin via `CORS_ORIGIN` and, because auth uses an httpOnly
refresh cookie, be reachable over HTTPS.

> The debug APK produced without `VITE_API_BASE_URL` loads and renders fully but
> cannot log in until it has a reachable backend — that's expected.

## Build the Android app

Prerequisites: JDK 17+ and the Android SDK (platform 34, build-tools 34,
platform-tools). Point `ANDROID_HOME` at your SDK (or set `sdk.dir` in
`apps/web/android/local.properties`).

```bash
cd apps/web
npm run build          # produce dist/
npx cap sync android   # copy web assets + native deps into android/
cd android
./gradlew :app:assembleDebug     # debug APK
# ./gradlew :app:assembleRelease # release (configure signing first)
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`. A debug APK is
signed with the debug keystore and installs directly on a device (enable
"install from unknown sources"). For the Play Store, build a signed **release**
`.aab` (`bundleRelease`) with your own keystore.

## Build the iOS app (requires macOS)

iOS binaries can only be produced on macOS with Xcode + CocoaPods — not in a
Linux CI/container. The project is scaffolded and ready:

```bash
cd apps/web
npm run build
npx cap sync ios
npx cap open ios       # opens ios/App/App.xcworkspace in Xcode
```
Then set a signing team in Xcode and run/archive to a device or the App Store.

## Day-to-day workflow

After any web change: `npm run build && npx cap sync`, then rebuild/run the
native app. Use `npx cap open android` / `npx cap open ios` to open the native
IDEs.

## Alternative: install as a PWA

If you don't need app-store distribution, the web app can also be served over
HTTPS and installed to the home screen (Android "Install app" / iOS "Add to Home
Screen"). Adding a web manifest + service worker is a small follow-up if you
want that path too.
