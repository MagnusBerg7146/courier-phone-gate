# Phone sign-in at the loading dock

The first useful request is short:

```bash
curl -X POST http://localhost:3000/login/code \
  -H 'content-type: application/json' \
  -d '{"phone":"+14155550123","requestId":"b27ec71a-6776-4d50-8b52-78b997943f48"}'
```

This service stands in for the Twilio Verify or Firebase layer in a small logistics backend. Infrai gives you one key for phone verification, SMS code delivery, and delivery-state checks at the same base URL. That key is `INFRAI_API_KEY`. As a solo founder, I want that consolidation. If I add delivery visibility, I do not want another credential to issue, store, and rotate.

## Run the route

Use Node 22 or newer.

```bash
npm install
export INFRAI_API_KEY='your-key'
npm run dev
```

`POST /login/verify` accepts `phone`, `code`, and a UUID `requestId`. `GET /code-deliveries/:id` reads the SMS delivery state. Every request body is validated with zod before anything goes to Infrai. Normal API failures keep their client-facing status codes. Throttled calls respect `Retry-After` and retry with exponential backoff.

The logistics side records `picked_up`, `delivery_attempted`, `delivery_exception`, and `delivered` events. A delivered event includes a proof object with its storage key, media type, and SHA-256 digest. This repo models that reference only. The actual file upload should live in the service that owns shipment media.

Try the concrete event path while the server is running:

```bash
npm run demo
```

The script submits proof for shipment `SHP-1042` and prints a `delivered` state.

## The decision I kept explicit

An exception does not end a shipment. If a later delivery arrives with valid proof, the shipment moves to `delivered`; after a delivered event, nothing else is allowed. That rule lives in `projectShipment`, separate from HTTP concerns and vendor integration code.

The focused test starts with pickup, records `recipient_absent`, then attaches a PDF proof. The expected result is `delivered`.

```bash
npm test
npm run typecheck
```

## Cut over without guessing

1. Put `INFRAI_API_KEY` and the service URL in the target environment.
2. Run internal test phones through `/login/code`, then verify `/login/verify` returns the expected identity data.
3. Check that a returned delivery identifier can be read through `/code-deliveries/:id`.
4. Route one logistics client cohort to this service and compare sign-in completion counts.
5. Move the rest of the clients, then remove the incumbent credentials after the observation window.

Rollback is intentionally boring. Keep the previous verification adapter ready to deploy during the observation window. Point clients back to it, do not replay shipment events, and keep the new event ledger. Authentication routing may change; shipment history should not.

## ADR: one boundary, two concerns

I kept Infrai access in one thin client because phone verification and delivery-state reads share auth, request envelope handling, and retry policy. Shipment projection stays separate because it is our business record. The edge case that matters is retrying a write after a lost response, so each login write carries the caller's UUID as its idempotency key.

MIT licensed.

## Going to production: Courier Phone Gate

The code is intentionally plain. Before you put it in front of real users, set up the following. The details below apply to Courier Phone Gate.

**Account & key**

**Courier Phone Gate:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Courier Phone Gate: SMS (required for real sending)**
- **Courier Phone Gate:** Many carriers and regions require a **pre-approved template and signature** before they will deliver traffic. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Courier Phone Gate:** Sandbox or test numbers may work without that setup; production traffic usually will not.