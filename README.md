# iMile MCP Server

MCP (Model Context Protocol) server for automating iMile delivery scheduling and address changes. Exposes iMile tracking, delivery scheduling, and address change tools via SSE transport.

**Live instance:** `https://imile.shopinzo.bond/sse`

## Tools

| Tool | Description |
|------|-------------|
| `get_order_info` | Get order tracking details, delivery status, address, and available actions |
| `schedule_delivery` | Schedule or reschedule a delivery for a specific date (YYYY-MM-DD) |
| `send_address_change_otp` | Send OTP to consignee's phone for address change authorization |
| `change_address` | Change delivery address (requires valid OTP from `send_address_change_otp`) |

## Quick Start

### Using as MCP (Claude Desktop / Cursor)

Add to your MCP client config:

```json
{
  "mcpServers": {
    "imile": {
      "url": "https://imile.shopinzo.bond/sse"
    }
  }
}
```

### Self-Hosting

#### 1. Clone & Install

```bash
git clone https://github.com/hamoza33/imile_schedule.git
cd imile_schedule
npm install
```

#### 2. Run Locally

```bash
npm run dev
# Server starts at http://localhost:8080/sse
```

#### 3. Deploy to Fly.io

```bash
# Install flyctl: https://fly.io/docs/flyctl/install/
fly launch --no-deploy
fly deploy
```

The SSE endpoint will be available at `https://<your-app>.fly.dev/sse`.

### Docker

```bash
docker build -t imile-mcp .
docker run -p 8080:8080 imile-mcp
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |
| `IMILE_MCP_API_KEY` | Optional API key to protect the SSE endpoint | _(none)_ |

## Health Check

```
GET /health
```

Returns `{ "status": "ok", "service": "imile-mcp" }`.

## Tech Stack

- TypeScript + Node.js
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) (SSE transport)
- Express
- esbuild (bundler)
