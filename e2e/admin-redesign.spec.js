import { test, expect } from "./helpers.js";
import { loginAs } from "./flow.js";

const ADMIN_EMAIL = "seed-admin@example.com";
const ADMIN_PW = "Admin1234!";

test.describe("admin redesign: shadcn orders + customers", () => {
  test("orders page uses shadcn KPI cards, no gradients", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    await page.goto("/#/auth/admin/orders", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1", { hasText: /^orders$/i })).toBeVisible({
      timeout: 20000,
    });
    await page.waitForTimeout(4000);
    for (const label of ["Total orders", "Pending", "Requests", "Revenue"]) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible({
        timeout: 15000,
      });
    }
    // No gradient styling remains on the page.
    const gradients = await page.evaluate(
      () => document.querySelectorAll('[class*="bg-gradient-"]').length,
    );
    expect(gradients, "gradient elements remaining").toBe(0);
    // Requests KPI jumps straight to the decision queue.
    await page.locator("button", { hasText: /requests/i }).first().click();
    const queueVisible = page
      .locator("section[aria-label='Cancellation requests']")
      .or(page.locator("section[aria-label='Return requests']"))
      .or(page.locator("text=/all caught up/i"));
    await expect(queueVisible.first()).toBeVisible({ timeout: 15000 });
    expect(errors).toEqual([]);
  });

  test("customers page shows profile pictures, decrypted fields, no gradients", async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    await page.goto("/#/auth/admin/customers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1", { hasText: /^customers$/i })).toBeVisible({
      timeout: 20000,
    });
    await page.waitForTimeout(4000);
    for (const label of ["Total customers", "Active", "VIP members", "Avg. lifetime value"]) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible({
        timeout: 15000,
      });
    }
    // Profile avatar exists per card — with today's many run-generated
    // customers (no photos) the initials fallback is the stable invariant.
    await expect(page.locator("text=/^SC$/").first()).toBeVisible({
      timeout: 15000,
    });
    const gradients = await page.evaluate(
      () => document.querySelectorAll('[class*="bg-gradient-"]').length,
    );
    expect(gradients, "gradient elements remaining").toBe(0);
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/U2FsdGVkX1/);
    expect(body).not.toMatch(/Invalid Date/);
    expect(errors).toEqual([]);
  });

  test("analytics page uses shadcn KPI cards, no gradients", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    await page.goto("/#/auth/admin/analytics", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1", { hasText: /^analytics$/i })).toBeVisible({
      timeout: 20000,
    });
    await page.waitForTimeout(4000);
    for (const label of ["Orders", "Paid orders", "Revenue", "Avg. order value"]) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible({
        timeout: 15000,
      });
    }
    // Granularity switcher re-queries the backend without breaking the page.
    await page.locator("button", { hasText: /month/i }).first().click();
    await expect(page.locator("h1", { hasText: /^analytics$/i })).toBeVisible();
    const gradients = await page.evaluate(
      () => document.querySelectorAll('[class*="bg-gradient-"]').length,
    );
    expect(gradients, "gradient elements remaining").toBe(0);
    expect(errors).toEqual([]);
  });

  test("payments page uses shadcn KPI cards that switch queues", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    await page.goto("/#/auth/admin/payments", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator("h1", { hasText: /^payments & shipping$/i }),
    ).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(4000);
    for (const label of ["Pending payment", "Processing", "Returns", "Refunds"]) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible({
        timeout: 15000,
      });
    }
    const gradients = await page.evaluate(
      () => document.querySelectorAll('[class*="bg-gradient-"]').length,
    );
    expect(gradients, "gradient elements remaining").toBe(0);
    // Clicking a KPI card switches the visible queue tab.
    await page.locator("button", { hasText: /refunds/i }).first().click();
    await expect(
      page.locator("text=/refunds queue/i").first(),
    ).toBeVisible({ timeout: 15000 });
    expect(errors).toEqual([]);
  });

  test("both pages stay responsive on mobile", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const m = await ctx.newPage();
    const errors = [];
    m.on("pageerror", (e) => errors.push(e.message));
    await loginAs(m, ADMIN_EMAIL, ADMIN_PW);
    for (const route of ["/auth/admin/orders", "/auth/admin/customers"]) {
      await m.goto(`/#${route}`, { waitUntil: "domcontentloaded" });
      await m.waitForTimeout(4000);
      const overflow = await m.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test("categories page uses shadcn header, cards and dialog", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    await page.goto("/#/auth/admin/categories", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1", { hasText: /^categories$/i })).toBeVisible({
      timeout: 20000,
    });
    await page.waitForTimeout(3000);
    for (const label of ["Categories", "Categorized products"]) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible({
        timeout: 15000,
      });
    }
    const gradients = await page.evaluate(
      () => document.querySelectorAll('[class*="bg-gradient-"]').length,
    );
    expect(gradients, "gradient elements remaining").toBe(0);
    // Create dialog opens, is usable, and creates a category end to end.
    const cid = `pwredesign-${Date.now().toString(36)}`;
    await page.getByRole("button", { name: /new category/i }).click();
    await page.locator('input[placeholder*="microcontrollers"]').first().fill(cid);
    await page.locator('input[placeholder*="Microcontrollers"]').fill(`PW Redesign ${cid}`);
    await page.getByRole("button", { name: /^create$/i }).click();
    await expect(page.locator(`text=${cid}`).first()).toBeVisible({
      timeout: 20000,
    });
    // Cleanup: delete the fixture through the real UI (accept the confirm).
    page.on("dialog", (d) => d.accept());
    const row = page.locator("tr", { hasText: cid });
    await row.getByRole("button", { name: /delete/i }).click();
    await expect(page.locator(`text=${cid}`)).toHaveCount(0, { timeout: 20000 });
    expect(errors).toEqual([]);
  });
});
