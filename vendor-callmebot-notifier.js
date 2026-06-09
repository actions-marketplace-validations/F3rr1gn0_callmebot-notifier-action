// src/errors.ts
var CallMeBotError = class extends Error {
  code;
  cause;
  constructor(message, code = "CALLMEBOT_ERROR", cause) {
    super(message);
    this.name = "CallMeBotError";
    this.code = code;
    this.cause = cause;
  }
};
var ValidationError = class extends CallMeBotError {
  constructor(message, cause) {
    super(message, "VALIDATION_ERROR", cause);
    this.name = "ValidationError";
  }
};
var HttpError = class extends CallMeBotError {
  status;
  constructor(message, status, cause) {
    super(message, "HTTP_ERROR", cause);
    this.name = "HttpError";
    this.status = status;
  }
};
var RetryExhaustedError = class extends CallMeBotError {
  constructor(message, cause) {
    super(message, "RETRY_EXHAUSTED", cause);
    this.name = "RetryExhaustedError";
  }
};

// src/logger.ts
var order = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4
};
function createLogger(logger = console, level = "info") {
  const enabled = (wanted) => order[level] >= order[wanted];
  return {
    error: (...args) => enabled("error") && logger.error(...args),
    warn: (...args) => enabled("warn") && logger.warn(...args),
    info: (...args) => enabled("info") && logger.info(...args),
    debug: (...args) => enabled("debug") && logger.debug(...args)
  };
}

// src/retry.ts
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function withRetry(fn, retries, minDelayMs, maxDelayMs) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      const delay = Math.min(maxDelayMs, minDelayMs * 2 ** attempt);
      await sleep(delay);
    }
  }
  throw lastError;
}

// src/format.ts
var isPayload = (input) => typeof input !== "string";
var formatMessage = (payload, preset = "markdown") => {
  if (preset === "json") return JSON.stringify(payload);
  const title = payload.title?.trim() ?? "";
  const message = payload.message?.trim() ?? "";
  const lines = [
    preset === "markdown" && title ? `*${title}*` : title,
    payload.severity ? `Severity: ${payload.severity}` : "",
    payload.source ? `Source: ${payload.source}` : "",
    message
  ].filter(Boolean);
  return lines.join("\n");
};
function resolveMessage(input, formatter = void 0, preset = "markdown") {
  if (typeof input === "string") return input;
  if (!isPayload(input)) return "";
  return formatter ? formatter(input) || formatMessage(input, preset) : formatMessage(input, preset);
}
var createTemplatePayload = (input, severity) => ({
  title: input.title,
  message: input.message,
  source: input.source,
  severity: severity ?? input.severity
});

// src/webhook.ts
function formatWebhookMessage(payload) {
  return formatMessage(payload);
}

// src/notify.ts
var redactError = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/([?&](?:apikey|token|pass|password|secret|key))=[^&\s]+/gi, "$1=[redacted]").replace(/\b(?:apikey|token|pass|password|secret|key)\s*[:=]\s*[^\s,;]+/gi, (match) => {
    const [label] = match.split(/[:=]/, 1);
    return `${label}=[redacted]`;
  }).replace(/\b[A-Za-z0-9_\-]{24,}\b/g, "[redacted]");
};
var redactMessage = (message) => message.replace(/([?&](?:apikey|token|pass|password|secret|key))=[^&\s]+/gi, "$1=[redacted]").replace(/\b(?:apikey|token|pass|password|secret|key)\s*[:=]\s*[^\s,;]+/gi, (match) => {
  const [label] = match.split(/[:=]/, 1);
  return `${label}=[redacted]`;
});
var toChannels = (options, severity) => {
  if (severity && options.routes?.[severity]?.length) return [...options.routes[severity]];
  if (options.channels?.length) return [...options.channels];
  const channels = [options.primary, options.fallback].filter(Boolean);
  return channels;
};
async function notifyBase(options) {
  const severity = typeof options.message === "string" ? void 0 : options.message.severity;
  const message = resolveMessage(options.message, options.formatter, options.messageFormat).trim();
  if (!message) throw new ValidationError("message is required");
  const channels = toChannels(options, severity);
  if (!channels.length) throw new ValidationError("at least one channel is required");
  const retry = options.retry ?? { attempts: 1, delayMs: 0 };
  const attempts = [];
  const logger = createLogger(options.logger ?? console, options.logLevel ?? "silent");
  const safeMessage = redactMessage(message);
  for (const channel of channels) {
    for (let attempt = 1; attempt <= retry.attempts; attempt += 1) {
      try {
        await channel.send(message);
        attempts.push({ channel: channel.name, ok: true, attempt });
        logger.info("notify.delivered", { channel: channel.name, attempt, message: safeMessage, severity });
        const result2 = { ok: true, deliveredBy: channel.name, attempts };
        await options.onResult?.(result2);
        return { ok: true, deliveredBy: channel.name, attempts };
      } catch (error) {
        const safeError = redactError(error);
        attempts.push({ channel: channel.name, ok: false, attempt, error: safeError });
        logger.warn("notify.failed", { channel: channel.name, attempt, error: safeError, message: safeMessage, severity });
        await options.onError?.(error, { channel: channel.name, attempt, message: safeMessage });
        if (attempt < retry.attempts && retry.delayMs > 0) await sleep(retry.delayMs);
      }
    }
  }
  const result = { ok: false, attempts };
  logger.error("notify.exhausted", { message: safeMessage, severity, attempts: attempts.length });
  await options.onResult?.(result);
  return result;
}
var notifyWithTemplate = async (template, options) => notifyBase({
  ...options,
  message: template
});
var alert = (template, options = {}) => notifyWithTemplate({ ...template, severity: template.severity ?? "critical" }, options);
var incident = (template, options = {}) => notifyWithTemplate({ ...template, severity: template.severity ?? "critical" }, options);
var notify = Object.assign(notifyBase, { alert, incident });
function summarizeNotifyResult(result) {
  return {
    ok: result.ok,
    deliveredBy: result.deliveredBy,
    attempts: result.attempts.length,
    failures: result.attempts.filter((attempt) => !attempt.ok).length
  };
}

