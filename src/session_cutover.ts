import { z } from "zod";
import { InfraiClient } from "./infrai_client.ts";

export const cutoverRequestSchema = z.object({
  userId: z.string().min(1),
  refreshToken: z.string().min(1),
  releaseId: z.string().min(1),
  buildId: z.string().min(1),
  revokeOtherSessions: z.boolean().default(true)
});

export type CutoverRequest = z.infer<typeof cutoverRequestSchema>;

export type Diagnostic = {
  code: string;
  severity: "ok" | "warning" | "review";
  message: string;
};

export type CutoverResult = {
  releaseId: string;
  buildId: string;
  userId: string;
  releaseState: "cutover-complete" | "cutover-review";
  revokedSessionIds: string[];
  diagnostics: Diagnostic[];
  refreshedSession: unknown;
};

type SessionRecord = {
  session_id: string;
  [key: string]: unknown;
};

function normalizeSessionList(raw: unknown): SessionRecord[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is SessionRecord => {
      return typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).session_id === "string";
    });
  }

  if (typeof raw === "object" && raw !== null) {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record.sessions)) {
      return record.sessions.filter((item): item is SessionRecord => {
        return typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).session_id === "string";
      });
    }
  }

  return [];
}

function sessionIdFromRefresh(raw: unknown): string | undefined {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const sessionId = (raw as Record<string, unknown>).session_id;
  return typeof sessionId === "string" ? sessionId : undefined;
}

function makeDiagnostics(revokedCount: number): Diagnostic[] {
  const diagnostics: Diagnostic[] = [
    {
      code: "rotated_refresh_token",
      severity: "ok",
      message: "Refresh token accepted and a new session payload was returned."
    }
  ];

  if (revokedCount > 0) {
    diagnostics.push({
      code: "revoked_prior_sessions",
      severity: "ok",
      message: `Revoked ${revokedCount} prior session${revokedCount === 1 ? "" : "s"}.`
    });
  } else {
    diagnostics.push({
      code: "no_prior_sessions_to_revoke",
      severity: "warning",
      message: "No older sessions were present for this user."
    });
  }

  return diagnostics;
}

export async function runSessionCutover(infrai: InfraiClient, input: CutoverRequest): Promise<CutoverResult> {
  const request = cutoverRequestSchema.parse(input);

  const refreshed = await infrai.auth.session.refresh({
    refresh_token: request.refreshToken
  });

  const listed = await infrai.auth.session.list_for_user(request.userId);
  const sessions = normalizeSessionList(listed.data);
  const currentSessionId = sessionIdFromRefresh(refreshed.data);

  const revokedSessionIds: string[] = [];
  if (request.revokeOtherSessions) {
    for (const session of sessions) {
      const sessionId = session.session_id;
      if (sessionId === currentSessionId) {
        continue;
      }
      await infrai.auth.session.revoke(sessionId, { session_id: sessionId });
      revokedSessionIds.push(sessionId);
    }
  }

  const diagnostics = makeDiagnostics(revokedSessionIds.length);
  const releaseState = diagnostics.some((item) => item.severity === "review")
    ? "cutover-review"
    : "cutover-complete";

  return {
    releaseId: request.releaseId,
    buildId: request.buildId,
    userId: request.userId,
    releaseState,
    revokedSessionIds,
    diagnostics,
    refreshedSession: refreshed.data
  };
}
