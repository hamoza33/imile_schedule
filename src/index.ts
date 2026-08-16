import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { z } from "zod";
import {
  getOrderInfo,
  scheduleDelivery,
  sendAddressChangeOtp,
  verifyOtpAndChangeAddress,
  checkScheduleAvailability,
} from "./imile-api.js";

const API_KEY = process.env.IMILE_MCP_API_KEY || "";
// The REST surface can be locked down independently of `/sse` so an existing
// MCP client keeps working unchanged while automated HTTP callers are
// required to authenticate. Falls back to the MCP key when unset.
const REST_API_KEY = process.env.IMILE_REST_API_KEY || API_KEY;

function createServer(): McpServer {
  const server = new McpServer({
    name: "imile-mcp",
    version: "1.0.0",
  });

  server.tool(
    "get_order_info",
    "Get order tracking details, delivery status, address, and available actions for an iMile order",
    {
      tracking_number: z.string().describe("The iMile tracking/order number"),
    },
    async ({ tracking_number }) => {
      try {
        const info = await getOrderInfo(tracking_number);
        const order = info.orderBaseInfoVO;
        const tracks = info.trackDetailVoList.slice(0, 5);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  orderNumber: order.orderNumber,
                  client: order.clientName,
                  status: tracks[0]?.stageDesc || "Unknown",
                  lastUpdate: tracks[0]?.content || "No updates",
                  lastUpdateTime: tracks[0]?.time || "Unknown",
                  address: `${order.detailAddress}, ${order.city}`,
                  country: order.country,
                  amount: `${order.collectingMoney} ${order.currency}`,
                  items: `${order.sku} (qty: ${order.skuQty})`,
                  consigneePhone: order.consigneePhone,
                  allowSchedule: info.allowSchedule,
                  allowChangeAddress: info.allowChangeLocation,
                  lastScheduleTime: info.lastScheduleTime,
                  recentTracking: tracks.map((t) => ({
                    stage: t.stageDesc,
                    time: t.time,
                    detail: t.content,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "schedule_delivery",
    "Schedule or reschedule an iMile delivery for a specific date. The date should be in YYYY-MM-DD format.",
    {
      tracking_number: z.string().describe("The iMile tracking/order number"),
      date: z
        .string()
        .describe("The desired delivery date in YYYY-MM-DD format (e.g., 2026-05-21)"),
    },
    async ({ tracking_number, date }) => {
      try {
        const result = await scheduleDelivery(tracking_number, date);

        if (result.allowSchedule && result.dateIsRang) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    message: `Delivery for order ${tracking_number} successfully scheduled for ${date}`,
                    isGreaterOfd: result.isGreaterOfd,
                    warning: result.isGreaterOfd
                      ? "Note: The order is already out for delivery, scheduling may not take effect."
                      : null,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } else if (result.allowSchedule && !result.dateIsRang) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: false,
                    message: `The requested date ${date} is not available for scheduling.`,
                    suggestedDate: result.adviceDate,
                    availableDates: result.dateList,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: false,
                    message: `Scheduling is not allowed for order ${tracking_number} at this time.`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "send_address_change_otp",
    "Send an OTP verification code to the consignee's phone for address change authorization. Must be called before change_address.",
    {
      tracking_number: z.string().describe("The iMile tracking/order number"),
    },
    async ({ tracking_number }) => {
      try {
        const result = await sendAddressChangeOtp(tracking_number);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: result.sent,
                  message: `OTP sent to phone number ${result.phone}. Ask the consignee for the 4-digit code, then use the change_address tool with the OTP.`,
                  phone: result.phone,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "change_address",
    "Change the delivery address for an iMile order. Requires a valid OTP from send_address_change_otp.",
    {
      tracking_number: z.string().describe("The iMile tracking/order number"),
      otp: z.string().describe("The 4-digit OTP code sent to the consignee's phone"),
      new_address: z.string().describe("The new delivery address (street/building details)"),
      city: z.string().describe("The city for the new address"),
      area: z.string().optional().describe("The area/district for the new address"),
      province: z.string().optional().describe("The province/region for the new address"),
      country: z
        .string()
        .optional()
        .describe("The country code (e.g., KSA, UAE). Defaults to the order's current country."),
    },
    async ({ tracking_number, otp, new_address, city, area, province, country }) => {
      try {
        const result = await verifyOtpAndChangeAddress(
          tracking_number,
          otp,
          new_address,
          city,
          area,
          province,
          country
        );

        const newOrder = result.orderBaseInfoVO;
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  message: `Address changed successfully for order ${tracking_number}`,
                  newAddress: `${newOrder.detailAddress}, ${newOrder.city}`,
                  country: newOrder.country,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "imile-mcp" });
});

/**
 * REST API — a plain HTTP surface over the same iMile operations the MCP
 * tools expose, for server-to-server callers (e.g. the COD dashboard's
 * automation engine) that can't speak MCP over SSE.
 *
 * Auth: when `IMILE_REST_API_KEY` (or, failing that, `IMILE_MCP_API_KEY`) is
 * set, the key must be supplied via the `x-api-key` header or an `api_key`
 * query param.
 */
const restAuth: express.RequestHandler = (req, res, next) => {
  if (!REST_API_KEY) return next();
  const provided =
    (req.header("x-api-key") as string | undefined) ||
    (req.query.api_key as string | undefined);
  if (provided !== REST_API_KEY) {
    res.status(401).json({ success: false, error: "Invalid or missing API key" });
    return;
  }
  next();
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Order lookup: tracking status, address, and whether scheduling is allowed. */
app.get("/api/order/:trackingNumber", restAuth, async (req, res) => {
  try {
    const info = await getOrderInfo(String(req.params.trackingNumber));
    const order = info.orderBaseInfoVO;
    const tracks = info.trackDetailVoList.slice(0, 5);
    res.json({
      success: true,
      orderNumber: order.orderNumber,
      client: order.clientName,
      status: tracks[0]?.stageDesc || "Unknown",
      lastUpdate: tracks[0]?.content || "No updates",
      lastUpdateTime: tracks[0]?.time || null,
      address: `${order.detailAddress}, ${order.city}`,
      country: order.country,
      amount: `${order.collectingMoney} ${order.currency}`,
      consigneePhone: order.consigneePhone,
      allowSchedule: info.allowSchedule,
      notAllowScheduleDetail: info.notAllowScheduleDetail,
      allowChangeAddress: info.allowChangeLocation,
      lastScheduleTime: info.lastScheduleTime,
      recentTracking: tracks.map((t) => ({
        stage: t.stageDesc,
        time: t.time,
        detail: t.content,
      })),
    });
  } catch (error) {
    res.status(502).json({ success: false, error: errorMessage(error) });
  }
});

/**
 * Schedule / reschedule a delivery.
 *
 * Body: `{ tracking_number, date: "YYYY-MM-DD", fallback_to_suggested?: boolean }`
 *
 * When the requested date is outside iMile's allowed range and
 * `fallback_to_suggested` is true (the default), the call is retried once
 * with iMile's own suggested date so an unattended caller still gets the
 * parcel rescheduled. `scheduledDate` in the response is always the date
 * that actually took effect.
 */
app.post("/api/schedule", restAuth, express.json(), async (req, res) => {
  const body = req.body as {
    tracking_number?: string;
    date?: string;
    fallback_to_suggested?: boolean;
  };
  const trackingNumber = body?.tracking_number?.trim();
  const date = body?.date?.trim();
  const fallback = body?.fallback_to_suggested !== false;

  if (!trackingNumber) {
    res.status(400).json({ success: false, error: "tracking_number is required" });
    return;
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ success: false, error: "date is required in YYYY-MM-DD format" });
    return;
  }

  try {
    const result = await scheduleDelivery(trackingNumber, date);

    if (result.allowSchedule && result.dateIsRang) {
      res.json({
        success: true,
        trackingNumber,
        scheduledDate: date,
        requestedDate: date,
        usedSuggestedDate: false,
        isGreaterOfd: result.isGreaterOfd,
        warning: result.isGreaterOfd
          ? "Order is already out for delivery — the reschedule may not take effect."
          : null,
        message: `Delivery for order ${trackingNumber} scheduled for ${date}`,
      });
      return;
    }

    if (result.allowSchedule && !result.dateIsRang) {
      const suggested = result.adviceDate || result.dateList?.[0] || null;
      if (fallback && suggested) {
        const retry = await scheduleDelivery(trackingNumber, suggested);
        if (retry.allowSchedule && retry.dateIsRang) {
          res.json({
            success: true,
            trackingNumber,
            scheduledDate: suggested,
            requestedDate: date,
            usedSuggestedDate: true,
            isGreaterOfd: retry.isGreaterOfd,
            warning: `Requested date ${date} was unavailable — used iMile's suggested date ${suggested} instead.`,
            message: `Delivery for order ${trackingNumber} scheduled for ${suggested}`,
          });
          return;
        }
      }
      res.status(409).json({
        success: false,
        trackingNumber,
        requestedDate: date,
        error: `The requested date ${date} is not available for scheduling.`,
        suggestedDate: suggested,
        availableDates: result.dateList ?? [],
      });
      return;
    }

    res.status(409).json({
      success: false,
      trackingNumber,
      requestedDate: date,
      error: `Scheduling is not allowed for order ${trackingNumber} at this time.`,
    });
  } catch (error) {
    // `scheduleDelivery` throws when iMile itself refuses (order closed,
    // already returned, …). That is a business outcome, not a gateway
    // failure, so surface it as 409 to keep 502 meaningful for real
    // transport/API errors.
    const message = errorMessage(error);
    const refused = message.includes("Scheduling not allowed");
    res.status(refused ? 409 : 502).json({
      success: false,
      trackingNumber,
      requestedDate: date,
      error: message,
    });
  }
});

const transports: Record<string, SSEServerTransport> = {};

app.get("/sse", async (req, res) => {
  const apiKey = req.query.api_key as string | undefined;
  if (API_KEY && apiKey !== API_KEY) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;

  res.on("close", () => {
    delete transports[transport.sessionId];
  });

  const server = createServer();
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports[sessionId];
  if (!transport) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  await transport.handlePostMessage(req, res);
});

const PORT = parseInt(process.env.PORT || "8080", 10);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`iMile MCP server listening on port ${PORT}`);
  console.log(`SSE endpoint: http://0.0.0.0:${PORT}/sse`);
  console.log(`Health check: http://0.0.0.0:${PORT}/health`);
});
