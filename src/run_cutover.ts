import { createInfraiFromEnv } from "./infrai_client.ts";
import { runSessionCutover } from "./session_cutover.ts";

async function main(): Promise<void> {
  const infrai = createInfraiFromEnv();

  const userId = process.env.CUTOVER_USER_ID;
  const refreshToken = process.env.CUTOVER_REFRESH_TOKEN;
  const releaseId = process.env.CUTOVER_RELEASE_ID ?? "release-2026-10-24";
  const buildId = process.env.CUTOVER_BUILD_ID ?? "build-2026-10-24";

  if (!userId || !refreshToken) {
    throw new Error("Set CUTOVER_USER_ID and CUTOVER_REFRESH_TOKEN before running the cutover command.");
  }

  const result = await runSessionCutover(infrai, {
    userId,
    refreshToken,
    releaseId,
    buildId,
    revokeOtherSessions: true
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
