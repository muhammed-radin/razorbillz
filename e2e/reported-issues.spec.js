import { test, expect } from "./helpers.js";
import { loginAs } from "./flow.js";

// Verifies the reported production issues against seeded local data:
// 1. Admin Orders crash (unknown statuses)  2. analytics 404 on empty DB
// 3. duplicate event keys  4. encrypted usernames shown raw.
test.describe("reported issues: verified fixed", () => {
  test("admin orders renders mixed statuses without crashing", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await loginAs(page, "seed-admin@example.com", "Admin1234!");
    await page.goto("/#/auth/admin/orders", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    expect(errors, `pageerrors: ${errors.join(" | ")}`).toEqual([]);
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/something went wrong/i);
    // Seeded statuses all render as badges (packed lives in fulfillment).
    for (const s of ["Confirmed", "Processing", "Delivered", "Cancelled"]) {
      expect(body, `missing badge ${s}`).toMatch(new RegExp(s, "i"));
    }
  });

  test("analytics loads on empty-ish DB without 404 crash", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await loginAs(page, "seed-admin@example.com", "Admin1234!");
    await page.goto("/#/auth/admin/analytics", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    expect(errors, `pageerrors: ${errors.join(" | ")}`).toEqual([]);
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/something went wrong/i);
    expect(body).toMatch(/analytics/i);
  });

  test("no duplicate-key warnings; names decrypted", async ({ page }) => {
    const warnings = [];
    page.on("console", (m) => {
      if (m.text().includes("same key")) warnings.push(m.text().slice(0, 120));
    });
    await loginAs(page, "seed-admin@example.com", "Admin1234!");
    await page.goto("/#/auth/admin/analytics", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    await page.goto("/#/auth/admin/customers", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    expect(warnings, `dup keys: ${warnings.join(" | ")}`).toEqual([]);
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/U2FsdGVkX1/);
    expect(body).toMatch(/Seed Customer/);
  });
});
