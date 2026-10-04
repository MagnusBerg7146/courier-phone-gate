import { z } from "zod";

export const otpRequest = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  requestId: z.string().uuid(),
});

export const otpVerification = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  code: z.string().regex(/^\d{4,8}$/),
  requestId: z.string().uuid(),
});

const proof = z.object({
  objectKey: z.string().min(1),
  contentType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const shipmentEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("picked_up"), occurredAt: z.string().datetime() }),
  z.object({ type: z.literal("delivery_attempted"), occurredAt: z.string().datetime() }),
  z.object({
    type: z.literal("delivery_exception"),
    occurredAt: z.string().datetime(),
    reason: z.enum(["recipient_absent", "address_unclear", "damaged_parcel"]),
  }),
  z.object({ type: z.literal("delivered"), occurredAt: z.string().datetime(), proof }),
]);

export type ShipmentEvent = z.infer<typeof shipmentEvent>;
export type ShipmentState = "awaiting_pickup" | "in_transit" | "exception" | "delivered";

export function projectShipment(events: ShipmentEvent[]): ShipmentState {
  let state: ShipmentState = "awaiting_pickup";
  for (const event of events) {
    if (state === "delivered") throw new Error("A delivered shipment is final");
    if (event.type === "picked_up") state = "in_transit";
    if (event.type === "delivery_attempted") state = "in_transit";
    if (event.type === "delivery_exception") state = "exception";
    if (event.type === "delivered") state = "delivered";
  }
  return state;
}
