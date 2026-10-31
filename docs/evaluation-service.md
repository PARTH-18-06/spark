# Groq evaluation service

`src/lib/server/evaluation` is a server-only, persistence-free evaluator for
the later session workflow. The caller supplies a trusted question assignment
and a private rubric loaded from backend storage; browser payloads cannot supply
the correct answer, rubric, identity, or concept. The evaluator returns only
contract-compatible evaluation fields. It does not write attempts, mastery,
misconceptions, revision items, or rewards.

## Grading precedence

Multiple-choice answers are compared to the private rubric’s selected option.
Numeric answers are parsed without `eval` using a strict finite-number parser,
normalized supported units, and the rubric’s inclusive absolute tolerance.
Expressions without a numeric rubric are not interpreted locally. If a
deterministic answer check exists, its final-answer correctness overrides Groq;
Groq only supplies reasoning status, feedback, and a validated misconception.
The explicit `allowDeterministicOnly` rubric flag permits a deterministic result
only when no reasoning text was submitted. Otherwise Groq is required.

An AI misconception must be in the server catalog, be listed as applicable by
the rubric, and include a nonempty exact excerpt from the submitted reasoning.
The server supplies the catalog label; model-provided labels are never trusted.
Unexpected codes are rejected rather than invented.

## Groq integration and failure behavior

The production adapter uses `GROQ_EVALUATION_MODEL`, strict JSON-schema
structured outputs, `GROQ_EVALUATION_TIMEOUT_MS`, and at most
`GROQ_EVALUATION_MAX_RETRIES` (capped at two). SDK retries are disabled so the
service owns the total deadline. Retry-After is honored only if it fits inside
that deadline. Authentication/configuration failures are not retried.
The configured evaluation model must be one of Groq’s documented strict-output
models (`openai/gpt-oss-20b`, `openai/gpt-oss-120b`, or `qwen/qwen3.8-27b` at
this implementation point); unsupported model IDs fail configuration rather
than silently falling back to JSON mode.

Malformed JSON, unknown fields, invalid enums, oversized text, rubric leakage,
unsupported misconception codes, and fabricated evidence are rejected. Provider
timeouts, rate limits, and transient outages map to retryable `AI_UNAVAILABLE`
errors through `EvaluationService.toApiError`; authentication/configuration
failures remain non-retryable. No successful evaluation is manufactured after a
provider failure.

Student text is serialized as quoted untrusted data, and prompt-injection text
cannot change the system grading instructions or response schema. Credentials,
student identity, and unrelated learning history are never included.

The adapter follows Groq’s official [API reference](https://console.groq.com/docs/api-reference),
[Structured Outputs](https://console.groq.com/docs/structured-outputs), and the
installed SDK’s documented [timeouts and retries](https://github.com/groq/groq-typescript#timeouts).

## Verification boundary

Tests inject an evaluation provider and an SDK-shaped fake client; they require
no Groq key or network. They cover deterministic answer precedence, tolerance
and units, reasoning/misconceptions, prompt injection, malformed output,
timeouts, rate limits, authentication errors, retry exhaustion, and no
persistence side effects. No live Groq model was called on this workstation.
