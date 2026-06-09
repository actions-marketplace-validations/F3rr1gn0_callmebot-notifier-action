import * as express_serve_static_core from 'express-serve-static-core';

type LoggerLevel = "silent" | "error" | "warn" | "info" | "debug";
type LoggerLike = Pick<Console, "error" | "warn" | "info" | "debug">;
type NotificationSeverity = "info" | "warn" | "error" | "critical";
interface CallMeBotConfig {
    phone: string;
    apikey: string;
    baseUrl?: string;
    timeoutMs?: number;
    retries?: number;
    minDelayMs?: number;
    maxDelayMs?: number;
    rateLimitPerMinute?: number;
    logger?: LoggerLike;
    logLevel?: LoggerLevel;
    fetch?: typeof fetch;
}
interface SendOptions {
    timeoutMs?: number;
    retries?: number;
    baseUrl?: string;
    signal?: AbortSignal;
}
interface NotificationResult {
    ok: boolean;
    channel: "whatsapp" | "telegram" | "email";
    message: string;
    error?: string;
}
interface NotificationMessagePayload {
    title?: string;
    message?: string;
    severity?: NotificationSeverity;
    source?: string;
    [key: string]: unknown;
}
interface NotificationChannel {
    name: string;
    send(message: string): Promise<void>;
}
type NotifyAttempt = {
    channel: string;
    ok: boolean;
    attempt: number;
    error?: string;
};
type NotifyResult = {
    ok: boolean;
    deliveredBy?: string;
    attempts: NotifyAttempt[];
};
type MessageFormatter = (payload: NotificationMessagePayload) => string;
type MessageInput = string | NotificationMessagePayload;
type MessageFormatPreset = "markdown" | "plain" | "json";
type RetryPolicy = {
    attempts: number;
    delayMs: number;
};
type ReminderAfter = `${number}${"m" | "h" | "d"}` | string;
type NotifyOptions = {
    primary?: NotificationChannel;
    fallback?: NotificationChannel;
    channels?: NotificationChannel[];
    message: MessageInput;
    routes?: Partial<Record<NotificationSeverity, NotificationChannel[]>>;
    retry?: RetryPolicy;
    reminderAfter?: ReminderAfter;
    formatter?: MessageFormatter;
    messageFormat?: MessageFormatPreset;
    logger?: LoggerLike;
    logLevel?: LoggerLevel;
    onResult?: (result: NotifyResult) => void | Promise<void>;
    onError?: (error: unknown, context: {
        channel: string;
        attempt: number;
        message: string;
    }) => void | Promise<void>;
};
type NotifyTemplateInput = {
    title: string;
    message: string;
    source?: string;
    severity?: NotificationSeverity;
};
interface TelegramConfig {
    botToken: string;
    chatId: string;
    baseUrl?: string;
    fetch?: typeof fetch;
}
interface EmailConfig {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    pass?: string;
    from: string;
    to: string;
}
interface DiscordConfig {
    webhookUrl: string;
    username?: string;
    avatarUrl?: string;
    fetch?: typeof fetch;
}
interface SlackConfig {
    webhookUrl: string;
    username?: string;
    iconEmoji?: string;
    fetch?: typeof fetch;
}
interface GChatConfig {
    webhookUrl: string;
    fetch?: typeof fetch;
}
interface TeamsConfig {
    webhookUrl: string;
    fetch?: typeof fetch;
}

declare class CallMeBotError extends Error {
    readonly code: string;
    readonly cause?: unknown;
    constructor(message: string, code?: string, cause?: unknown);
}
declare class ValidationError extends CallMeBotError {
    constructor(message: string, cause?: unknown);
}
declare class HttpError extends CallMeBotError {
    readonly status?: number;
    constructor(message: string, status?: number, cause?: unknown);
}
declare class RetryExhaustedError extends CallMeBotError {
    constructor(message: string, cause?: unknown);
}

declare function createLogger(logger?: LoggerLike, level?: LoggerLevel): {
    error: (...args: unknown[]) => false | void;
    warn: (...args: unknown[]) => false | void;
    info: (...args: unknown[]) => false | void;
    debug: (...args: unknown[]) => false | void;
};

declare function sleep(ms: number): Promise<unknown>;
declare function withRetry<T>(fn: (attempt: number) => Promise<T>, retries: number, minDelayMs: number, maxDelayMs: number): Promise<T>;

declare function formatWebhookMessage(payload: NotificationMessagePayload): string;

declare const formatMessage: (payload: NotificationMessagePayload, preset?: MessageFormatPreset) => string;
declare function resolveMessage(input: MessageInput, formatter?: MessageFormatter | undefined, preset?: MessageFormatPreset): string;
declare const createTemplatePayload: (input: NotifyTemplateInput, severity?: NotifyTemplateInput["severity"]) => NotificationMessagePayload;

