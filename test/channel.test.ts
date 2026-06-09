import { describe, expect, it, vi, beforeEach } from "vitest";

import { resolveChannel, whatsapp, telegram, discord, slack, gchat, teams, fromEnv } from "../src/runtime.js";

describe("resolveChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps whatsapp", () => {
    expect(resolveChannel("whatsapp").name).toBe("whatsapp");
  });

  it("maps telegram", () => {
    expect(resolveChannel("telegram").name).toBe("telegram");
  });

  it("maps email", () => {
    expect(resolveChannel("discord").name).toBe("discord");
  });

  it("maps discord", () => {
    expect(resolveChannel("slack").name).toBe("slack");
  });

  it("maps slack", () => {
    expect(resolveChannel("gchat").name).toBe("gchat");
  });

  it("maps gchat", () => {
    expect(resolveChannel("teams").name).toBe("teams");
  });

  it("uses fromEnv fallback", () => {
    process.env.PHONE = "123";
    process.env.APIKEY = "key";
    expect(resolveChannel("").name).toBe("whatsapp");
  });

  it("throws when no env configured", () => {
    delete process.env.PHONE;
    delete process.env.APIKEY;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.DISCORD_WEBHOOK_URL;
    delete process.env.SLACK_WEBHOOK_URL;
    delete process.env.GCHAT_WEBHOOK_URL;
    delete process.env.GOOGLE_CHAT_WEBHOOK_URL;
    delete process.env.TEAMS_WEBHOOK_URL;
    expect(() => fromEnv()).toThrow("No channels configured");
  });

  it("sends via whatsapp", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => "ok" });
    vi.stubGlobal("fetch", fetch);
    process.env.PHONE = "123";
    process.env.APIKEY = "key";
    await expect(whatsapp().send("m")).resolves.toBeUndefined();
  });

  it("sends via telegram", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => "ok" });
    vi.stubGlobal("fetch", fetch);
    process.env.TELEGRAM_BOT_TOKEN = "bot";
    process.env.TELEGRAM_CHAT_ID = "chat";
    await expect(telegram().send("m")).resolves.toBeUndefined();
  });

  it("sends via discord/slack/gchat/teams", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => "ok" });
    vi.stubGlobal("fetch", fetch);
    process.env.DISCORD_WEBHOOK_URL = "https://example.com/discord";
    process.env.SLACK_WEBHOOK_URL = "https://example.com/slack";
    process.env.GCHAT_WEBHOOK_URL = "https://example.com/gchat";
    process.env.TEAMS_WEBHOOK_URL = "https://example.com/teams";
    await expect(discord().send("m")).resolves.toBeUndefined();
    await expect(slack().send("m")).resolves.toBeUndefined();
    await expect(gchat().send("m")).resolves.toBeUndefined();
    await expect(teams().send("m")).resolves.toBeUndefined();
  });
});
