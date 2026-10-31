import { readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  attemptHistoryItemSchema,
  classDashboardSchema,
  classSummarySchema,
  pageSchema,
  progressResponseSchema,
  questionSchema,
  revisionQueueSchema,
  studentDashboardSchema,
  teacherStudentDetailSchema,
} from "@/lib/server/contracts/tutor-schemas";

const migrationFiles = [
  "../supabase/migrations/20261031000100_spark_foundation.sql",
  "../supabase/migrations/20261031000200_security_and_invariants.sql",
  "../supabase/migrations/20261031000300_auth_and_onboarding.sql",
  "../supabase/migrations/20261031000400_learning_engine_invariants.sql",
  "../supabase/migrations/20261031000500_learning_idempotency_claims.sql",
  "../supabase/migrations/20261031000600_learning_session_rpc.sql",
  "../supabase/migrations/20261031000700_read_models_rpc.sql",
];
const seedFile = "../supabase/seed.sql";

const teacherId = "11111111-1111-4111-8111-111111111111";
const studentNewId = "22222222-2222-4222-8222-222222222222";
const studentReturningId = "33333333-3333-4333-8333-333333333333";
const outsideStudentId = "44444444-4444-4444-8444-444444444444";
const classId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const outsideClassId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sessionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const assignmentOneId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const assignmentTwoId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

let database: PGlite;

async function queryRows<Row extends Record<string, unknown>>(sql: string): Promise<Row[]> {
  const result = await database.query<Row>(sql);
  return result.rows;
}

async function asAuthenticated<Row extends Record<string, unknown>>(
  userId: string,
  sql: string,
): Promise<Row[]> {
  await database.exec("reset role");
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await database.exec("set role authenticated");
  try {
    return await queryRows<Row>(sql);
  } finally {
    await database.exec("reset role");
  }
}

beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text unique,
      created_at timestamptz not null default now()
    );
    create function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);

  for (const file of migrationFiles) {
    await database.exec(readFileSync(new URL(file, import.meta.url), "utf8"));
  }
  await database.exec(readFileSync(new URL(seedFile, import.meta.url), "utf8"));

  await database.exec(`
    insert into auth.users (id, email) values
      ('${teacherId}', 'teacher@example.test'),
      ('${studentNewId}', 'new.student@example.test'),
      ('${studentReturningId}', 'returning.student@example.test'),
      ('${outsideStudentId}', 'outside.student@example.test');

    insert into public.user_roles (user_id, role) values
      ('${teacherId}', 'teacher'),
      ('${studentNewId}', 'student'),
      ('${studentReturningId}', 'student'),
      ('${outsideStudentId}', 'student');

    insert into public.student_profiles
      (user_id, display_name, time_zone, onboarding_complete)
    values
      ('${studentNewId}', 'New Student', 'Asia/Calcutta', false),
      ('${studentReturningId}', 'Returning Student', 'Asia/Calcutta', true),
      ('${outsideStudentId}', 'Outside Student', 'Asia/Calcutta', true);

    insert into public.classes (id, stable_code, name) values
      ('${classId}', 'class-10a', 'Class 10A'),
      ('${outsideClassId}', 'outside-class', 'Outside Class');
    insert into public.class_teachers (class_id, teacher_user_id)
      values ('${classId}', '${teacherId}');
    insert into public.class_students (class_id, student_user_id) values
      ('${classId}', '${studentNewId}'),
      ('${classId}', '${studentReturningId}'),
      ('${outsideClassId}', '${outsideStudentId}');

    begin;
    set constraints all deferred;
    insert into public.tutor_sessions
      (id, student_user_id, mode, concept_id, status, phase, current_assignment_id, target_question_count)
    values
      ('${sessionId}', '${studentNewId}', 'practice', 'resistance-and-ohms-law',
       'active', 'answering', '${assignmentOneId}', 2);
    insert into public.session_question_assignments
      (id, session_id, question_bank_id, question_content_version, rubric_version, ordinal,
       concept_id, format, difficulty, public_prompt, hint, expected_unit, options_snapshot)
    values
      ('${assignmentOneId}', '${sessionId}', 'electricity_ohm_medium_01', 1, 1, 1,
       'resistance-and-ohms-law', 'free_response', 'medium',
       'A device draws 0.50 A when connected to 6 V. Calculate its resistance.',
       'Use R = V/I.', 'ohm', null);
    commit;

    insert into public.session_question_assignments
      (id, session_id, question_bank_id, question_content_version, rubric_version, ordinal,
       concept_id, format, difficulty, public_prompt, hint, expected_unit, options_snapshot)
    values
      ('${assignmentTwoId}', '${sessionId}', 'electricity_ohm_easy_01', 1, 1, 2,
       'resistance-and-ohms-law', 'multiple_choice', 'easy',
       'A 4 ohm resistor is connected across 12 V. What current flows?',
       'Use I = V/R.', 'A',
       '[{"id":"a","text":"0.33 A"},{"id":"b","text":"3 A"}]');
  `);
}, 30_000);

afterAll(async () => {
  await database.close();
});

