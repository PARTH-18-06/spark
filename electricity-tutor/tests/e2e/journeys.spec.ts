import { expect, test, type Page } from "@playwright/test";

const consoleErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  consoleErrors.set(page, errors);
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(consoleErrors.get(page) ?? []).toEqual([]);
});

async function choosePersona(page: Page, value: "student-new" | "student-returning" | "teacher") {
  await page.goto("/");
  await page.getByLabel("Demo persona").selectOption(value);
}

async function onboard(page: Page, name = "Sam Demo") {
  await page.goto("/onboarding");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Time zone").fill("Asia/Calcutta");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(page.getByRole("heading", { name: new RegExp(`Ready when you are, ${name}`) })).toBeVisible();
}

async function startPractice(page: Page, conceptIndex = 2) {
  await page.goto("/learn/concepts");
  await expect(page.getByRole("heading", { name: "See how the ideas connect." })).toBeVisible();
  await page.getByRole("button", { name: "View details" }).nth(conceptIndex).click();
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page).toHaveURL(/\/learn\/session\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

async function answerCurrent(page: Page, reasoning = "I = V/R, so current doubles when resistance stays fixed.") {
  const options = page.getByRole("radio");
  await page.getByText("Final answer", { exact: true }).waitFor();
  if (await options.count()) await options.first().check();
  else await page.getByLabel("Final answer").fill("Current doubles.");
  await page.getByLabel("Explain your thinking").fill(reasoning);
  await page.getByRole("button", { name: /Submit for feedback|Submit clarification/ }).click();
}

async function endSession(page: Page) {
  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "End session" }).click();
  await expect(page.getByRole("heading", { name: "This session was abandoned." })).toBeVisible();
}

