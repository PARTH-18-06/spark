import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { config as loadEnvironment } from "dotenv";

loadEnvironment({ path: ".env.local", quiet: true });

const required = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GROQ_API_KEY",
  "GROQ_EVALUATION_MODEL",
  "GROQ_GENERATION_MODEL",
  "AUTH_ALLOWED_ORIGINS",
  "AUTH_TOKEN_ENCRYPTION_KEY",
  "AUTH_RATE_LIMIT_SECRET",
  "SPARK_ENVIRONMENT_NAME",
  "SPARK_INTEGRATION_ENABLED",
  "SPARK_INTEGRATION_BASE_URL",
  "SPARK_INTEGRATION_ORIGIN",
  "DEV_TEACHER_EMAIL",
  "DEV_TEACHER_PASSWORD",
  "DEV_TEACHER_UNASSIGNED_EMAIL",
  "DEV_TEACHER_UNASSIGNED_PASSWORD",
  "DEV_STUDENT_NEW_EMAIL",
  "DEV_STUDENT_NEW_PASSWORD",
  "DEV_STUDENT_RETURNING_EMAIL",
  "DEV_STUDENT_RETURNING_PASSWORD",
];

const missing = required.filter((name) => !process.env[name]?.trim());
const placeholders = required.filter((name) => /^(your-|https:\/\/your-|replace-with-)/i.test(process.env[name]?.trim() ?? ""));
const environment = process.env.SPARK_ENVIRONMENT_NAME?.trim().toLowerCase();
if (environment === "prod" || environment === "production") {
  console.error("BLOCKED: integration harness refuses production-like SPARK_ENVIRONMENT_NAME");
  process.exit(1);
}
if (missing.length || placeholders.length) {
  if (missing.length) console.error(`BLOCKED: missing configuration variables: ${missing.join(", ")}`);
  if (placeholders.length) console.error(`BLOCKED: placeholder configuration variables: ${placeholders.join(", ")}`);
  console.error("No secret values were read into this report. Configure .env.local for an approved local/dedicated test target.");
  process.exit(1);
}
if (process.env.SPARK_INTEGRATION_ENABLED !== "true") {
  console.error("BLOCKED: set SPARK_INTEGRATION_ENABLED=true only after approving the configured local/dedicated target");
  process.exit(1);
}

const source = readFileSync(new URL("../src/lib/server/evaluation/groq-provider.ts", import.meta.url), "utf8");
const modelBlock = source.match(/GROQ_STRICT_OUTPUT_MODELS\s*=\s*new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
const supportedModels = [...modelBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
if (!supportedModels.includes(process.env.GROQ_EVALUATION_MODEL)) {
  console.error("BLOCKED: GROQ_EVALUATION_MODEL is not in the strict-output model allowlist used by the evaluation service");
  process.exit(1);
}

function supabaseCommand(args) {
  try {
    return execFileSync("supabase", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    if (process.platform === "win32") {
      return execFileSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `pnpm dlx supabase ${args.join(" ")}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    }
    return execFileSync("pnpm", ["dlx", "supabase", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  }
}

try {
  const version = supabaseCommand(["--version"]).trim();
  console.log(`Supabase CLI detected (${version.split(/\s+/)[0] || "version hidden"}).`);
} catch {
  console.error("BLOCKED: Supabase CLI is not available; migration status/dry-run cannot be executed");
  console.error("Prepare it with: supabase migration list --linked and supabase db diff --linked");
  process.exit(1);
}

if (!existsSync(".env.local")) {
  console.error("BLOCKED: .env.local was not found");
  process.exit(1);
}
console.log("Preflight passed without printing secret values. No migration, reset, account creation, or data mutation was performed.");