// src/client.ts
var CallMeBotNotifier = class {
  phone;
  apikey;
  baseUrl;
  timeoutMs;
  retries;
  minDelayMs;
  maxDelayMs;
  rateLimitPerMinute;
  fetchImpl;
  log;
  lastSentAt = 0;
  constructor(config) {
    if (!config?.phone?.trim()) throw new ValidationError("phone is required");
    if (!config?.apikey?.trim()) throw new ValidationError("apikey is required");
    this.phone = config.phone.trim();
    this.apikey = config.apikey.trim();
    this.baseUrl = config.baseUrl ?? "https://api.callmebot.com";
    this.timeoutMs = config.timeoutMs ?? 1e4;
    this.retries = config.retries ?? 2;
    this.minDelayMs = config.minDelayMs ?? 250;
    this.maxDelayMs = config.maxDelayMs ?? 2e3;
    this.rateLimitPerMinute = config.rateLimitPerMinute ?? 30;
    this.fetchImpl = config.fetch ?? fetch;
    this.log = createLogger(config.logger ?? console, config.logLevel ?? "silent");
  }
  async rateLimit() {
    if (this.rateLimitPerMinute <= 0) return;
    const minGap = 6e4 / this.rateLimitPerMinute;
    const now = Date.now();
    const wait = Math.max(0, this.lastSentAt + minGap - now);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastSentAt = Date.now();
  }
  async sendWhatsApp(message, options = {}) {
    if (!message?.trim()) throw new ValidationError("message is required");
    const baseUrl = options.baseUrl ?? this.baseUrl;
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const retries = options.retries ?? this.retries;
    const url = new URL("/whatsapp.php", baseUrl);
    url.searchParams.set("phone", this.phone);
    url.searchParams.set("text", message);
    url.searchParams.set("apikey", this.apikey);
    await this.rateLimit();
    try {
      const text = await withRetry(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const signal = options.signal ?? controller.signal;
        try {
          const response = await this.fetchImpl(url.toString(), { method: "GET", signal });
          const body = await response.text();
          if (!response.ok) throw new HttpError(`CallMeBot failed: ${response.status}`, response.status, body);
          return body;
        } finally {
          clearTimeout(timer);
        }
      }, retries, this.minDelayMs, this.maxDelayMs);
      this.log.debug("whatsapp sent");
      return { ok: true, channel: "whatsapp", message: text };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new RetryExhaustedError("WhatsApp send failed after retries", error);
    }
  }
};

// src/channels/callmebot.channel.ts
var CallMeBotChannel = class {
  constructor(client) {
    this.client = client;
  }
  client;
  name = "whatsapp";
  async send(message) {
    await this.client.sendWhatsApp(message);
  }
};

