import { createClient } from "@supabase/supabase-js";
import { config as loadEnvironment } from "dotenv";

loadEnvironment({ path: ".env.local", quiet: true });

const requiredNames = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SPARK_ENVIRONMENT_NAME",
  "DEV_TEACHER_EMAIL",
  "DEV_TEACHER_PASSWORD",
  "DEV_TEACHER_UNASSIGNED_EMAIL",
  "DEV_TEACHER_UNASSIGNED_PASSWORD",
  "DEV_STUDENT_NEW_EMAIL",
  "DEV_STUDENT_NEW_PASSWORD",
  "DEV_STUDENT_RETURNING_EMAIL",
  "DEV_STUDENT_RETURNING_PASSWORD",
];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required in the local environment`);
  return value;
}

if (process.env.SPARK_ALLOW_DEV_PROVISIONING !== "true") {
  throw new Error("Set SPARK_ALLOW_DEV_PROVISIONING=true to acknowledge development account creation");
}

const environmentName = required("SPARK_ENVIRONMENT_NAME").toLowerCase();
if (["prod", "production"].includes(environmentName)) {
  throw new Error("Development account provisioning is disabled for production environments");
}

for (const name of requiredNames) required(name);

const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

async function findUserByEmail(email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
}

async function ensureUser({ email, password, displayName }) {
  const existing = await findUserByEmail(email);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, synthetic_development_account: true },
  });
  if (error) throw error;
  return data.user;
}

async function checked(label, promise) {
  const { error, data } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`, { cause: error });
  return data;
}

const accountSpecs = {
  teacher: {
    email: required("DEV_TEACHER_EMAIL"),
    password: required("DEV_TEACHER_PASSWORD"),
    displayName: "Development Teacher",
  },
  teacherUnassigned: {
    email: required("DEV_TEACHER_UNASSIGNED_EMAIL"),
    password: required("DEV_TEACHER_UNASSIGNED_PASSWORD"),
    displayName: "Development Unassigned Teacher",
  },
  studentNew: {
    email: required("DEV_STUDENT_NEW_EMAIL"),
    password: required("DEV_STUDENT_NEW_PASSWORD"),
    displayName: "Development New Student",
  },
  studentReturning: {
    email: required("DEV_STUDENT_RETURNING_EMAIL"),
    password: required("DEV_STUDENT_RETURNING_PASSWORD"),
    displayName: "Development Returning Student",
  },
};

const [teacher, teacherUnassigned, studentNew, studentReturning] = await Promise.all([
  ensureUser(accountSpecs.teacher),
  ensureUser(accountSpecs.teacherUnassigned),
  ensureUser(accountSpecs.studentNew),
  ensureUser(accountSpecs.studentReturning),
]);

await checked(
  "upsert server-controlled roles",
  admin.from("user_roles").upsert(
    [
      { user_id: teacher.id, role: "teacher" },
      { user_id: teacherUnassigned.id, role: "teacher" },
      { user_id: studentNew.id, role: "student" },
      { user_id: studentReturning.id, role: "student" },
    ],
    { onConflict: "user_id,role" },
  ),
);

await checked(
  "upsert server-controlled display names",
  admin.from("user_directory").upsert(
    [
      { user_id: teacher.id, display_name: accountSpecs.teacher.displayName },
      { user_id: teacherUnassigned.id, display_name: accountSpecs.teacherUnassigned.displayName },
      { user_id: studentNew.id, display_name: accountSpecs.studentNew.displayName },
      { user_id: studentReturning.id, display_name: accountSpecs.studentReturning.displayName },
    ],
    { onConflict: "user_id" },
  ),
);

await checked(
  "upsert development student profiles",
  admin.from("student_profiles").upsert(
    [
      {
        user_id: studentNew.id,
        display_name: accountSpecs.studentNew.displayName,
        chapter_id: "class-10-physics-electricity",
        exam_date: null,
        time_zone: "Asia/Kolkata",
        onboarding_complete: false,
      },
      {
        user_id: studentReturning.id,
        display_name: accountSpecs.studentReturning.displayName,
        chapter_id: "class-10-physics-electricity",
        exam_date: null,
        time_zone: "Asia/Kolkata",
        onboarding_complete: true,
      },
    ],
    { onConflict: "user_id" },
  ),
);

const classRows = await checked(
  "upsert Class 10A",
  admin
    .from("classes")
    .upsert({ stable_code: "class-10a", name: "Class 10A" }, { onConflict: "stable_code" })
    .select("id")
    .single(),
);

await checked(
  "assign development teacher",
  admin
    .from("class_teachers")
    .upsert({ class_id: classRows.id, teacher_user_id: teacher.id }, { onConflict: "class_id,teacher_user_id" }),
);

await checked(
  "enrol development students",
  admin.from("class_students").upsert(
    [
      { class_id: classRows.id, student_user_id: studentNew.id },
      { class_id: classRows.id, student_user_id: studentReturning.id },
    ],
    { onConflict: "class_id,student_user_id" },
  ),
);

console.log(`Provisioned synthetic ${environmentName} roster without invitations or learning history.`);