test("onboarding → diagnostic → persisted summary", async ({ page }) => {
  await page.goto("/");
  await onboard(page);
  await page.getByRole("button", { name: "Start diagnostic" }).first().click();
  await expect(page).toHaveURL(/\/learn\/session\//);

  for (let index = 0; index < 8; index += 1) {
    await answerCurrent(page, `Diagnostic reasoning ${index + 1}: I use the relationship shown in the question.`);
    await expect(page.getByRole("heading", { name: "That reasoning landed." })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
  }

  await expect(page.getByRole("heading", { name: "Your saved summary is ready." })).toBeVisible();
  await expect(page.getByText("Concept estimates")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your saved summary is ready." })).toBeVisible();
});

test("returning student resumes feedback and submits free-response then multiple-choice", async ({ page }) => {
  await choosePersona(page, "student-returning");
  await startPractice(page);
  await expect(page.getByLabel("Final answer")).toBeVisible();
  await answerCurrent(page);
  await expect(page.getByRole("heading", { name: "That reasoning landed." })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "That reasoning landed." })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("radio").first()).toBeVisible();
  await answerCurrent(page);
  await expect(page.getByRole("heading", { name: "That reasoning landed." })).toBeVisible();
});

test("voice-first explanation is editable, reviewable, and draft-safe during refresh", async ({ page }) => {
  await choosePersona(page, "student-returning");
  await startPractice(page);
  const explanation = page.getByLabel("Explain your thinking");
  await expect(page.getByText("Click the answer box, activate Wispr Flow, and explain your thinking.", { exact: true })).toBeVisible();
  await page.getByLabel("Final answer").fill("Current doubles.");
  await explanation.fill("I = V/R, so doubling voltage doubles current when resistance stays fixed.");
  await expect(explanation).toBeFocused();
  await page.reload();
  await expect(page.getByLabel("Final answer")).toHaveValue("Current doubles.");
  await expect(explanation).toHaveValue("I = V/R, so doubling voltage doubles current when resistance stays fixed.");
  await expect(page.getByText("Click the answer box, activate Wispr Flow, and explain your thinking.", { exact: true })).toBeVisible();
});

test("incorrect evidence, clarification, refresh, and exact retry preserve the journey", async ({ page }) => {
  await page.goto("/");
  await onboard(page, "Retry Learner");
  await page.getByLabel("Demo feedback").selectOption("incorrect");
  await startPractice(page);
  await page.getByLabel("Final answer").fill("Current halves.");
  await page.getByLabel("Explain your thinking").fill("Current halves because higher voltage increases resistance.");
  await page.getByRole("button", { name: "Submit for feedback" }).click();
  await expect(page.getByText("Assumes voltage changes fixed resistance")).toBeVisible();
  await expect(page.getByText("“higher voltage increases resistance”")).toBeVisible();
  await endSession(page);

  await startPractice(page);
  await page.getByLabel("Demo feedback").selectOption("needs_clarification");
  await answerCurrent(page, "It could double or halve.");
  await expect(page.getByText("Clarification requested")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Clarification requested")).toBeVisible();
  await page.getByLabel("Demo feedback").selectOption("correct");
  await page.getByLabel("Final answer").fill("Current doubles.");
  await page.getByLabel("Explain your thinking").fill("I = V/R. R is fixed, so doubling V doubles I.");
  await page.getByRole("button", { name: "Submit clarification" }).click();
  await expect(page.getByRole("heading", { name: "That reasoning landed." })).toBeVisible();
  await endSession(page);

  await startPractice(page);
  await page.getByLabel("Final answer").fill("Current doubles.");
  await page.getByLabel("Explain your thinking").fill("Draft preserved for an exact retry.");
  await page.getByRole("button", { name: "Fail next request" }).click();
  await page.getByRole("button", { name: "Submit for feedback" }).click();
  await expect(page.getByText(/unresolved outcome/)).toBeVisible();
  await expect(page.getByLabel("Final answer")).toHaveValue("Current doubles.");
  await page.getByRole("button", { name: "Retry exact request" }).click();
  await expect(page.getByRole("heading", { name: "That reasoning landed." })).toBeVisible();
});

test("end session from answering, feedback, and clarification, then start again", async ({ page }) => {
  await page.goto("/");
  await onboard(page, "End Tester");

  await startPractice(page);
  await endSession(page);
  await startPractice(page);

  await answerCurrent(page);
  await expect(page.getByRole("heading", { name: "That reasoning landed." })).toBeVisible();
  await endSession(page);
  await startPractice(page);

  await page.getByLabel("Demo feedback").selectOption("needs_clarification");
  await answerCurrent(page, "I need to clarify this relationship.");
  await expect(page.getByText("Clarification requested")).toBeVisible();
  await endSession(page);
  await startPractice(page);
  await expect(page.getByLabel("Final answer")).toBeVisible();
});

test("revision completion and abandonment preserve backend queue behavior", async ({ page }) => {
  await choosePersona(page, "student-returning");
  await page.goto("/learn/revision");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: /Start selected revision/ }).click();
  for (let index = 0; index < 2; index += 1) {
    await answerCurrent(page);
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await expect(page.getByRole("heading", { name: "Your saved summary is ready." })).toBeVisible();
  await page.getByRole("link", { name: "Refresh revision queue" }).click();
  await expect(page.getByRole("heading", { name: "Recently completed" })).toBeVisible();

  await page.getByRole("button", { name: "Reset demo" }).click();
  await page.goto("/learn/revision");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: /Start selected revision/ }).click();
  await endSession(page);
  await page.getByRole("link", { name: "Return to revision" }).click();
  await expect(page.getByRole("checkbox").first()).toBeVisible();
});

test("teacher detail, account isolation, mobile keyboard, and reduced motion", async ({ page }) => {
  await choosePersona(page, "teacher");
  await page.goto("/teacher");
  await expect(page.getByRole("heading", { name: "Student-by-concept mastery" })).toBeVisible();
  await page.getByRole("button", { name: "Asha" }).click();
  await expect(page.getByRole("heading", { name: "Asha" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent attempts" })).toBeVisible();

  await page.getByLabel("Demo persona").selectOption("student-new");
  await onboard(page, "Private Draft");
  await page.getByRole("button", { name: "Start diagnostic" }).first().click();
  await page.getByLabel("Final answer").fill("Draft that must be cleared");
  await page.getByLabel("Explain your thinking").fill("Private per-account reasoning");
  expect(await page.evaluate(() => Object.keys(sessionStorage).some((key) => key.includes(":draft:")))).toBe(true);
  await page.getByLabel("Demo persona").selectOption("student-returning");
  await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).some((key) => key.includes(":draft:")))).toBe(false);
  await page.goto("/learn");
  await expect(page.getByRole("heading", { name: /Ready when you are, Asha/ })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation", { name: "Student navigation" })).toBeVisible();
  await page.keyboard.press("Home");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const scrollBehavior = await page.locator("html").evaluate((element) => getComputedStyle(element).scrollBehavior);
  expect(scrollBehavior).toBe("auto");
});
