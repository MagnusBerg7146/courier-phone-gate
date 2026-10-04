import assert from "node:assert/strict";
import test from "node:test";
import { projectShipment, type ShipmentEvent } from "../src/shipment_ledger.js";

test("a successful proof event clears an earlier delivery exception", () => {
  const events: ShipmentEvent[] = [
    { type: "picked_up", occurredAt: "2026-09-30T08:00:00.000Z" },
    {
      type: "delivery_exception",
      occurredAt: "2026-09-30T12:00:00.000Z",
      reason: "recipient_absent",
    },
    {
      type: "delivered",
      occurredAt: "2026-09-30T15:00:00.000Z",
      proof: {
        objectKey: "shipments/SHP-1042/signature.pdf",
        contentType: "application/pdf",
        sha256: "a".repeat(64),
      },
    },
  ];

  assert.equal(projectShipment(events), "delivered");
});
