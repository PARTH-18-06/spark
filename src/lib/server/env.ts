import "server-only";

import { z } from "zod";

const nonPlaceholder = (name: string) =>
  z.string({ error: `${name} is required` }).min(1, `${name} is required`).refine(
    (value) => !/^(your-|https:\/\/your-|replace-with-)/i.test(value),
    `${name} still contains an example placeholder`,
  );

const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");
const positiveIntegerString = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive());
const nonnegativeIntegerString = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().nonnegative());

export const supabaseEnvSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: nonPlaceholder("SUPABASE_ANON_KEY"),
  SUPABASE_SERVICE_ROLE_KEY: nonPlaceholder("SUPABASE_SERVICE_ROLE_KEY"),
});

export const authEnvSchema = supabaseEnvSchema.extend({
  AUTH_ALLOWED_ORIGINS: z.string().min(1).transform((value) =>
    value.split(",").map((origin) => origin.trim()).filter(Boolean),
  ).refine((origins) => origins.every((origin) => {
    try { return new URL(origin).origin === origin; } catch { return false; }
  }), "AUTH_ALLOWED_ORIGINS must contain comma-separated URL origins"),
  AUTH_SESSION_COOKIE_NAME: z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/).default("spark_session"),
  AUTH_COOKIE_SECURE: booleanString.default(true),
  AUTH_TOKEN_ENCRYPTION_KEY: nonPlaceholder("AUTH_TOKEN_ENCRYPTION_KEY").refine((value) => {
    try { return Buffer.from(value, "base64").length === 32; } catch { return false; }
  }, "AUTH_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key"),
  AUTH_RATE_LIMIT_SECRET: nonPlaceholder("AUTH_RATE_LIMIT_SECRET").min(32),
  AUTH_SESSION_TTL_SECONDS: positiveIntegerString.default(604800),
  AUTH_REFRESH_SKEW_SECONDS: positiveIntegerString.default(60),
  AUTH_LOGIN_MAX_ATTEMPTS: positiveIntegerString.default(5),
  AUTH_LOGIN_WINDOW_SECONDS: positiveIntegerString.default(900),
  AUTH_LOGIN_BLOCK_SECONDS: positiveIntegerString.default(900),
  AUTH_TRUST_PROXY: booleanString.default(false),
});

export const groqEnvSchema = z.object({
  GROQ_API_KEY: nonPlaceholder("GROQ_API_KEY"),
  GROQ_EVALUATION_MODEL: nonPlaceholder("GROQ_EVALUATION_MODEL"),
  GROQ_GENERATION_MODEL: nonPlaceholder("GROQ_GENERATION_MODEL"),
  GROQ_EVALUATION_TIMEOUT_MS: positiveIntegerString.default(10000),
  GROQ_EVALUATION_MAX_RETRIES: nonnegativeIntegerString.pipe(z.number().max(2)).default(1),
});

export type SupabaseEnv = z.infer<typeof supabaseEnvSchema>;
export type AuthEnv = z.infer<typeof authEnvSchema>;
export type GroqEnv = z.infer<typeof groqEnvSchema>;

export const getSupabaseEnv = (): SupabaseEnv => supabaseEnvSchema.parse(process.env);
export const getAuthEnv = (): AuthEnv => authEnvSchema.parse(process.env);
export const getGroqEnv = (): GroqEnv => groqEnvSchema.parse(process.env);
