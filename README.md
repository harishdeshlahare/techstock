# TechStock

Stock search and chart data use Yahoo Finance. During development, browser requests go through the Vite proxy at `/api/yahoo` to avoid Yahoo's browser CORS restriction.

## Android/APK market-data setup

The Vite development proxy is not included in a static build or APK. An APK therefore needs an internet-accessible HTTPS server that forwards `/api/yahoo/*` to `https://query1.finance.yahoo.com/*`, preserving the path and query string. In the app, open **Preferences**, enter your proxy server URL (for example `https://your-server.com`), save it, and use **Test market-data connection**. The app adds `/api/yahoo` to requests automatically; a URL ending in `/api/yahoo` is also accepted. The setting is stored on the device. Do not enter the Yahoo Finance URL directly; the app expects a separate proxy server.

For a fixed proxy URL at build time, set `VITE_YAHOO_API_BASE_URL` to the complete proxy URL before running `npm run build`. A configured endpoint must be served over HTTPS outside localhost. Yahoo may still rate-limit or deny requests independently of the app.

## Build and install the Android APK

Capacitor is configured for Android. To refresh the Android project after changing the web app, run `npm run android:sync`, then run `npm run android:open` to open it in Android Studio. In Android Studio, wait for Gradle sync, then choose **Build > Build Bundle(s) / APK(s) > Build APK(s)**. The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

To install it, copy `app-debug.apk` to the phone and open the file, allowing Android to install apps from that source if prompted. Alternatively, connect a phone with USB debugging enabled and run `adb install -r android/app/build/outputs/apk/debug/app-debug.apk` from the project folder. This debug APK is for testing; use Android Studio's signed APK flow for a distributable release.

The APK contains the frontend only. Vite's development proxy and the local paper-trading server are not included. Configure an internet-accessible HTTPS Yahoo proxy in Preferences for chart/search data. Paper trading also needs a reachable backend URL; never point the phone at `localhost` (that refers to the phone itself), and do not expose the current unauthenticated backend publicly.

The interface includes responsive controls, touch-sized mobile actions, safe-area padding, and Dark, Light, and Ocean themes. Theme preference is stored on the device.

The app opens with a demo login screen. Demo credentials are `hd` / `hd`. This client-side check is only a UI gate; it does not protect data or replace server-side authentication.

The chart includes EMA 9/21, intraday session VWAP, pivot-based support/resistance levels, exchange-timezone labels, closed-candle signals, and higher-timeframe context. Directional component scores are heuristics, not win probabilities. The illustrative calculator uses structural stop/target levels with an ATR fallback, and supports capital- or risk-based share sizing plus user-entered brokerage and slippage assumptions; it does not estimate taxes.

Save a calculator scenario to the Stock history tab to keep its entry zone, stop, two targets, direction, and timeframe in this browser. Trades remain pending until a later candle touches the entry zone, then track T1, T2, and the stop on subsequent chart loads. Older scenarios outside the available candle range are marked unchecked/expired. If one candle touches the stop and a target, the order is unknown. A candle-level hit time is not an exact intrabar execution time. The chart also shows an explicitly limited backtest on the currently loaded data.

The per-stock Trade report summarizes saved outcomes, P&L, R multiples, holding time, and drawdown, with CSV and print exports. Open, pending, expired, and ambiguous scenarios are kept separate from closed-trade performance statistics; historical results are not predictions.

The Intraday ideas tab scans a curated liquid-stock universe with Yahoo daily candles for average share volume, relative volume from completed candles, ATR%, directional RSI/trend, and proximity to support/resistance. The scan is a shortlist only: volume is not time-of-day adjusted, so confirm candidates on the intraday chart before acting. Exchange open/closed status uses local session hours and weekdays; it does not include exchange holidays.

Add a searched result to the Intraday ideas list with the `+ Intraday list` action; custom symbols persist in this browser and can be removed from the scanner tab. The Index options tab links to the official NSE chains for NIFTY 50/NIFTY BANK and BSE chain for SENSEX. Exchange pages are opened externally; this app does not claim to provide a live options feed.

## Development

Run `npm run dev` and open the local Vite URL. Keep the dev server running while using Yahoo search and charts. Yahoo may throttle or deny requests independently; the proxy cannot override those restrictions.

## Deployment

The Vercel deployment includes a same-origin `/api/yahoo/*` serverless proxy for Yahoo search and chart requests. Deploy the repository root so Vercel detects the `api/yahoo/[...path].js` function alongside the Vite frontend. Other static hosts must configure an equivalent reverse proxy to `https://query1.finance.yahoo.com`, preserving the path and query string; a static build alone does not include a proxy.

## Commands

- `npm run dev` — start local development server with Yahoo proxy
- `npm run build` — build static production assets
- `npm test` — run the Vitest unit tests
- `npm run preview` — preview the build (also uses Vite's configured proxy)
