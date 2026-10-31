import "server-only";

import Groq from "groq-sdk";

import { getGroqEnv } from "@/lib/server/env";

let client: Groq | undefined;

export function getGroqClient(): Groq {
  client ??= new Groq({ apiKey: getGroqEnv().GROQ_API_KEY });
  return client;
}
