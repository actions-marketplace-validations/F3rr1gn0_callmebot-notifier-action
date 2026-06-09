export type ChannelName = "whatsapp" | "telegram" | "discord" | "slack" | "gchat" | "teams";

type Channel = { name: ChannelName; send(message: string): Promise<void> };

const postJson = async (url: string, body: unknown) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await response.text());
};

export const whatsapp = (): Channel => ({
  name: "whatsapp",
  async send(message: string) {
    const phone = process.env.PHONE?.trim();
    const apikey = process.env.APIKEY?.trim();
    if (!phone) throw new Error("PHONE is required");
    if (!apikey) throw new Error("APIKEY is required");
    const url = new URL("https://api.callmebot.com/whatsapp.php");
    url.searchParams.set("phone", phone);
    url.searchParams.set("text", message);
    url.searchParams.set("apikey", apikey);
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(await response.text());
  }
});

export const telegram = (): Channel => ({
  name: "telegram",
  async send(message: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
    if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is required");
    if (!chatId) throw new Error("TELEGRAM_CHAT_ID is required");
    await postJson(`https://api.telegram.org/bot${botToken}/sendMessage`, { chat_id: chatId, text: message });
  }
});

export const discord = (): Channel => ({
  name: "discord",
  async send(message: string) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL?.trim();
    if (!webhookUrl) throw new Error("DISCORD_WEBHOOK_URL is required");
    await postJson(webhookUrl, { content: message });
  }
});

export const slack = (): Channel => ({
  name: "slack",
  async send(message: string) {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL?.trim();
    if (!webhookUrl) throw new Error("SLACK_WEBHOOK_URL is required");
    await postJson(webhookUrl, { text: message });
  }
});

export const gchat = (): Channel => ({
  name: "gchat",
  async send(message: string) {
    const webhookUrl = process.env.GCHAT_WEBHOOK_URL?.trim() ?? process.env.GOOGLE_CHAT_WEBHOOK_URL?.trim();
    if (!webhookUrl) throw new Error("GCHAT_WEBHOOK_URL is required");
    await postJson(webhookUrl, { text: message });
  }
});

export const teams = (): Channel => ({
  name: "teams",
  async send(message: string) {
    const webhookUrl = process.env.TEAMS_WEBHOOK_URL?.trim();
    if (!webhookUrl) throw new Error("TEAMS_WEBHOOK_URL is required");
    await postJson(webhookUrl, { text: message });
  }
});

export const fromEnv = () => {
  if (process.env.PHONE && process.env.APIKEY) return whatsapp();
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) return telegram();
  if (process.env.DISCORD_WEBHOOK_URL) return discord();
  if (process.env.SLACK_WEBHOOK_URL) return slack();
  if (process.env.GCHAT_WEBHOOK_URL || process.env.GOOGLE_CHAT_WEBHOOK_URL) return gchat();
  if (process.env.TEAMS_WEBHOOK_URL) return teams();
  throw new Error("No channels configured");
};

export const resolveChannel = (channel: "" | ChannelName) => {
  if (channel === "whatsapp") return whatsapp();
  if (channel === "telegram") return telegram();
  if (channel === "discord") return discord();
  if (channel === "slack") return slack();
  if (channel === "gchat") return gchat();
  if (channel === "teams") return teams();
  return fromEnv();
};

export const notify = async ({ channels, message }: { channels: Channel[]; message: string }) => {
  const channel = channels[0];
  if (!channel) throw new Error("at least one channel is required");
  await channel.send(message);
  return { ok: true, deliveredBy: channel.name, attempts: [{ channel: channel.name, ok: true, attempt: 1 }] };
};

