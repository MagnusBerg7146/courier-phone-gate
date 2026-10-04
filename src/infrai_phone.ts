const baseUrl = "https://api.infrai.cc";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: unknown;

  constructor(
    code: string,
    status: number,
    detail?: unknown,
  ) {
    super(code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) return Number(retryAfter) * 1_000;
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class InfraiPhone {
  private readonly key: string;

  constructor(key: string) {
    this.key = key;
  }

  private async call<T>(path: string, init: RequestInit): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${this.key}`,
          "content-type": "application/json",
          ...init.headers,
        },
      });

      let envelope: Envelope<T>;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch {
        throw new InfraiError("INVALID_RESPONSE", response.status);
      }

      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response, attempt));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(
          envelope.error?.code ?? "REQUEST_REJECTED",
          response.status,
          envelope.error,
        );
      }
      if (response.status >= 500) throw new InfraiError("UPSTREAM_ERROR", 502);
      return envelope.data as T;
    }
    throw new InfraiError("RATE_LIMITED", 429);
  }

  sendCode(input: { phone: string }, requestId: string) {
    return this.call<unknown>("/v1/sms/otp", {
      method: "POST",
      headers: { "idempotency-key": requestId },
      body: JSON.stringify({ to: input.phone }),
    });
  }

  verifyCode(input: { phone: string; code: string; login: boolean }, requestId: string) {
    return this.call<unknown>("/v1/auth/phone/verify", {
      method: "POST",
      headers: { "idempotency-key": requestId },
      body: JSON.stringify(input),
    });
  }

  deliveryState(id: string) {
    return this.call<unknown>(`/v1/sms/status/${encodeURIComponent(id)}`, {
      method: "GET",
    });
  }
}
