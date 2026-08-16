# iMile MCP Server

MCP (Model Context Protocol) server for automating [iMile](https://www.imile.com/) delivery operations. It lets any MCP-compatible AI client (Claude Desktop, Cursor, Windsurf, etc.) track orders, schedule/reschedule deliveries, and change delivery addresses through iMile's public API.

**Live instance:** `https://imile.shopinzo.bond/sse`

---

## Table of Contents

- [What It Does](#what-it-does)
- [Tools Reference](#tools-reference)
- [Setup & Installation](#setup--installation)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [API Endpoints](#api-endpoints)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)

---

## What It Does

This server acts as a bridge between AI assistants and iMile's delivery system. It exposes four tools via the Model Context Protocol (MCP) that allow an AI to:

1. **Look up any iMile order** — get real-time tracking status, delivery address, COD amount, consignee phone, and recent tracking history.
2. **Schedule or reschedule deliveries** — pick a new delivery date; the server validates the date is within iMile's allowed range and warns if the order is already out for delivery.
3. **Send address-change OTP** — triggers an SMS verification code to the consignee's phone (required before changing the address).
4. **Change the delivery address** — verifies the OTP and submits a new address (street, city, area, province, country).

The server uses SSE (Server-Sent Events) transport so any MCP client can connect to it over HTTP.

---

## Tools Reference

### `get_order_info`

Look up full order details and tracking history.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tracking_number` | string | Yes | The iMile tracking/order number |

**Returns:**
```json
{
  "orderNumber": "IML12345678",
  "client": "Store Name",
  "status": "Out for Delivery",
  "lastUpdate": "Driver is on the way",
  "lastUpdateTime": "2026-06-02 14:30:00",
  "address": "123 Main St, Riyadh",
  "country": "KSA",
  "amount": "150.00 SAR",
  "items": "SKU-001 (qty: 2)",
  "consigneePhone": "+966*****1234",
  "allowSchedule": true,
  "allowChangeAddress": true,
  "lastScheduleTime": null,
  "recentTracking": [
    { "stage": "Out for Delivery", "time": "2026-06-02 14:30:00", "detail": "Driver is on the way" },
    { "stage": "In Transit", "time": "2026-06-01 08:00:00", "detail": "Arrived at destination hub" }
  ]
}
```

---

### `schedule_delivery`

Schedule or reschedule a delivery to a specific date.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tracking_number` | string | Yes | The iMile tracking/order number |
| `date` | string | Yes | Desired delivery date in `YYYY-MM-DD` format |

**Returns (success):**
```json
{
  "success": true,
  "message": "Delivery for order IML12345678 successfully scheduled for 2026-06-05",
  "isGreaterOfd": false,
  "warning": null
}
```

**Returns (date not available):**
```json
{
  "success": false,
  "message": "The requested date 2026-06-10 is not available for scheduling.",
  "suggestedDate": "2026-06-05",
  "availableDates": ["2026-06-03", "2026-06-04", "2026-06-05"]
}
```

---

### `send_address_change_otp`

Send a one-time password (OTP) to the consignee's phone to authorize an address change. **Must be called before `change_address`.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tracking_number` | string | Yes | The iMile tracking/order number |

**Returns:**
```json
{
  "success": true,
  "message": "OTP sent to phone number +966*****1234. Ask the consignee for the 4-digit code, then use the change_address tool with the OTP.",
  "phone": "+966*****1234"
}
```

---

### `change_address`

Change the delivery address after verifying the OTP.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tracking_number` | string | Yes | The iMile tracking/order number |
| `otp` | string | Yes | The 4-digit OTP code sent to the consignee |
| `new_address` | string | Yes | New street/building address |
| `city` | string | Yes | City name |
| `area` | string | No | Area/district |
| `province` | string | No | Province/region |
| `country` | string | No | Country code (e.g., `KSA`, `UAE`). Defaults to order's current country |

**Returns:**
```json
{
  "success": true,
  "message": "Address changed successfully for order IML12345678",
  "newAddress": "456 New St, Jeddah",
  "country": "KSA"
}
```

---

## Setup & Installation

### Prerequisites

- **Node.js** >= 20
- **npm** (comes with Node.js)

### 1. Clone the Repository

```bash
git clone https://github.com/hamoza33/imile_schedule.git
cd imile_schedule
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run in Development Mode

```bash
npm run dev
```

The server starts at `http://localhost:8080`. The SSE endpoint is at `http://localhost:8080/sse`.

### 4. Build for Production

```bash
npm run build
npm start
```

This compiles TypeScript to JavaScript using esbuild and runs the production bundle.

---

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `8080` |
| `IMILE_MCP_API_KEY` | Optional API key to protect the SSE endpoint. When set, clients must pass `?api_key=<key>` in the SSE URL | _(none — no auth)_ |
| `IMILE_REST_API_KEY` | Optional API key to protect the `/api` REST endpoints, independent of the SSE key | _(falls back to `IMILE_MCP_API_KEY`)_ |

Set variables via environment or a `.env` file:

```bash
export PORT=3000
export IMILE_MCP_API_KEY=my-secret-key
npm run dev
```

When `IMILE_MCP_API_KEY` is set, connect with:
```
https://your-server.com/sse?api_key=my-secret-key
```

---

## Deployment

### Option A: Fly.io

```bash
# 1. Install flyctl
curl -L https://fly.io/install.sh | sh

# 2. Login
fly auth login

# 3. Launch (first time only — creates the app)
fly launch --no-deploy

# 4. (Optional) Set an API key
fly secrets set IMILE_MCP_API_KEY=your-secret-key

# 5. Deploy
fly deploy
```

Your SSE endpoint will be at `https://<app-name>.fly.dev/sse`.

### Option B: Docker (any VPS)

```bash
# Build
docker build -t imile-mcp .

# Run
docker run -d \
  --name imile-mcp \
  -p 8080:8080 \
  -e IMILE_MCP_API_KEY=your-secret-key \
  imile-mcp
```

### Option C: Direct Node.js (any VPS)

```bash
git clone https://github.com/hamoza33/imile_schedule.git
cd imile_schedule
npm install
npm run build
PORT=8080 node dist/index.js
```

Use a process manager like `pm2` for production:

```bash
npm install -g pm2
pm2 start dist/index.js --name imile-mcp
pm2 save
pm2 startup
```

---

## Connecting Your MCP Client

### Claude Desktop / Cursor / Windsurf

Add to your MCP client config (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "imile": {
      "url": "https://imile.shopinzo.bond/sse"
    }
  }
}
```

For a self-hosted instance, replace the URL with your own:

```json
{
  "mcpServers": {
    "imile": {
      "url": "https://your-server.com/sse?api_key=your-secret-key"
    }
  }
}
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sse` | SSE endpoint for MCP clients. Accepts optional `?api_key=` query param |
| `POST` | `/messages?sessionId=<id>` | Message handler for active SSE sessions |
| `GET` | `/health` | Health check — returns `{ "status": "ok", "service": "imile-mcp" }` |
| `GET` | `/api/order/:trackingNumber` | REST order lookup (same data as `get_order_info`) |
| `POST` | `/api/schedule` | REST schedule/reschedule (same action as `schedule_delivery`) |

### REST API (for non-MCP callers)

MCP over SSE is awkward for plain server-to-server automation, so the same operations are also exposed as ordinary JSON endpoints under `/api`.

Auth: set `IMILE_REST_API_KEY` to protect these endpoints and pass the key as an `x-api-key` header (or `?api_key=`). It's a separate variable from `IMILE_MCP_API_KEY` so the REST surface can be locked down without changing `/sse` for existing MCP clients; when it isn't set, `IMILE_MCP_API_KEY` is used instead.

```bash
# Look up an order
curl -s https://imile.shopinzo.bond/api/order/601234567890 \
  -H "x-api-key: $IMILE_REST_API_KEY"

# Reschedule to a specific date
curl -s -X POST https://imile.shopinzo.bond/api/schedule \
  -H "x-api-key: $IMILE_REST_API_KEY" \
  -H 'content-type: application/json' \
  -d '{"tracking_number":"601234567890","date":"2026-06-05"}'
```

`POST /api/schedule` accepts `{ tracking_number, date, fallback_to_suggested? }`. If the requested date is outside iMile's allowed range, it retries once with iMile's own suggested date (disable with `"fallback_to_suggested": false`). `scheduledDate` in the response is always the date that actually took effect:

```json
{
  "success": true,
  "trackingNumber": "601234567890",
  "scheduledDate": "2026-06-05",
  "requestedDate": "2026-06-04",
  "usedSuggestedDate": true,
  "warning": "Requested date 2026-06-04 was unavailable — used iMile's suggested date 2026-06-05 instead."
}
```

Failure modes: `400` invalid input, `401` bad API key, `409` iMile refuses to schedule (includes `suggestedDate` + `availableDates`), `502` iMile API error.

---

## Project Structure

```
imile_schedule/
├── src/
│   ├── index.ts          # MCP server, Express app, SSE transport, tool definitions
│   └── imile-api.ts      # iMile API client (tracking, scheduling, OTP, address change)
├── dist/                  # Compiled output (generated by `npm run build`)
├── Dockerfile             # Multi-stage Node 22 Alpine build
├── fly.toml               # Fly.io deployment config
├── package.json
├── tsconfig.json
└── README.md
```

---

## Tech Stack

- **TypeScript** + **Node.js** (>= 20)
- **[@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk)** — MCP server with SSE transport
- **Express** — HTTP server
- **Zod** — Input validation for tool parameters
- **esbuild** — Fast TypeScript bundler
