import { expect } from "./helpers.js";

/** Dismiss the guest gate if present (fresh browser profile).
 * Uses waitFor (NOT isVisible — its timeout option is ignored) because the
 * gate only appears after the session check resolves, which can be several
 * seconds behind the navigation. Retries cover dev quirks: StrictMode
 * double-mounting can swallow the first click, and successful guest
 * sign-in reloads the page, after which the gate may briefly flash again. */
export async function ensureGuest(page) {
  const guestBtn = page.locator('[role="alertdialog"] button', {
    hasText: /continue as guest/i,
  });
  const gate = page.locator('[role="alertdialog"]');
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      // First attempt waits generously (cold dev-server loads are slow);
      // later attempts only need to catch a re-flashed gate.
      await gate.waitFor({
        state: "visible",
        timeout: attempt === 0 ? 25000 : 5000,
      });
    } catch {
      return; // Gate never (re)appeared — guest path is ready.
    }
    await guestBtn.first().click().catch(() => {});
    try {
      await gate.waitFor({ state: "hidden", timeout: 30000 });
    } catch {
      // Click may have been swallowed — loop and retry.
    }
    // Give a successful sign-in + reload room to settle outside the poll.
    await page.waitForTimeout(1500);
  }
}

export async function gotoGuest(page, hash) {
  await page.goto(`/#${hash}`, { waitUntil: "domcontentloaded" });
  await ensureGuest(page);
}

/** Real UI signup. Returns { name, email, password }. */
export async function signupAs(page, tag) {
  const email = `pw-${Date.now().toString(36)}-${tag}@example.com`;
  const user = { name: `PW ${tag}`, email, password: "Test1234!" };
  await page.goto("/#/signup", { waitUntil: "domcontentloaded" });
  // The signup form re-renders on mount (locale hydration) and can detach
  // inputs mid-fill — retry each fill a few times.
  const fillRetry = async (target, value) => {
    for (let i = 0; i < 4; i++) {
      try {
        await target.fill(value, { timeout: 8000 });
        return;
      } catch (e) {
        if (i === 3) throw e;
        await page.waitForTimeout(1200);
      }
    }
  };
  await fillRetry(page.getByPlaceholder(/full name|name/i).first(), user.name);
  await fillRetry(page.getByPlaceholder(/email/i).first(), user.email);
  await fillRetry(page.getByPlaceholder(/password/i).first(), user.password);
  await page.getByRole("button", { name: /continue with email/i }).click();
  // Success lands on / (auto-login) or /login.
  await page.waitForURL(/.*#\/$|.*#\/login.*/, { timeout: 25000 });
  return user;
}

/** Real UI login. */
export async function loginAs(page, email, password) {
  await page.goto("/#/login", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder(/email/i).first().fill(email);
  await page.getByPlaceholder(/password/i).first().fill(password);
  await page.getByRole("button", { name: /continue with email/i }).click();
  await page.waitForURL(/.*#\/$/, { timeout: 25000 });
  await expect(page.locator('[role="alertdialog"]')).toBeHidden({
    timeout: 15000,
  });
}
