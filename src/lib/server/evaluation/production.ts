import "server-only";

import { getGroqClient } from "@/lib/server/clients/groq";
import { getGroqEnv } from "@/lib/server/env";
import { createGroqEvaluationProvider } from "@/lib/server/evaluation/groq-provider";
import { EvaluationService } from "@/lib/server/evaluation/service";

export function getProductionEvaluationService(): EvaluationService {
  const env = getGroqEnv();
  return new EvaluationService(createGroqEvaluationProvider({
    client: getGroqClient(),
    model: env.GROQ_EVALUATION_MODEL,
    timeoutMs: env.GROQ_EVALUATION_TIMEOUT_MS,
    maxRetries: env.GROQ_EVALUATION_MAX_RETRIES,
  }));
}