// src/channels/telegram.channel.ts
var TelegramChannel = class {
  constructor(config) {
    this.config = config;
    if (!config.botToken?.trim()) throw new ValidationError("botToken is required");
    if (!config.chatId?.trim()) throw new ValidationError("chatId is required");
    this.baseUrl = config.baseUrl ?? "https://api.telegram.org";
    this.fetchImpl = config.fetch ?? fetch;
  }
  config;
  name = "telegram";
  baseUrl;
  fetchImpl;
  async send(message) {
    const url = new URL(`/bot${this.config.botToken}/sendMessage`, this.baseUrl);
    const response = await this.fetchImpl(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: this.config.chatId, text: message })
    });
    if (!response.ok) throw new Error(await response.text());
  }
};

// src/channels/email.channel.ts
import nodemailer from "nodemailer";
var EmailChannel = class {
  constructor(config) {
    this.config = config;
    if (!config.host?.trim()) throw new ValidationError("host is required");
    if (!config.from?.trim()) throw new ValidationError("from is required");
    if (!config.to?.trim()) throw new ValidationError("to is required");
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass ?? "" } : void 0
    });
  }
  config;
  name = "email";
  transport;
  async send(message) {
    await this.transport.sendMail({
      from: this.config.from,
      to: this.config.to,
      subject: "CallMeBot notifier",
      text: message
    });
  }
};

// src/channels/discord.channel.ts
var DiscordChannel = class {
  constructor(config) {
    this.config = config;
    if (!config.webhookUrl?.trim()) throw new ValidationError("webhookUrl is required");
    this.fetchImpl = config.fetch ?? fetch;
  }
  config;
  name = "discord";
  fetchImpl;
  async send(message) {
    const response = await this.fetchImpl(this.config.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: message,
        username: this.config.username,
        avatar_url: this.config.avatarUrl
      })
    });
    if (!response.ok) throw new Error(await response.text());
  }
};

// src/channels/slack.channel.ts
var SlackChannel = class {
  constructor(config) {
    this.config = config;
    if (!config.webhookUrl?.trim()) throw new ValidationError("webhookUrl is required");
    this.fetchImpl = config.fetch ?? fetch;
  }
  config;
  name = "slack";
  fetchImpl;
  async send(message) {
    const response = await this.fetchImpl(this.config.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: message,
        username: this.config.username,
        icon_emoji: this.config.iconEmoji
      })
    });
    if (!response.ok) throw new Error(await response.text());
  }
};

// src/channels/gchat.channel.ts
var GChatChannel = class {
  constructor(config) {
    this.config = config;
    if (!config.webhookUrl?.trim()) throw new ValidationError("webhookUrl is required");
    this.fetchImpl = config.fetch ?? fetch;
  }
  config;
  name = "gchat";
  fetchImpl;
  async send(message) {
    const response = await this.fetchImpl(this.config.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: message })
    });
    if (!response.ok) throw new Error(await response.text());
  }
};

// src/channels/teams.channel.ts
var TeamsChannel = class {
  constructor(config) {
    this.config = config;
    if (!config.webhookUrl?.trim()) throw new ValidationError("webhookUrl is required");
    this.fetchImpl = config.fetch ?? fetch;
  }
  config;
  name = "teams";
  fetchImpl;
  async send(message) {
    const response = await this.fetchImpl(this.config.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: message })
    });
    if (!response.ok) throw new Error(await response.text());
  }
};

// src/channels/fallback.channel.ts
var FallbackChannel = class {
  constructor(channels) {
    this.channels = channels;
  }
  channels;
  name = "fallback";
  async send(message) {
    for (const channel of this.channels) {
      try {
        await channel.send(message);
        return;
      } catch (error) {
        void error;
      }
    }
    throw new Error("all fallback channels failed");
  }
};

// src/channels/factories.ts
var whatsapp = (config) => new CallMeBotChannel(new CallMeBotNotifier(config));
var telegram = (config) => new TelegramChannel(config);
var email = (config) => new EmailChannel(config);
var discord = (config) => new DiscordChannel(config);
var slack = (config) => new SlackChannel(config);
var gchat = (config) => new GChatChannel(config);
var teams = (config) => new TeamsChannel(config);

