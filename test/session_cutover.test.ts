import test from "node:test";
import assert from "node:assert/strict";
import { runSessionCutover } from "../src/session_cutover.ts";

test("revokes prior sessions and marks the release complete", async () => {
  const calls: Array<{ kind: string; sessionId?: string }> = [];

  const infrai = {
    auth: {
      session: {
        refresh: async ({ refresh_token }: { refresh_token: string }) => {
          calls.push({ kind: "refresh" });
          assert.equal(refresh_token, "rt-current");
          return {
            data: {
              session_id: "sess-current",
              refresh_token: "rt-next"
            }
          };
        },
        list_for_user: async (userId: string) => {
          calls.push({ kind: "list" });
          assert.equal(userId, "dev-123");
          return {
            data: [
              { session_id: "sess-current" },
              { session_id: "sess-old-1" }
            ]
          };
        },
        revoke: async (sessionId: string, body: { session_id: string }) => {
          calls.push({ kind: "revoke", sessionId });
          assert.equal(sessionId, "sess-old-1");
          assert.deepEqual(body, { session_id: "sess-old-1" });
          return { data: { revoked: true } };
        }
      }
    }
  };

  const result = await runSessionCutover(infrai as never, {
    userId: "dev-123",
    refreshToken: "rt-current",
    releaseId: "rel-9",
    buildId: "build-44",
    revokeOtherSessions: true
  });

  assert.equal(result.releaseState, "cutover-complete");
  assert.deepEqual(result.revokedSessionIds, ["sess-old-1"]);
  assert.equal(result.diagnostics[0].code, "rotated_refresh_token");
  assert.equal(result.diagnostics[1].code, "revoked_prior_sessions");
  assert.deepEqual(calls, [
    { kind: "refresh" },
    { kind: "list" },
    { kind: "revoke", sessionId: "sess-old-1" }
  ]);
});
