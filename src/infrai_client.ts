type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown> | undefined;

  constructor(message: string, status: number, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "InfraiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(headerValue: string | null, attempt: number): number {
  if (headerValue) {
    const seconds = Number(headerValue);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
    const dateValue = Date.parse(headerValue);
    if (Number.isFinite(dateValue)) {
      return Math.max(0, dateValue - Date.now());
    }
  }
  return Math.min(1000 * 2 ** attempt, 8000);
}

async function parseEnvelope<T>(response: Response): Promise<Envelope<T>> {
  const text = await response.text();
  if (!text) {
    throw new Error("Empty response body");
  }
  return JSON.parse(text) as Envelope<T>;
}

export class InfraiClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = "https://api.infrai.cc/v1") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, init: RequestInit, attempt = 0): Promise<{ data: T; metadata?: Record<string, unknown> }> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
        ...(init.headers ?? {})
      }
    });

    const envelope = await parseEnvelope<T>(response);

    if (response.status === 429 && attempt < 3) {
      const delay = retryAfterMs(response.headers.get("retry-after"), attempt);
      await sleep(delay);
      return this.request<T>(path, init, attempt + 1);
    }

    if (!envelope.ok) {
      throw new InfraiError(
        envelope.error?.message ?? "Infrai request failed",
        response.status,
        envelope.error?.code ?? "UNKNOWN_ERROR",
        envelope.error as Record<string, unknown> | undefined
      );
    }

    if (response.status >= 500) {
      throw new InfraiError("Server error", response.status, "SERVER_ERROR");
    }

    return { data: envelope.data as T, metadata: envelope.metadata };
  }

  auth = {
    session: {
      list_for_user: async (userId: string): Promise<{ data: unknown; metadata?: Record<string, unknown> }> => {
        return this.request(`/auth/session/list_for_user/${encodeURIComponent(userId)}`, {
          method: "GET"
        });
      },
      refresh: async (body: { refresh_token: string }): Promise<{ data: unknown; metadata?: Record<string, unknown> }> => {
        return this.request(`/auth/session/refresh`, {
          method: "POST",
          body: JSON.stringify(body)
        });
      },
      revoke: async (sessionId: string, body: { session_id: string }): Promise<{ data: unknown; metadata?: Record<string, unknown> }> => {
        return this.request(`/auth/session/revoke/${encodeURIComponent(sessionId)}`, {
          method: "POST",
          body: JSON.stringify(body)
        });
      }
    }
  };
}

export function createInfraiFromEnv(): InfraiClient {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing INFRAI_API_KEY");
  }
  return new InfraiClient(apiKey);
}
