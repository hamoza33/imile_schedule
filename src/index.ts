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
