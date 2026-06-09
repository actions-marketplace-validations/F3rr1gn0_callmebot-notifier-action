import { describe, expect, it, vi, beforeEach } from "vitest";

describe("action entrypoint", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.INPUT_MESSAGE = "hello";
    process.env.INPUT_CHANNEL = "telegram";
    process.env.TELEGRAM_BOT_TOKEN = "bot";
    process.env.TELEGRAM_CHAT_ID = "chat";
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => "ok" }) as any;
  });

  it("runs without error", async () => {
    await expect(import("../src/index.js")).resolves.toBeDefined();
  });
});
