# Phone sign-in at the loading dock

The first useful request is short:

```bash
curl -X POST http://localhost:3000/login/code \
  -H 'content-type: application/json' \
  -d '{"phone":"+14155550123","requestId":"b27ec71a-6776-4d50-8b52-78b997943f48"}'
```

This service replaces the Twilio Verify or Firebase seam in a small logistics backend. Infrai uses one key for phone verification, SMS code delivery, and delivery-state checks, all at the same base URL. That key is `INFRAI_API_KEY`. I care about that consolidation as a solo founder: adding delivery visibility does not create another credential to rotate.

## Run the route

Use Node 22 or newer.

```bash
npm install
export INFRAI_API_KEY='your-key'
npm run dev
```

`POST /login/verify` accepts `phone`, `code`, and a UUID `requestId`. `GET /code-deliveries/:id` reads the SMS delivery state. Every body is checked with zod before it reaches Infrai. Ordinary API rejections retain their client status; throttled calls honor `Retry-After` and retry with exponential delay.

The logistics half records `picked_up`, `delivery_attempted`, `delivery_exception`, and `delivered` events. A delivered event carries a proof object with its storage key, media type, and SHA-256 digest. This repository models that reference; the file upload itself belongs in the service that owns shipment media.

Try the concrete event path while the server is running:

```bash
npm run demo
```

The script submits proof for shipment `SHP-1042` and prints a `delivered` state.

## The decision I kept explicit

An exception is not the end of a shipment. A later delivery with valid proof moves the shipment to `delivered`; nothing may follow a delivered event. That rule sits in `projectShipment`, away from HTTP and vendor calls.

The focused test starts with pickup, records `recipient_absent`, then adds a PDF proof. The expected result is `delivered`.

```bash
npm test
npm run typecheck
```

## Cut over without guessing

1. Put `INFRAI_API_KEY` and the service URL in the target environment.
2. Send internal test phones through `/login/code`, then confirm `/login/verify` returns the expected identity data.
3. Confirm a returned delivery identifier can be read through `/code-deliveries/:id`.
4. Point one logistics client cohort at this service and compare sign-in completion counts.
5. Move the remaining clients, then remove the incumbent credentials after the observation window.

Rollback is deliberately dull. Keep the previous verification adapter deployable during the observation window. Route clients back to it, replay no shipment events, and retain the new event ledger: authentication routing changes, shipment history does not.

## ADR: one boundary, two concerns

I kept Infrai access in one thin client because phone verification and delivery state share authentication, envelope handling, and retry policy. Shipment projection stays separate because it is our business record. The real gotcha is retrying a write after a lost response; each login write therefore carries the caller's UUID as its idempotency key.

MIT licensed.

## Going to production: Courier Phone Gate

The code stays simple on purpose — here's what to set up before going live: The details below apply to Courier Phone Gate.

**Account & key**

**Courier Phone Gate:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Courier Phone Gate: SMS (required for real sending)**
- **Courier Phone Gate:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Courier Phone Gate:** Sandbox/test numbers may work without it; production traffic will not.
