import { notify, resolveChannel } from "./runtime.js";

const message = process.env.INPUT_MESSAGE?.trim();
if (!message) throw new Error("INPUT_MESSAGE is required");

const channel = resolveChannel((process.env.INPUT_CHANNEL?.trim() ?? "") as "" | "whatsapp" | "telegram" | "discord" | "slack" | "gchat" | "teams");

await notify({
  channels: [channel],
  message
});

