import { execFileSync } from "node:child_process";
import { config as loadEnvironment } from "dotenv";

loadEnvironment({ path: ".env.local", quiet: true });

if (process.env.SPARK_INTEGRATION_ENABLED !== "true") {
  console.error("BLOCKED: set SPARK_INTEGRATION_ENABLED=true only for an approved local/dedicated target");
  process.exit(1);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("BLOCKED: missing configuration variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

function supabaseCommand(args) {
  try {
    return execFileSync("supabase", args, { stdio: "ignore", env: process.env });
  } catch {
    if (process.platform === "win32") {
      return execFileSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `pnpm dlx supabase ${args.join(" ")}`], { stdio: "ignore", env: process.env });
    }
    return execFileSync("pnpm", ["dlx", "supabase", ...args], { stdio: "ignore", env: process.env });
  }
}

function run(label, args) {
  try {
    supabaseCommand(args);
    console.log(`PASS: ${label}`);
    return true;
  } catch {
    console.error(`BLOCKED or FAILED: ${label} could not be completed; inspect the approved project outside this report`);
    return false;
  }
}

run("linked migration status", ["migration", "list", "--linked"]);
if (!run("linked migration dry-run diff", ["db", "diff", "--linked"])) {
  if (!run("linked migration dry-run push fallback", ["db", "push", "--linked", "--dry-run"])) process.exitCode = 1;
}
console.log("No reset, push, seed, account creation, or destructive database command was run.");