// src/env.ts
var missing = (name) => new ValidationError(`Missing env ${name}`);
var maybe = (value) => value?.trim();
function fromEnv(options = {}) {
  const env = options.env ?? process.env;
  const channels = [];
  const phone = maybe(env.PHONE);
  const apikey = maybe(env.APIKEY);
  if (phone || apikey) {
    if (!phone) throw missing("PHONE");
    if (!apikey) throw missing("APIKEY");
    const client = new CallMeBotNotifier({
      phone,
      apikey,
      logLevel: options.logLevel ?? "silent"
    });
    channels.push(new CallMeBotChannel(client));
  }
  const telegramBotToken = maybe(env.TELEGRAM_BOT_TOKEN);
  const telegramChatId = maybe(env.TELEGRAM_CHAT_ID);
  if (telegramBotToken || telegramChatId) {
    if (!telegramBotToken) throw missing("TELEGRAM_BOT_TOKEN");
    if (!telegramChatId) throw missing("TELEGRAM_CHAT_ID");
    const config = { botToken: telegramBotToken, chatId: telegramChatId };
    channels.push(new TelegramChannel(config));
  }
  const smtpHost = maybe(env.SMTP_HOST);
  const emailFrom = maybe(env.EMAIL_FROM);
  const emailTo = maybe(env.EMAIL_TO);
  if (smtpHost || emailFrom || emailTo) {
    if (!smtpHost) throw missing("SMTP_HOST");
    if (!emailFrom) throw missing("EMAIL_FROM");
    if (!emailTo) throw missing("EMAIL_TO");
    const config = {
      host: smtpHost,
      port: Number(env.SMTP_PORT ?? 587),
      secure: env.SMTP_SECURE === "true",
      user: maybe(env.SMTP_USER),
      pass: maybe(env.SMTP_PASS),
      from: emailFrom,
      to: emailTo
    };
    channels.push(new EmailChannel(config));
  }
  const discordWebhookUrl = maybe(env.DISCORD_WEBHOOK_URL);
  if (discordWebhookUrl) channels.push(new DiscordChannel({ webhookUrl: discordWebhookUrl }));
  const slackWebhookUrl = maybe(env.SLACK_WEBHOOK_URL);
  if (slackWebhookUrl) channels.push(new SlackChannel({ webhookUrl: slackWebhookUrl }));
  const gchatWebhookUrl = maybe(env.GCHAT_WEBHOOK_URL ?? env.GOOGLE_CHAT_WEBHOOK_URL);
  if (gchatWebhookUrl) {
    const config = { webhookUrl: gchatWebhookUrl };
    channels.push(new GChatChannel(config));
  }
  const teamsWebhookUrl = maybe(env.TEAMS_WEBHOOK_URL ?? env.MS_TEAMS_WEBHOOK_URL);
  if (teamsWebhookUrl) {
    const config = { webhookUrl: teamsWebhookUrl };
    channels.push(new TeamsChannel(config));
  }
  if (!channels.length) {
    throw new ValidationError(
      "No channels configured. Set PHONE/APIKEY, TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID, SMTP_*, DISCORD_WEBHOOK_URL, SLACK_WEBHOOK_URL, GCHAT_WEBHOOK_URL, or TEAMS_WEBHOOK_URL."
    );
  }
  return new FallbackChannel(channels);
}

// src/integrations/express.ts
import express from "express";
import { z } from "zod";
var notifySchema = z.object({ message: z.string().min(1) });
var webhookSchema = z.object({
  title: z.string().optional(),
  message: z.string().optional(),
  severity: z.enum(["info", "warn", "error", "critical"]).optional(),
  source: z.string().optional()
}).passthrough();
function createExpressApp(channel) {
  const app = express();
  app.use(express.json());
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.post("/notify", async (req, res) => {
    const parsed = notifySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    try {
      await channel.send(parsed.data.message);
      return res.status(200).json({ ok: true });
    } catch (error) {
      return res.status(502).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
  app.post("/webhook", async (req, res) => {
    const parsed = webhookSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });
    const message = formatWebhookMessage(parsed.data);
    try {
      await channel.send(message);
      return res.status(200).json({ ok: true });
    } catch (error) {
      return res.status(502).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
  return app;
}
export {
  CallMeBotChannel,
  CallMeBotError,
  CallMeBotNotifier,
  DiscordChannel,
  EmailChannel,
  FallbackChannel,
  GChatChannel,
  HttpError,
  RetryExhaustedError,
  SlackChannel,
  TeamsChannel,
  TelegramChannel,
  ValidationError,
  alert,
  createExpressApp,
  createLogger,
  createTemplatePayload,
  discord,
  email,
  formatMessage,
  formatWebhookMessage,
  fromEnv,
  gchat,
  incident,
  notify,
  resolveMessage,
  slack,
  sleep,
  summarizeNotifyResult,
  teams,
  telegram,
  whatsapp,
  withRetry
};
//# sourceMappingURL=index.js.map