import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { InfraiError, InfraiPhone } from "./infrai_phone.js";
import { otpRequest, otpVerification, projectShipment, shipmentEvent, type ShipmentEvent } from "./shipment_ledger.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const infrai = new InfraiPhone(apiKey);
const shipments = new Map<string, ShipmentEvent[]>();

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function route(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "POST" && url.pathname === "/login/code") {
    const input = otpRequest.parse(await body(request));
    const delivery = await infrai.sendCode(
      { phone: input.phone },
      input.requestId,
    );
    return send(response, 202, { requestId: input.requestId, delivery });
  }

  if (request.method === "POST" && url.pathname === "/login/verify") {
    const input = otpVerification.parse(await body(request));
    const identity = await infrai.verifyCode(
      { phone: input.phone, code: input.code, login: true },
      input.requestId,
    );
    return send(response, 200, { identity });
  }

  const smsMatch = url.pathname.match(/^\/code-deliveries\/([^/]+)$/);
  if (request.method === "GET" && smsMatch) {
    return send(response, 200, { delivery: await infrai.deliveryState(smsMatch[1]) });
  }

  const shipmentMatch = url.pathname.match(/^\/shipments\/([^/]+)\/events$/);
  if (request.method === "POST" && shipmentMatch) {
    const event = shipmentEvent.parse(await body(request));
    const events = [...(shipments.get(shipmentMatch[1]) ?? []), event];
    const state = projectShipment(events);
    shipments.set(shipmentMatch[1], events);
    return send(response, 201, { eventId: randomUUID(), state });
  }

  send(response, 404, { error: "route_not_found" });
}

const server = createServer((request, response) => {
  route(request, response).catch((error: unknown) => {
    if (error instanceof ZodError) return send(response, 400, { error: "invalid_request", issues: error.issues });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return send(response, status, { error: error.code, detail: error.detail });
    }
    send(response, 500, { error: "internal_error" });
  });
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Logistics service listening on http://localhost:${port}`));
