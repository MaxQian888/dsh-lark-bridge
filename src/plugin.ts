import path from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-apiproxy";
import z from "@deepseek-ai/schemastery";
import { ApiProxyDshClient } from "./api-proxy-client.js";
import { runBridge } from "./bridge.js";
import { ConsumerSupervisor } from "./consumer-supervisor.js";
import {
  defaultAdmissionStatePath,
  EventAdmissionStore,
  JsonFileAdmissionAdapter,
} from "./event-admission.js";
import { LarkSdkTransport, resolveLarkCredentials } from "./lark.js";
import type { SemanticLogger } from "./logger.js";
import { BUNDLED_PRESET_ID, ensureBundledPreset } from "./preset-installer.js";

export const name = "dsh-lark-bridge";
export const inject = ["apiProxy"];

export interface Config {
  enabled?: boolean;
  workspacePath?: string;
  workspaceTitle?: string;
  agentPreset?: string;
  installBundledPreset?: boolean;
  allowedSenderIds?: string[];
  maxConcurrentTopics?: number;
  maxPendingMessages?: number;
  eventStatePath?: string;
  eventRetentionMs?: number;
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  workspacePath: z.string().default("."),
  workspaceTitle: z.string(),
  agentPreset: z.string().default(BUNDLED_PRESET_ID),
  installBundledPreset: z.boolean().default(true),
  allowedSenderIds: z.array(z.string()),
  maxConcurrentTopics: z.number().min(1).default(4),
  maxPendingMessages: z.number().min(1).default(256),
  eventStatePath: z.string(),
  eventRetentionMs: z.number().min(1).default(604_800_000),
});

export async function apply(ctx: Context, input: Config): Promise<void> {
  const config = {
    enabled: input.enabled ?? true,
    workspacePath: path.resolve(input.workspacePath ?? "."),
    workspaceTitle: input.workspaceTitle?.trim() || undefined,
    agentPreset: input.agentPreset ?? BUNDLED_PRESET_ID,
    installBundledPreset: input.installBundledPreset ?? true,
    allowedSenderIds: Array.isArray(input.allowedSenderIds)
      ? input.allowedSenderIds
          .map((senderId) => senderId.trim())
          .filter(Boolean)
      : undefined,
    maxConcurrentTopics: input.maxConcurrentTopics ?? 4,
    maxPendingMessages: input.maxPendingMessages ?? 256,
    eventStatePath: input.eventStatePath?.trim() || defaultAdmissionStatePath(),
    eventRetentionMs: input.eventRetentionMs ?? 604_800_000,
  };
  const logger = ctx.logger(name);

  if (!config.enabled) {
    logger.info("status=disabled");
    return;
  }
  const credentials = resolveLarkCredentials();
  if (config.installBundledPreset) {
    const preset = await ensureBundledPreset();
    logger.info(
      "preset=%s status=%s",
      BUNDLED_PRESET_ID,
      preset.installed ? "installed" : "ready",
    );
  }

  const semanticLogger: SemanticLogger = {
    info: (event, fields) =>
      logger.info("event=%s fields=%s", event, JSON.stringify(fields ?? {})),
    warn: (event, fields) =>
      logger.warn("event=%s fields=%s", event, JSON.stringify(fields ?? {})),
    error: (event, fields) =>
      logger.error("event=%s fields=%s", event, JSON.stringify(fields ?? {})),
  };
  const admission = new EventAdmissionStore(
    new JsonFileAdmissionAdapter(config.eventStatePath),
    {
      ...(config.allowedSenderIds === undefined
        ? {}
        : { allowedSenderIds: config.allowedSenderIds }),
      retentionMs: config.eventRetentionMs,
    },
  );
  const supervisor = new ConsumerSupervisor({ logger: semanticLogger });
  let ready: Promise<void> | undefined;

  ctx.effect(() => {
    ready = supervisor.start(async (signal, onReady) => {
      const handled = await runBridge({
        client: new ApiProxyDshClient(ctx.apiProxy),
        lark: new LarkSdkTransport({
          credentials,
          logger: semanticLogger,
          maxPendingMessages: config.maxPendingMessages,
        }),
        signal,
        workspacePath: config.workspacePath,
        ...(config.workspaceTitle === undefined
          ? {}
          : { workspaceTitle: config.workspaceTitle }),
        agentPreset: config.agentPreset,
        admission,
        maxConcurrentTopics: config.maxConcurrentTopics,
        maxPendingMessages: config.maxPendingMessages,
        logger: semanticLogger,
        onReady,
      });
      logger.info("status=stopped handled_messages=%d", handled);
    });
    void ready.catch((error: unknown) => {
      logger.error(
        "status=failed error=%s",
        error instanceof Error ? error.message : String(error),
      );
    });
    return () => supervisor.stop();
  }, "dsh-lark consumer");

  if (ready === undefined) {
    throw new Error("dsh-lark consumer effect did not start");
  }
  await ready;
  logger.info(
    "status=ready workspace=%s preset=%s max_concurrent_topics=%d max_pending_messages=%d",
    config.workspacePath,
    config.agentPreset,
    config.maxConcurrentTopics,
    config.maxPendingMessages,
  );
}

export default apply;