describe("versioned migration constraints", () => {
  it("enforces one active session per student", async () => {
    await expect(
      database.exec(`
        insert into public.tutor_sessions
          (student_user_id, mode, concept_id, status, phase, current_assignment_id)
        values
          ('${studentNewId}', 'practice', 'resistance-and-ohms-law', 'active', 'answering',
           '99999999-9999-4999-8999-999999999999');
      `),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("enforces terminal session field combinations", async () => {
    await expect(
      database.exec(`
        insert into public.tutor_sessions
          (student_user_id, mode, concept_id, status, phase, summary_snapshot, ended_at)
        values
          ('${outsideStudentId}', 'practice', 'electric-power', 'completed', 'completed', null, now());
      `),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces one mastery row and bounded mastery", async () => {
    await database.exec(`
      insert into public.concept_mastery
        (student_user_id, concept_id, mastery, learning_state, evidence_count, last_assessed_at)
      values
        ('${studentNewId}', 'electric-current-and-charge', 0.5, 'developing', 1, now());
    `);
    await expect(
      database.exec(`
        insert into public.concept_mastery
          (student_user_id, concept_id, mastery, learning_state, evidence_count, last_assessed_at)
        values
          ('${studentNewId}', 'electric-current-and-charge', 0.7, 'developing', 2, now());
      `),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      database.exec(`
        insert into public.concept_mastery
          (student_user_id, concept_id, mastery, learning_state, evidence_count, last_assessed_at)
        values
          ('${studentNewId}', 'electric-power', 1.1, 'strong', 1, now());
      `),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("uniquely scopes idempotency replay records", async () => {
    const insert = `
      insert into public.learning_idempotency
        (user_id, operation, request_path, idempotency_key, payload_hash)
      values
        ('${studentNewId}', 'submitAttempt', '/api/v1/sessions/${sessionId}/attempts',
         'same-key', repeat('a', 64));
    `;
    await database.exec(insert);
    await expect(database.exec(insert)).rejects.toMatchObject({ code: "23505" });
  });

  it("requires clarification links to use the same assigned question", async () => {
    const firstAttemptId = "12121212-1212-4212-8212-121212121212";
    await database.exec(`
      insert into public.attempts
        (id, session_id, assignment_id, student_user_id, concept_id,
         final_answer_text, reasoning_text, selected_option_id, status,
         final_answer_correct, reasoning_status, feedback, clarification_prompt,
         mastery_before, mastery_after, evidence_count_before, evidence_count_after)
      values
        ('${firstAttemptId}', '${sessionId}', '${assignmentOneId}', '${studentNewId}',
         'resistance-and-ohms-law', 'It changes.', 'It may rise or fall.', null,
         'needs_clarification', null, 'unclear', 'Please clarify.',
         'Does current rise or fall at fixed resistance?', null, null, 0, 0);
    `);
    await expect(
      database.exec(`
        insert into public.attempts
          (session_id, assignment_id, student_user_id, concept_id, clarification_of_attempt_id,
           final_answer_text, reasoning_text, selected_option_id, status,
           final_answer_correct, reasoning_status, feedback,
           mastery_before, mastery_after, evidence_count_before, evidence_count_after)
        values
          ('${sessionId}', '${assignmentTwoId}', '${studentNewId}', 'resistance-and-ohms-law',
           '${firstAttemptId}', '', 'I = V/R.', 'b', 'correct', true, 'sound', 'Correct.',
           null, 0.6, 0, 1);
      `),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("preserves immutable assignment snapshots", async () => {
    await expect(
      database.exec(`
        update public.session_question_assignments
        set public_prompt = 'Changed after assignment'
        where id = '${assignmentOneId}';
      `),
    ).rejects.toMatchObject({ code: "55000" });
  });
});

describe("RLS and grants", () => {
  it("prevents cross-student reads", async () => {
    const rows = await asAuthenticated<{ user_id: string }>(
      studentNewId,
      `select user_id from public.student_profiles where user_id = '${studentReturningId}'`,
    );
    expect(rows).toHaveLength(0);
  });

  it("allows a teacher to read only assigned roster students", async () => {
    const assigned = await asAuthenticated<{ user_id: string }>(
      teacherId,
      "select user_id from public.student_profiles order by user_id",
    );
    expect(assigned.map(({ user_id }) => user_id)).toEqual([studentNewId, studentReturningId]);
    const outside = await asAuthenticated<{ user_id: string }>(
      teacherId,
      `select user_id from public.student_profiles where user_id = '${outsideStudentId}'`,
    );
    expect(outside).toHaveLength(0);
  });

  it("denies browser access to private rubrics and idempotency records", async () => {
    await expect(
      asAuthenticated(studentNewId, "select * from public.question_rubrics limit 1"),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asAuthenticated(studentNewId, "select * from public.learning_idempotency limit 1"),
    ).rejects.toThrow(/permission denied/i);
  });

  it("allows only safe assignment columns for the owning student", async () => {
    const own = await asAuthenticated<{ id: string; public_prompt: string }>(
      studentNewId,
      "select id, public_prompt from public.session_question_assignments order by ordinal",
    );
    expect(own).toHaveLength(2);
    const otherStudent = await asAuthenticated<{ id: string }>(
      studentReturningId,
      `select id from public.session_question_assignments where session_id = '${sessionId}'`,
    );
    expect(otherStudent).toHaveLength(0);
    await expect(
      asAuthenticated(
        studentNewId,
        "select question_bank_id, rubric_version from public.session_question_assignments limit 1",
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("denies student role escalation and privileged learning writes", async () => {
    await expect(
      asAuthenticated(
        studentNewId,
        `insert into public.user_roles (user_id, role) values ('${studentNewId}', 'teacher') returning user_id`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asAuthenticated(
        studentNewId,
        `update public.concept_mastery set mastery = 1 where student_user_id = '${studentNewId}' returning concept_id`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("backend auth and onboarding migration", () => {
  it("atomically saves only a provisioned student profile and directory name", async () => {
    const rows = await queryRows<{
      user_id: string; display_name: string; onboarding_complete: boolean; exam_date: string;
    }>(`
      select (public.save_student_profile(
        '${studentNewId}', '  Updated Student  ', 'class-10-physics-electricity',
        '2026-12-15', 'Asia/Kolkata'
      )).*;
    `);
    expect(rows[0]).toMatchObject({
      user_id: studentNewId,
      display_name: "Updated Student",
      onboarding_complete: true,
    });
    const directory = await queryRows<{ display_name: string }>(
      `select display_name from public.user_directory where user_id = '${studentNewId}'`,
    );
    expect(directory[0]?.display_name).toBe("Updated Student");
    await expect(database.query(
      "select public.save_student_profile($1, $2, $3, null, $4)",
      [teacherId, "Teacher", "class-10-physics-electricity", "Asia/Kolkata"],
    )).rejects.toMatchObject({ code: "42501" });
  });

  it("enforces login limits atomically in PostgreSQL and supports explicit clearing", async () => {
    const key = "a".repeat(64);
    const consume = () => queryRows<{ allowed: boolean; retry_after_seconds: number }>(
      `select * from public.consume_auth_login_attempt('${key}', 2, 900, 120)`,
    );
    expect((await consume())[0]).toEqual({ allowed: true, retry_after_seconds: 0 });
    expect((await consume())[0]).toEqual({ allowed: true, retry_after_seconds: 0 });
    expect((await consume())[0]).toEqual({ allowed: false, retry_after_seconds: 120 });
    await database.exec(`select public.clear_auth_login_attempt('${key}')`);
    expect((await consume())[0]).toEqual({ allowed: true, retry_after_seconds: 0 });
  });

  it("keeps backend sessions, directory writes, and limiter state unavailable to browser roles", async () => {
    for (const sql of [
      "select * from public.backend_auth_sessions",
      "update public.user_directory set display_name = 'Escalated' returning user_id",
      "select * from public.auth_login_rate_limits",
    ]) {
      await expect(asAuthenticated(studentNewId, sql)).rejects.toThrow(/permission denied/i);
    }
  });
});

describe("learning-engine exactly-once invariants", () => {
  const gradedAttemptId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  it("prevents duplicate graded evidence for one assignment", async () => {
    await database.exec(`
      insert into public.attempts
        (id, session_id, assignment_id, student_user_id, concept_id,
         final_answer_text, reasoning_text, status, final_answer_correct,
         reasoning_status, feedback, evidence_count_before, evidence_count_after)
      values
        ('${gradedAttemptId}', '${sessionId}', '${assignmentOneId}', '${studentNewId}', 'resistance-and-ohms-law',
         '12 ohm', 'R = V/I', 'incorrect', false, 'unclear', 'Try the ratio again.', 0, 1);
    `);
    await expect(database.exec(`
      insert into public.attempts
        (id, session_id, assignment_id, student_user_id, concept_id,
         final_answer_text, reasoning_text, status, final_answer_correct,
         reasoning_status, feedback, evidence_count_before, evidence_count_after)
      values
        ('99999999-9999-4999-8999-999999999999', '${sessionId}', '${assignmentOneId}', '${studentNewId}', 'resistance-and-ohms-law',
         '6 ohm', 'R = I/V', 'incorrect', false, 'misconception', 'Try the ratio again.', 0, 1);
    `)).rejects.toMatchObject({ code: "23505" });
  });

  it("prevents duplicate revision rows for one source attempt", async () => {
    await database.exec(`
      insert into public.revision_items
        (id, student_user_id, concept_id, status, due_at, reason, source_attempt_id)
      values
        ('88888888-8888-4888-8888-888888888888', '${studentNewId}', 'resistance-and-ohms-law',
         'due', now(), 'Incorrect ratio', '${gradedAttemptId}');
    `);
    await expect(database.exec(`
      insert into public.revision_items
        (id, student_user_id, concept_id, status, due_at, reason, source_attempt_id)
      values
        ('77777777-7777-4777-8777-777777777777', '${studentNewId}', 'resistance-and-ohms-law',
         'due', now(), 'Replay', '${gradedAttemptId}');
    `)).rejects.toMatchObject({ code: "23505" });
  });
});

describe("learning mutation claim fencing", () => {
  it("replays successes, rejects edited payloads, and leases in-progress work", async () => {
    const path = "/api/v1/sessions";
    const first = await queryRows<{ result: { kind: string; token: string } }>(`select public.spark_claim_learning_mutation('${studentReturningId}', 'startSession', '${path}', 'claim-1', repeat('a', 64)) as result`);
    expect(first[0]!.result.kind).toBe("new");
    const token = first[0]!.result.token;
    const inProgress = await queryRows<{ result: { kind: string } }>(`select public.spark_claim_learning_mutation('${studentReturningId}', 'startSession', '${path}', 'claim-1', repeat('a', 64)) as result`);
    expect(inProgress[0]!.result.kind).toBe("in_progress");
    await database.query("select public.spark_complete_learning_mutation($1::uuid, 201, $2::jsonb)", [token, JSON.stringify({ id: "replayed" })]);
    const replay = await queryRows<{ result: { kind: string; status: number; body: { id: string } } }>(`select public.spark_claim_learning_mutation('${studentReturningId}', 'startSession', '${path}', 'claim-1', repeat('a', 64)) as result`);
    expect(replay[0]!.result).toEqual({ kind: "replay", token, status: 201, body: { id: "replayed" } });
    await expect(database.query(`select public.spark_claim_learning_mutation('${studentReturningId}', 'startSession', '${path}', 'claim-1', repeat('b', 64))`)).rejects.toMatchObject({ code: "P0001" });
  });

  it("executes production start, reload, finalize, replay, and completion RPCs atomically", async () => {
    const concepts = await database.query<{ result: Array<{ conceptId: string }> }>("select public.spark_get_concept_progress($1::uuid) as result", [studentReturningId]);
    expect(concepts.rows[0]!.result).toHaveLength(8);
    const assignmentId = "12345678-1234-4123-8123-123456789012";
    const assignments = [{
      id: assignmentId,
      bankQuestionId: "electricity_ohm_medium_01",
      question: { id: assignmentId, conceptId: "resistance-and-ohms-law", format: "free_response", prompt: "Calculate resistance.", difficulty: "medium", hint: "Use R = V/I.", expectedUnit: "ohm" },
      rubric: { questionId: assignmentId, rubricVersion: 1, correctAnswer: { numericValue: 12, unit: "ohm" }, workedSolution: "private solution", reasoningRubric: { required: ["R = V/I"] }, numericAnswer: 12, numericTolerance: 0.01, expectedUnit: "ohm", supportedMisconceptionCodes: [] },
    }];
    const claim = await database.query<{ result: { kind: string; token: string } }>("select public.spark_claim_learning_mutation($1::uuid,'startSession',$2,'rpc-start-1',repeat('c',64)) as result", [studentReturningId, "/api/v1/sessions"]);
    const token = claim.rows[0]!.result.token;
    const started = await database.query<{ result: { id: string; phase: string; currentQuestion: { id: string } } }>("select public.spark_start_learning_session($1::uuid,$2::public.spark_session_mode,$3,$4::jsonb,$5::jsonb,$6::uuid) as result", [studentReturningId, "practice", "resistance-and-ohms-law", JSON.stringify(assignments), "[]", token]);
    expect(started.rows[0]!.result.phase).toBe("answering");
    const session = started.rows[0]!.result;
    const loaded = await database.query<{ result: { id: string; question: { id: string }; rubric: { questionId: string } } }>("select public.spark_get_session_assignment($1::uuid,$2::uuid,$3::uuid) as result", [studentReturningId, session.id, assignmentId]);
    expect(loaded.rows[0]!.result.rubric.questionId).toBe(assignmentId);
    const attemptClaim = await database.query<{ result: { token: string } }>("select public.spark_claim_learning_mutation($1::uuid,'submitAttempt',$2,'rpc-attempt-1',repeat('d',64)) as result", [studentReturningId, `/api/v1/sessions/${session.id}/attempts`]);
    const attempt = await database.query<{ result: { session: { phase: string; version: number }; status: string } }>("select public.spark_finalize_learning_attempt($1::uuid,$2::uuid,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::timestamptz,$8::uuid) as result", [studentReturningId, session.id, 1, JSON.stringify(loaded.rows[0]!.result), JSON.stringify({ finalAnswerText: "12 ohm", reasoningText: "R = V/I", selectedOptionId: null, clarificationOfAttemptId: null }), JSON.stringify({ status: "correct", finalAnswerCorrect: true, reasoningStatus: "sound", feedback: "Correct.", misconception: null, clarificationPrompt: null }), "2026-10-31T09:01:00.000Z", attemptClaim.rows[0]!.result.token]);
    expect(attempt.rows[0]!.result.status).toBe("correct");
    await database.query("select public.spark_complete_learning_mutation($1::uuid,200,$2::jsonb)", [attemptClaim.rows[0]!.result.token, JSON.stringify(attempt.rows[0]!.result)]);
    expect(attempt.rows[0]!.result.session.phase).toBe("feedback");
    const replay = await database.query<{ result: { kind: string; status: number; body: { status: string } } }>("select public.spark_claim_learning_mutation($1::uuid,'submitAttempt',$2,'rpc-attempt-1',repeat('d',64)) as result", [studentReturningId, `/api/v1/sessions/${session.id}/attempts`]);
    expect(replay.rows[0]!.result).toMatchObject({ kind: "replay", status: 200, body: { status: "correct" } });
    const advanceClaim = await database.query<{ result: { token: string } }>("select public.spark_claim_learning_mutation($1::uuid,'advanceSession',$2,'rpc-advance-1',repeat('e',64)) as result", [studentReturningId, `/api/v1/sessions/${session.id}/advance`]);
    const completed = await database.query<{ result: { status: string; phase: string; summary: unknown } }>("select public.spark_advance_learning_session($1::uuid,$2::uuid,$3,$4::uuid) as result", [studentReturningId, session.id, 2, advanceClaim.rows[0]!.result.token]);
    expect(completed.rows[0]!.result).toMatchObject({ status: "completed", phase: "completed" });
    const revision = await database.query<{ result: { items: unknown[] } }>("select public.spark_get_revision_queue($1::uuid) as result", [studentReturningId]);
    const progress = await database.query<{ result: { concepts: unknown[]; sessions: { items: unknown[] }; rewards: { account: null; grants: [] } } }>("select public.spark_get_progress($1::uuid,0,20) as result", [studentReturningId]);
    const history = await database.query<{ result: { items: unknown[]; nextCursor: string | null } }>("select public.spark_get_attempt_history($1::uuid,0,20) as result", [studentReturningId]);
    const dashboard = await database.query<{ result: { profile: { onboardingComplete: boolean }; recentSessions: unknown[] } }>("select public.spark_get_student_dashboard($1::uuid) as result", [studentReturningId]);
    const classes = await database.query<{ result: unknown[] }>("select public.spark_get_teacher_classes($1::uuid) as result", [teacherId]);
    const classDashboard = await database.query<{ result: { students: unknown[] } }>("select public.spark_get_class_dashboard($1::uuid,$2::uuid) as result", [teacherId, classId]);
    const detail = await database.query<{ result: { classId: string; recentAttempts: unknown[] } }>("select public.spark_get_student_detail($1::uuid,$2::uuid,$3::uuid) as result", [teacherId, classId, studentReturningId]);
    expect(revision.rows[0]!.result.items.length).toBe(1);
    expect(progress.rows[0]!.result.concepts).toHaveLength(8);
    expect(progress.rows[0]!.result.sessions.items.length).toBe(1);
    expect(history.rows[0]!.result.items.length).toBe(1);
    expect(dashboard.rows[0]!.result.profile.onboardingComplete).toBe(true);
    expect(dashboard.rows[0]!.result.recentSessions.length).toBe(1);
    expect(classes.rows[0]!.result.length).toBe(1);
    expect(classDashboard.rows[0]!.result.students.length).toBe(2);
    expect(detail.rows[0]!.result).toMatchObject({ classId, recentAttempts: expect.any(Array) });
    revisionQueueSchema.parse(revision.rows[0]!.result);
    progressResponseSchema.parse(progress.rows[0]!.result);
    pageSchema(attemptHistoryItemSchema).parse(history.rows[0]!.result);
    studentDashboardSchema.parse(dashboard.rows[0]!.result);
    const parsedClasses = classes.rows[0]!.result;
    parsedClasses.forEach((row) => classSummarySchema.parse(row));
    classDashboardSchema.parse(classDashboard.rows[0]!.result);
    teacherStudentDetailSchema.parse(detail.rows[0]!.result);
    const persisted = await queryRows<{ attempts: number; mastery: number; revisions: number }>(`select (select count(*)::int from public.attempts where session_id = '${session.id}') attempts, (select count(*)::int from public.concept_mastery where student_user_id = '${studentReturningId}' and concept_id = 'resistance-and-ohms-law') mastery, (select count(*)::int from public.revision_items where student_user_id = '${studentReturningId}' and source_attempt_id is not null) revisions`);
    expect(persisted[0]).toEqual({ attempts: 1, mastery: 1, revisions: 1 });
    const outside = await database.query<{ result: unknown }>("select public.spark_get_session_snapshot($1::uuid,$2::uuid) as result", [outsideStudentId, session.id]);
    expect(outside.rows[0]!.result).toBeNull();
    // Immutable assignment/attempt history intentionally remains; remove only
    // derived queue/mastery fixtures so later seed-repeatability checks are
    // independent of this integration case.
    await database.exec(`delete from public.revision_items where student_user_id = '${studentReturningId}'; delete from public.concept_mastery where student_user_id = '${studentReturningId}'; delete from public.learning_idempotency where user_id = '${studentReturningId}' and idempotency_key like 'rpc-%';`);
  });

  it("recovers an expired claim and fences stale finalization", async () => {
    const path = "/api/v1/sessions";
    const first = await database.query<{ result: { token: string } }>("select public.spark_claim_learning_mutation($1::uuid,'startSession',$2,'claim-expired',repeat('f',64)) as result", [outsideStudentId, path]);
    await database.query("update public.learning_idempotency set claim_expires_at = now() - interval '1 second' where claim_token = $1::uuid", [first.rows[0]!.result.token]);
    const recovered = await database.query<{ result: { kind: string; token: string } }>("select public.spark_claim_learning_mutation($1::uuid,'startSession',$2,'claim-expired',repeat('f',64)) as result", [outsideStudentId, path]);
    expect(recovered.rows[0]!.result.kind).toBe("new");
    expect(recovered.rows[0]!.result.token).not.toBe(first.rows[0]!.result.token);
    await expect(database.query("select public.spark_complete_learning_mutation($1::uuid,201,'{}'::jsonb)", [first.rows[0]!.result.token])).rejects.toMatchObject({ code: "P0001" });
  });

  it("keeps lifecycle RPCs unavailable to browser roles", async () => {
    const rows = await queryRows<{ start_allowed: boolean; finalize_allowed: boolean; snapshot_allowed: boolean }>(`select has_function_privilege('authenticated', 'public.spark_start_learning_session(uuid,public.spark_session_mode,text,jsonb,jsonb,uuid)', 'execute') as start_allowed, has_function_privilege('authenticated', 'public.spark_finalize_learning_attempt(uuid,uuid,integer,jsonb,jsonb,jsonb,timestamptz,uuid)', 'execute') as finalize_allowed, has_function_privilege('authenticated', 'public.spark_get_session_snapshot(uuid,uuid)', 'execute') as snapshot_allowed`);
    expect(rows[0]).toEqual({ start_allowed: false, finalize_allowed: false, snapshot_allowed: false });
  });

  it("keeps read-model RPCs unavailable to browser roles", async () => {
    const rows = await queryRows<{
      dashboard_allowed: boolean;
      revision_allowed: boolean;
      progress_allowed: boolean;
      history_allowed: boolean;
      classes_allowed: boolean;
      class_dashboard_allowed: boolean;
      detail_allowed: boolean;
    }>(`select
      has_function_privilege('authenticated', 'public.spark_get_student_dashboard(uuid)', 'execute') as dashboard_allowed,
      has_function_privilege('authenticated', 'public.spark_get_revision_queue(uuid)', 'execute') as revision_allowed,
      has_function_privilege('authenticated', 'public.spark_get_progress(uuid,integer,integer)', 'execute') as progress_allowed,
      has_function_privilege('authenticated', 'public.spark_get_attempt_history(uuid,integer,integer)', 'execute') as history_allowed,
      has_function_privilege('authenticated', 'public.spark_get_teacher_classes(uuid)', 'execute') as classes_allowed,
      has_function_privilege('authenticated', 'public.spark_get_class_dashboard(uuid,uuid)', 'execute') as class_dashboard_allowed,
      has_function_privilege('authenticated', 'public.spark_get_student_detail(uuid,uuid,uuid)', 'execute') as detail_allowed`);
    expect(rows[0]).toEqual({ dashboard_allowed: false, revision_allowed: false, progress_allowed: false, history_allowed: false, classes_allowed: false, class_dashboard_allowed: false, detail_allowed: false });
  });

  it("keeps clarification side-effect free and rejects stale versions inside finalization", async () => {
    const assignmentId = "22345678-1234-4123-8123-123456789012";
    const assignments = [{ id: assignmentId, bankQuestionId: "electricity_ohm_medium_01", question: { id: assignmentId, conceptId: "resistance-and-ohms-law", format: "free_response", prompt: "Calculate resistance.", difficulty: "medium" }, rubric: { questionId: assignmentId, rubricVersion: 1, correctAnswer: { numericValue: 12 }, workedSolution: "private", reasoningRubric: { required: ["R = V/I"] }, numericAnswer: 12, numericTolerance: 0.01, expectedUnit: "ohm", supportedMisconceptionCodes: [] } }];
    const startClaim = await database.query<{ result: { token: string } }>("select public.spark_claim_learning_mutation($1::uuid,'startSession','/api/v1/sessions','clar-start',repeat('1',64)) as result", [outsideStudentId]);
    const started = await database.query<{ result: { id: string } }>("select public.spark_start_learning_session($1::uuid,$2::public.spark_session_mode,$3,$4::jsonb,$5::jsonb,$6::uuid) as result", [outsideStudentId, "practice", "resistance-and-ohms-law", JSON.stringify(assignments), "[]", startClaim.rows[0]!.result.token]);
    const sessionId = started.rows[0]!.result.id;
    const assignment = await database.query<{ result: unknown }>("select public.spark_get_session_assignment($1::uuid,$2::uuid,$3::uuid) as result", [outsideStudentId, sessionId, assignmentId]);
    const claim = await database.query<{ result: { token: string } }>("select public.spark_claim_learning_mutation($1::uuid,'submitAttempt',$2,'clar-attempt',repeat('2',64)) as result", [outsideStudentId, `/api/v1/sessions/${sessionId}/attempts`]);
    const clarification = await database.query<{ result: { status: string; session: { phase: string; version: number; progress: { answeredCount: number } }; mastery: { before: unknown; after: unknown; evidenceCount: number } } }>("select public.spark_finalize_learning_attempt($1::uuid,$2::uuid,1,$3::jsonb,$4::jsonb,$5::jsonb,$6::timestamptz,$7::uuid) as result", [outsideStudentId, sessionId, JSON.stringify(assignment.rows[0]!.result), JSON.stringify({ finalAnswerText: "It changes", reasoningText: "I am unsure", selectedOptionId: null, clarificationOfAttemptId: null }), JSON.stringify({ status: "needs_clarification", finalAnswerCorrect: null, reasoningStatus: "unclear", feedback: "Please clarify.", misconception: null, clarificationPrompt: "Explain the ratio." }), "2026-10-31T09:05:00.000Z", claim.rows[0]!.result.token]);
    expect(clarification.rows[0]!.result).toMatchObject({ status: "needs_clarification", mastery: { before: null, after: null, evidenceCount: 0 }, session: { phase: "clarification", version: 2, progress: { answeredCount: 0 } } });
    const counts = await queryRows<{ attempts: number; mastery: number }>(`select (select count(*)::int from public.attempts where session_id = '${sessionId}') attempts, (select count(*)::int from public.concept_mastery where student_user_id = '${outsideStudentId}' and concept_id = 'resistance-and-ohms-law') mastery`);
    expect(counts[0]).toEqual({ attempts: 1, mastery: 0 });
    const staleClaim = await database.query<{ result: { token: string } }>("select public.spark_claim_learning_mutation($1::uuid,'submitAttempt',$2,'clar-stale',repeat('3',64)) as result", [outsideStudentId, `/api/v1/sessions/${sessionId}/attempts`]);
    await expect(database.query("select public.spark_finalize_learning_attempt($1::uuid,$2::uuid,1,$3::jsonb,$4::jsonb,$5::jsonb,$6::timestamptz,$7::uuid)", [outsideStudentId, sessionId, JSON.stringify(assignment.rows[0]!.result), JSON.stringify({ finalAnswerText: "Changed", reasoningText: "Changed", selectedOptionId: null, clarificationOfAttemptId: null }), JSON.stringify({ status: "correct", finalAnswerCorrect: true, reasoningStatus: "sound", feedback: "Should not commit.", misconception: null, clarificationPrompt: null }), "2026-10-31T09:06:00.000Z", staleClaim.rows[0]!.result.token])).rejects.toMatchObject({ code: "P0001" });
    const afterStale = await queryRows<{ attempts: number; version: number }>(`select (select count(*)::int from public.attempts where session_id = '${sessionId}') attempts, (select version from public.tutor_sessions where id = '${sessionId}') version`);
    expect(afterStale[0]).toEqual({ attempts: 1, version: 2 });
    const endClaim = await database.query<{ result: { token: string } }>("select public.spark_claim_learning_mutation($1::uuid,'endSession',$2,'clar-end',repeat('4',64)) as result", [outsideStudentId, `/api/v1/sessions/${sessionId}/end`]);
    const ended = await database.query<{ result: { status: string; phase: string; summary: unknown } }>("select public.spark_end_learning_session($1::uuid,$2::uuid,2,$3::uuid) as result", [outsideStudentId, sessionId, endClaim.rows[0]!.result.token]);
    expect(ended.rows[0]!.result).toEqual(expect.objectContaining({ status: "abandoned", phase: "abandoned", summary: null }));
    await database.exec(`delete from public.learning_idempotency where user_id = '${outsideStudentId}' and idempotency_key like 'clar-%';`);
  });

  it("rolls back every learning effect when finalization fails after an insert", async () => {
    const assignmentId = "32345678-1234-4123-8123-123456789012";
    const assignments = [{ id: assignmentId, bankQuestionId: "electricity_ohm_medium_01", question: { id: assignmentId, conceptId: "resistance-and-ohms-law", format: "free_response", prompt: "Calculate resistance.", difficulty: "medium" }, rubric: { questionId: assignmentId, rubricVersion: 1, correctAnswer: { numericValue: 12 }, workedSolution: "private", reasoningRubric: { required: ["R = V/I"] }, numericAnswer: 12, numericTolerance: 0.01, expectedUnit: "ohm", supportedMisconceptionCodes: [] } }];
    const startClaim = await database.query<{ result: { token: string } }>("select public.spark_claim_learning_mutation($1::uuid,'startSession','/api/v1/sessions','rollback-start',repeat('5',64)) as result", [outsideStudentId]);
    const started = await database.query<{ result: { id: string } }>("select public.spark_start_learning_session($1::uuid,$2::public.spark_session_mode,$3,$4::jsonb,$5::jsonb,$6::uuid) as result", [outsideStudentId, "practice", "resistance-and-ohms-law", JSON.stringify(assignments), "[]", startClaim.rows[0]!.result.token]);
    const sessionId = started.rows[0]!.result.id;
    const assignment = await database.query<{ result: unknown }>("select public.spark_get_session_assignment($1::uuid,$2::uuid,$3::uuid) as result", [outsideStudentId, sessionId, assignmentId]);
    const claim = await database.query<{ result: { token: string } }>("select public.spark_claim_learning_mutation($1::uuid,'submitAttempt',$2,'rollback-attempt',repeat('6',64)) as result", [outsideStudentId, `/api/v1/sessions/${sessionId}/attempts`]);
    await database.exec("create or replace function public.test_force_learning_failure() returns trigger language plpgsql as $$ begin raise exception 'forced finalization failure'; end; $$; create trigger test_force_learning_failure after insert on public.attempts for each row execute function public.test_force_learning_failure();");
    await expect(database.query("select public.spark_finalize_learning_attempt($1::uuid,$2::uuid,1,$3::jsonb,$4::jsonb,$5::jsonb,$6::timestamptz,$7::uuid)", [outsideStudentId, sessionId, JSON.stringify(assignment.rows[0]!.result), JSON.stringify({ finalAnswerText: "12 ohm", reasoningText: "R = V/I", selectedOptionId: null, clarificationOfAttemptId: null }), JSON.stringify({ status: "correct", finalAnswerCorrect: true, reasoningStatus: "sound", feedback: "Correct.", misconception: null, clarificationPrompt: null }), "2026-10-31T09:10:00.000Z", claim.rows[0]!.result.token])).rejects.toMatchObject({ code: "P0001" });
    await database.exec("drop trigger test_force_learning_failure on public.attempts; drop function public.test_force_learning_failure();");
    const rolledBack = await queryRows<{ attempts: number; mastery: number; version: number; idempotency_state: string }>(`select (select count(*)::int from public.attempts where session_id = '${sessionId}') attempts, (select count(*)::int from public.concept_mastery where student_user_id = '${outsideStudentId}' and concept_id = 'resistance-and-ohms-law') mastery, (select version from public.tutor_sessions where id = '${sessionId}') version, (select state::text from public.learning_idempotency where idempotency_key = 'rollback-attempt') idempotency_state`);
    expect(rolledBack[0]).toEqual({ attempts: 0, mastery: 0, version: 1, idempotency_state: "in_progress" });
    await database.exec(`delete from public.learning_idempotency where user_id = '${outsideStudentId}' and idempotency_key like 'rollback-%';`);
  });
});

describe("repeatable chapter and question seed", () => {
  it("is repeatable without duplicating catalog rows or deleting mastery", async () => {
    await database.exec("reset role");
    await database.exec(readFileSync(new URL(seedFile, import.meta.url), "utf8"));
    const [counts] = await queryRows<{
      concepts: number;
      questions: number;
      rubrics: number;
      mastery: number;
    }>(`
      select
        (select count(*)::int from public.concepts) as concepts,
        (select count(*)::int from public.question_bank) as questions,
        (select count(*)::int from public.question_rubrics) as rubrics,
        (select count(*)::int from public.concept_mastery) as mastery;
    `);
    expect(counts).toEqual({ concepts: 8, questions: 24, rubrics: 24, mastery: 1 });
  });

  it("matches public question payloads to v1.1.0", async () => {
    const rows = await queryRows<{
      id: string;
      concept_id: string;
      format: "multiple_choice" | "free_response";
      public_prompt: string;
      difficulty: "easy" | "medium" | "hard";
      hint: string | null;
      expected_unit: string | null;
      options: Array<{ id: string; text: string }> | null;
    }>(`
      select id, concept_id, format, public_prompt, difficulty, hint, expected_unit, options
      from public.question_bank order by id;
    `);
    expect(rows).toHaveLength(24);
    for (const row of rows) {
      questionSchema.parse({
        id: row.id,
        conceptId: row.concept_id,
        format: row.format,
        prompt: row.public_prompt,
        difficulty: row.difficulty,
        ...(row.hint ? { hint: row.hint } : {}),
        ...(row.expected_unit ? { expectedUnit: row.expected_unit } : {}),
        ...(row.format === "multiple_choice" ? { options: row.options } : {}),
      });
    }
  });

  it("has exactly easy, medium, and hard content for every concept", async () => {
    const rows = await queryRows<{ concept_id: string; count: number; difficulties: string[] }>(`
      select concept_id, count(*)::int as count, array_agg(difficulty::text order by difficulty::text) as difficulties
      from public.question_bank
      group by concept_id
      order by concept_id;
    `);
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      expect(row.count).toBe(3);
      expect(new Set(row.difficulties)).toEqual(new Set(["easy", "medium", "hard"]));
    }
  });

  it("keeps every multiple-choice answer inside unique option IDs", async () => {
    const rows = await queryRows<{
      question_id: string;
      options: Array<{ id: string; text: string }>;
      correct_answer: { selectedOptionId: string };
    }>(`
      select q.id as question_id, q.options, r.correct_answer
      from public.question_bank q
      join public.question_rubrics r on r.question_id = q.id and r.rubric_version = 1
      where q.format = 'multiple_choice'
      order by q.id;
    `);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const ids = row.options.map(({ id }) => id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain(row.correct_answer.selectedOptionId);
    }
  });

  it("matches independently calculated numerical answers", async () => {
    const expected = new Map<string, number>([
      ["electricity_current_easy_01", 10 / 5],
      ["electricity_current_medium_01", 0.5 * 3 * 60],
      ["electricity_current_hard_01", 2 * 30],
      ["electricity_voltage_easy_01", 12 / 3],
      ["electricity_voltage_medium_01", 6 * 5],
      ["electricity_voltage_hard_01", 9],
      ["electricity_ohm_easy_01", 12 / 4],
      ["electricity_ohm_medium_01", 6 / 0.5],
      ["electricity_factors_medium_01", 1 / 2 ** 2],
      ["electricity_factors_hard_01", 2 / 0.5],
      ["electricity_series_easy_01", 2 + 3],
      ["electricity_series_medium_01", 20 / (4 + 6)],
      ["electricity_series_hard_01", (22 / (2 + 3 + 6)) * 6],
      ["electricity_parallel_easy_01", 1 / (1 / 6 + 1 / 3)],
      ["electricity_parallel_medium_01", 12 / 4 + 12 / 12],
      ["electricity_parallel_hard_01", 1 / (1 / 2 + 1 / 3 + 1 / 6)],
      ["electricity_power_easy_01", 12 * 2],
      ["electricity_power_medium_01", 3 ** 2 * 10],
      ["electricity_power_hard_01", 2 ** 2],
      ["electricity_energy_easy_01", (100 / 1000) * 2],
      ["electricity_energy_medium_01", 2 * (30 / 60)],
      ["electricity_energy_hard_01", 1.5 * 4 * 30],
    ]);
    const rows = await queryRows<{ question_id: string; numeric_answer: string }>(`
      select question_id, numeric_answer::text
      from public.question_rubrics
      where numeric_answer is not null;
    `);
    expect(rows).toHaveLength(expected.size);
    for (const row of rows) {
      expect(Number(row.numeric_answer)).toBeCloseTo(expected.get(row.question_id)!, 10);
    }
  });
});