declare function notifyBase(options: NotifyOptions): Promise<NotifyResult>;
declare const alert: (template: NotifyTemplateInput, options?: Omit<NotifyOptions, "message">) => Promise<NotifyResult>;
declare const incident: (template: NotifyTemplateInput, options?: Omit<NotifyOptions, "message">) => Promise<NotifyResult>;
declare const notify: typeof notifyBase & {
    alert: (template: NotifyTemplateInput, options?: Omit<NotifyOptions, "message">) => Promise<NotifyResult>;
    incident: (template: NotifyTemplateInput, options?: Omit<NotifyOptions, "message">) => Promise<NotifyResult>;
};
declare function summarizeNotifyResult(result: NotifyResult): {
    ok: boolean;
    deliveredBy: string | undefined;
    attempts: number;
    failures: number;
};

declare class CallMeBotNotifier {
    private readonly phone;
    private readonly apikey;
    private readonly baseUrl;
    private readonly timeoutMs;
    private readonly retries;
    private readonly minDelayMs;
    private readonly maxDelayMs;
    private readonly rateLimitPerMinute;
    private readonly fetchImpl;
    private readonly log;
    private lastSentAt;
    constructor(config: CallMeBotConfig);
    private rateLimit;
    sendWhatsApp(message: string, options?: SendOptions): Promise<{
        ok: boolean;
        channel: "whatsapp";
        message: string;
    }>;
}

declare class CallMeBotChannel implements NotificationChannel {
    private readonly client;
    readonly name = "whatsapp";
    constructor(client: CallMeBotNotifier);
    send(message: string): Promise<void>;
}

declare class TelegramChannel implements NotificationChannel {
    private readonly config;
    readonly name = "telegram";
    private readonly baseUrl;
    private readonly fetchImpl;
    constructor(config: TelegramConfig);
    send(message: string): Promise<void>;
}

declare class EmailChannel implements NotificationChannel {
    private readonly config;
    readonly name = "email";
    private readonly transport;
    constructor(config: EmailConfig);
    send(message: string): Promise<void>;
}

declare class DiscordChannel implements NotificationChannel {
    private readonly config;
    readonly name = "discord";
    private readonly fetchImpl;
    constructor(config: DiscordConfig);
    send(message: string): Promise<void>;
}

declare class SlackChannel implements NotificationChannel {
    private readonly config;
    readonly name = "slack";
    private readonly fetchImpl;
    constructor(config: SlackConfig);
    send(message: string): Promise<void>;
}

declare class GChatChannel implements NotificationChannel {
    private readonly config;
    readonly name = "gchat";
    private readonly fetchImpl;
    constructor(config: GChatConfig);
    send(message: string): Promise<void>;
}

declare class TeamsChannel implements NotificationChannel {
    private readonly config;
    readonly name = "teams";
    private readonly fetchImpl;
    constructor(config: TeamsConfig);
    send(message: string): Promise<void>;
}

declare class FallbackChannel implements NotificationChannel {
    private readonly channels;
    readonly name = "fallback";
    constructor(channels: NotificationChannel[]);
    send(message: string): Promise<void>;
}

declare const whatsapp: (config: CallMeBotConfig) => NotificationChannel;
declare const telegram: (config: TelegramConfig) => NotificationChannel;
declare const email: (config: EmailConfig) => NotificationChannel;
declare const discord: (config: DiscordConfig) => NotificationChannel;
declare const slack: (config: SlackConfig) => NotificationChannel;
declare const gchat: (config: GChatConfig) => NotificationChannel;
declare const teams: (config: TeamsConfig) => NotificationChannel;

type FromEnvOptions = {
    env?: NodeJS.ProcessEnv;
    logLevel?: "silent" | "error" | "warn" | "info" | "debug";
};
declare function fromEnv(options?: FromEnvOptions): FallbackChannel;

declare function createExpressApp(channel: NotificationChannel): express_serve_static_core.Express;

export { CallMeBotChannel, type CallMeBotConfig, CallMeBotError, CallMeBotNotifier, DiscordChannel, type DiscordConfig, EmailChannel, type EmailConfig, FallbackChannel, type FromEnvOptions, GChatChannel, type GChatConfig, HttpError, type LoggerLevel, type LoggerLike, type MessageFormatPreset, type MessageFormatter, type MessageInput, type NotificationChannel, type NotificationMessagePayload, type NotificationResult, type NotificationSeverity, type NotifyAttempt, type NotifyOptions, type NotifyResult, type NotifyTemplateInput, type ReminderAfter, RetryExhaustedError, type RetryPolicy, type SendOptions, SlackChannel, type SlackConfig, TeamsChannel, type TeamsConfig, TelegramChannel, type TelegramConfig, ValidationError, alert, createExpressApp, createLogger, createTemplatePayload, discord, email, formatMessage, formatWebhookMessage, fromEnv, gchat, incident, notify, resolveMessage, slack, sleep, summarizeNotifyResult, teams, telegram, whatsapp, withRetry };
