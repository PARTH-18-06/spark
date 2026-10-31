import "server-only";

import { getProductionAuthDependencies, getProductionAuthService } from "@/lib/server/auth/production";
import { getSupabaseAdminClient } from "@/lib/server/clients/supabase";
import { getProductionEvaluationService } from "@/lib/server/evaluation/production";
import { loadMisconceptionCatalog, loadReviewedQuestionBank, loadReviewedRubrics } from "@/lib/server/learning/question-bank";
import { SupabaseSessionRepository, StudentSessionService } from "@/lib/server/learning/session-service";
import { createStudentSessionHandlers } from "@/lib/server/learning/session-handlers";
import { createStudentReadHandlers } from "@/lib/server/learning/read-handlers";
import { SupabaseStudentReadRepository } from "@/lib/server/learning/read-repository";

let handlers: ReturnType<typeof createStudentSessionHandlers> | undefined;
let readHandlers: ReturnType<typeof createStudentReadHandlers> | undefined;

export function getProductionStudentSessionHandlers() {
  if (!handlers) {
    const client = getSupabaseAdminClient();
    const content = Promise.all([loadReviewedQuestionBank(client), loadReviewedRubrics(client), loadMisconceptionCatalog(client)]).then(([bank, rubrics, misconceptionCatalog]) => {
      const sessions = new StudentSessionService({ repository: new SupabaseSessionRepository(client), evaluator: getProductionEvaluationService(), bank, rubrics, misconceptionCatalog });
      return createStudentSessionHandlers({ auth: getProductionAuthService(), authConfig: getProductionAuthDependencies().config, sessions });
    });
    handlers = {
      getConcepts: async (request) => (await content).getConcepts(request),
      startSession: async (request) => (await content).startSession(request),
      getSession: async (request, id) => (await content).getSession(request, id),
      submitAttempt: async (request, id) => (await content).submitAttempt(request, id),
      advanceSession: async (request, id) => (await content).advanceSession(request, id),
      endSession: async (request, id) => (await content).endSession(request, id),
    };
  }
  return handlers;
}

export function getProductionStudentReadHandlers() {
  if (!readHandlers) {
    const dependencies = getProductionAuthDependencies();
    readHandlers = createStudentReadHandlers({ auth: getProductionAuthService(), authStore: dependencies.store, authConfig: dependencies.config, reads: new SupabaseStudentReadRepository(getSupabaseAdminClient()) });
  }
  return readHandlers;
}

