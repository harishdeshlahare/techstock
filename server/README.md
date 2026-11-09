# Techstock backend

This Express service is the backend boundary for market data, price alerts, and simulated paper trading. Provider credentials and service settings belong in environment variables, not browser code.

## Provider model

The app is designed around a swappable provider interface:

- `BaseProvider` defines the shared methods.
- `createProvider()` chooses the active data source from `DATA_PROVIDER`.
- `YahooProvider` is the default implementation for now.

A broker-backed source such as Upstox, Angel One SmartAPI, Dhan, Fyers or Kite Connect can be added later without changing the HTTP routes.

## Option-chain data

`GET /api/option-chain/:symbol` requests the nearest expiry available from Yahoo, including normalized call and put rows. Pass `?expiry=<unix-seconds>` to request a specific expiry from the provider. Availability, freshness, and contract coverage depend on Yahoo and the symbol; Yahoo can reject option requests (for example, with an `Invalid Crumb` response), which the API reports as an upstream `502` instead of fabricating data. This is not an authorized NSE/BSE options feed and must not be treated as exchange-verified live data. The existing app UI continues to link to official exchange pages until an appropriate licensed provider is configured.

A production Indian option chain needs a broker or exchange API with the required permissions. Add that provider behind the existing provider interface and set `DATA_PROVIDER` plus its credentials in the server environment.

## Price alerts

- `GET /api/alerts` — list alerts.
- `POST /api/alerts` — create a price alert with `symbol`, `value`, and `direction` (`above`, `below`, or `crosses`).
- `POST /api/alerts/evaluate` — fetch current quotes and return newly triggered alerts.
- `DELETE /api/alerts/:id` — delete an alert.

Only price alerts are supported. The evaluation route is intended to be polled by a trusted client; `crosses` requires two price samples. Notifications are returned in the API response; push/email/Telegram delivery is not implemented.

## Paper trading

- `GET /api/paper-trading/summary` — cash, positions, and simulated P&L.
- `GET /api/paper-trading/orders` — order history.
- `POST /api/paper-trading/orders` — simulate a market buy/sell using `symbol`, `side`, `quantity`, and `price`.
- `PUT /api/paper-trading/reset` — set `startingCash` and clear all positions and orders.

Paper trades do not reach a broker. The current store is in-memory and resets when the server restarts; it is for local development only. This API has no authentication or user isolation and must not be exposed publicly as-is.

## Environment variables

Copy `.env.example` to `.env` and fill in the values you need locally.
`PAPER_TRADING_STARTING_CASH` sets the initial simulated cash balance (default `100000`).

## Local start

npm install
npm start

Then test:

- http://localhost:4000/health
- http://localhost:4000/api/quote/AAPL
- http://localhost:4000/api/chart/AAPL?interval=1d&range=5d
- http://localhost:4000/api/option-chain/AAPL
- http://localhost:4000/api/alerts
- http://localhost:4000/api/paper-trading/summary
