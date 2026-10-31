import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const tutorPath = new URL("../src/contracts/tutor.ts", import.meta.url);
const apiDocumentPath = new URL("../docs/frontend-api-contract.md", import.meta.url);
const routeRoot = new URL("../src/app/api/v1/", import.meta.url);

const expectedHashes = {
  tutor: "24c35c31f4137805dffa56db4466b32ba585eb1c01ca61666b12661a11eeec07",
  apiDocument: "038cd82a468f0aae08139499a4bd6572a4dfc658c68580bea5fcf275c716c34f",
};

const requiredExports = [
  "TUTOR_CONTRACT_VERSION",
  "CHAPTER_ID",
  "ELECTRICITY_CONCEPTS",
  "MISCONCEPTION_CODES",
  "AuthState",
  "AuthenticatedState",
  "StudentProfile",
  "ConceptProgress",
  "Question",
  "Rewards",
  "AttemptFeedback",
  "SessionSummary",
  "SessionSnapshot",
  "StartSessionInput",
  "SubmitAttemptInput",
  "AttemptResult",
  "AdvanceSessionInput",
  "EndSessionInput",
  "HttpMutationBody",
  "StudentDashboard",
  "RevisionQueue",
  "ProgressResponse",
  "ClassDashboard",
  "TeacherStudentDetail",
  "ApiErrorCode",
  "ApiErrorBody",
  "TutorProtocolError",
  "TutorApi",
  "TUTOR_HTTP_ENDPOINTS",
];

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseEndpointMap(source) {
  const block = source.match(/export const TUTOR_HTTP_ENDPOINTS = \{([\s\S]*?)\}\s+as const/);
  if (!block) fail("TUTOR_HTTP_ENDPOINTS export is missing or malformed");

  return new Map(
    [...block[1].matchAll(/^\s*(\w+):\s*"([A-Z]+\s+[^\"]+)",?$/gm)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

function parseEndpointTable(document) {
  return new Map(
    [...document.matchAll(/^\| `(\w+)` \| `([A-Z]+\s+[^`]+)` \| `[^`]+` \|$/gm)].map(
      (match) => [match[1], match[2]],
    ),
  );
}

function jsonBlocks(document) {
  return [...document.matchAll(/```json\s*([\s\S]*?)```/g)].map((match, index) => {
    try {
      return JSON.parse(match[1]);
    } catch (error) {
      fail(`JSON example ${index + 1} is invalid: ${error.message}`);
    }
  });
}

function namedExample(document, heading) {
  const marker = `### ${heading}`;
  const start = document.indexOf(marker);
  if (start < 0) fail(`Missing example section: ${heading}`);
  const contentStart = document.indexOf("\n", start) + 1;
  const nextH3 = document.indexOf("\n### ", contentStart);
  const nextH2 = document.indexOf("\n## ", contentStart);
  const candidates = [nextH3, nextH2].filter((index) => index >= 0);
  const end = candidates.length ? Math.min(...candidates) : document.length;
  const block = document.slice(contentStart, end).match(/```json\s*([\s\S]*?)```/);
  if (!block) fail(`Missing JSON example under: ${heading}`);
  return JSON.parse(block[1]);
}

function verifyDisabledRewards(value, path = "$", found = []) {
  if (!value || typeof value !== "object") return found;
  if (Object.hasOwn(value, "rewards")) {
    const rewards = value.rewards;
    if (!rewards || rewards.account !== null || !Array.isArray(rewards.grants) || rewards.grants.length) {
      fail(`Enabled or malformed rewards at ${path}.rewards`);
    }
    found.push(`${path}.rewards`);
  }
  for (const [key, child] of Object.entries(value)) verifyDisabledRewards(child, `${path}.${key}`, found);
  return found;
}

const [tutorBytes, apiDocumentBytes] = await Promise.all([readFile(tutorPath), readFile(apiDocumentPath)]);
const tutorSource = tutorBytes.toString("utf8");
const apiDocument = apiDocumentBytes.toString("utf8");

if (sha256(tutorBytes) !== expectedHashes.tutor) fail("Imported tutor.ts differs from the verified v1.1.0 source");
if (sha256(apiDocumentBytes) !== expectedHashes.apiDocument) {
  fail("Imported frontend-api-contract.md differs from the verified v1.1.0 source");
}

const version = tutorSource.match(/TUTOR_CONTRACT_VERSION\s*=\s*"([^"]+)"/)?.[1];
if (version !== "1.1.0") fail(`Expected TUTOR_CONTRACT_VERSION 1.1.0, received ${version ?? "missing"}`);
if (!apiDocument.includes("PROPOSED v1.1.0")) fail("API document is not marked PROPOSED v1.1.0");

for (const name of requiredExports) {
  if (!new RegExp(`export\\s+(?:const|type|interface)\\s+${name}\\b`).test(tutorSource)) {
    fail(`Required export is missing: ${name}`);
  }
}

const sourceEndpoints = parseEndpointMap(tutorSource);
const documentedEndpoints = parseEndpointTable(apiDocument);
if (sourceEndpoints.size !== 17) fail(`Expected 17 TUTOR_HTTP_ENDPOINTS, found ${sourceEndpoints.size}`);
if (documentedEndpoints.size !== 17) fail(`Expected 17 documented endpoints, found ${documentedEndpoints.size}`);
let endpointNumber = 0;
for (const [name, endpoint] of sourceEndpoints) {
  endpointNumber += 1;
  if (documentedEndpoints.get(name) !== endpoint) {
    fail(`Endpoint mismatch for ${name}: tutor.ts=${endpoint}, document=${documentedEndpoints.get(name)}`);
  }
  if (!apiDocument.includes(`### ${endpointNumber}. ${name}`)) {
    fail(`Missing numbered endpoint section for ${name}`);
  }
}

const examples = jsonBlocks(apiDocument);
if (examples.length < 25) fail(`Expected at least 25 JSON examples, found ${examples.length}`);

const anonymous = namedExample(apiDocument, "anonymousAuth");
if (anonymous.authenticated !== false || anonymous.user !== null || anonymous.csrfToken !== null) {
  fail("anonymousAuth example violates AuthState");
}

const clarification = namedExample(apiDocument, "clarificationNeeded");
if (
  clarification.status !== "needs_clarification" ||
  clarification.session?.phase !== "clarification" ||
  clarification.mastery?.before !== clarification.mastery?.after
) {
  fail("clarificationNeeded example violates clarification invariants");
}

for (const name of ["abandonedFromAnswering", "abandonedFromClarification", "revisionScenarioREnded"]) {
  const abandoned = namedExample(apiDocument, name);
  if (
    abandoned.status !== "abandoned" ||
    abandoned.phase !== "abandoned" ||
    abandoned.currentQuestion !== null ||
    abandoned.summary !== null ||
    !abandoned.endedAt
  ) {
    fail(`${name} violates abandoned-session invariants`);
  }
}

const multipleChoice = namedExample(apiDocument, "multipleChoiceQuestion");
const multipleChoiceSubmission = namedExample(apiDocument, "multipleChoiceSubmission");
if (
  multipleChoice.format !== "multiple_choice" ||
  !multipleChoice.options.some((option) => option.id === multipleChoiceSubmission.selectedOptionId) ||
  multipleChoiceSubmission.finalAnswerText !== ""
) {
  fail("Multiple-choice examples violate authoritative-answer rules");
}

const rewardLocations = examples.flatMap((example, index) =>
  verifyDisabledRewards(example, `$example[${index + 1}]`),
);
if (!rewardLocations.length) fail("No disabled-reward examples were found");

const routeFiles = {
  getCurrentUser: "auth/me/route.ts",
  signIn: "auth/sign-in/route.ts",
  signOut: "auth/sign-out/route.ts",
  saveStudentProfile: "me/profile/route.ts",
  getConcepts: "concepts/route.ts",
  startSession: "sessions/route.ts",
  getSession: "sessions/[sessionId]/route.ts",
  submitAttempt: "sessions/[sessionId]/attempts/route.ts",
  advanceSession: "sessions/[sessionId]/advance/route.ts",
  endSession: "sessions/[sessionId]/end/route.ts",
  getStudentDashboard: "student/dashboard/route.ts",
  getRevisionQueue: "revision/route.ts",
  getProgress: "progress/route.ts",
  getAttemptHistory: "attempts/route.ts",
  getClasses: "teacher/classes/route.ts",
  getClassDashboard: "teacher/classes/[classId]/route.ts",
  getStudentDetail: "teacher/classes/[classId]/students/[studentId]/route.ts",
};
let implementedRoutes = 0;
for (const [name, relative] of Object.entries(routeFiles)) {
  try { await readFile(new URL(relative, routeRoot)); implementedRoutes += 1; }
  catch { console.log(`Route not implemented yet: ${name}`); }
}

console.log(`Contract verified: PROPOSED v${version}`);
console.log("Authoritative hashes verified: tutor.ts + frontend-api-contract.md");
console.log(`Required exports verified: ${requiredExports.length}`);
console.log(`Endpoint coverage verified: ${sourceEndpoints.size}/17`);
console.log(`JSON examples parsed: ${examples.length}`);
console.log(`Disabled reward shapes verified: ${rewardLocations.length}`);
console.log(`Tutor route files present: ${implementedRoutes}/17 (health excluded)`);
