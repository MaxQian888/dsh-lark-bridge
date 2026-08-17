import assert from "node:assert/strict";
import type { Context } from "@deepseek-ai/cordis";
import test from "node:test";
import { apply } from "../src/plugin.js";

test("plugin treats a non-array sender allowlist as unset", async () => {
  const messages: string[] = [];
  const context = {
    logger: () => ({
      info: (message: string) => messages.push(message),
    }),
  } as unknown as Context;

  await assert.doesNotReject(
    apply(context, {
      enabled: false,
      allowedSenderIds: {} as string[],
    }),
  );
  assert.deepEqual(messages, ["status=disabled"]);
});
