export {};

const origin = process.env.SERVICE_URL ?? "http://localhost:3000";
const shipmentId = "SHP-1042";

const response = await fetch(`${origin}/shipments/${shipmentId}/events`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    type: "delivered",
    occurredAt: new Date().toISOString(),
    proof: {
      objectKey: `shipments/${shipmentId}/doorstep.jpg`,
      contentType: "image/jpeg",
      sha256: "b".repeat(64),
    },
  }),
});

console.log(await response.json());
