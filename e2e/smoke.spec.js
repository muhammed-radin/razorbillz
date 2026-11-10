import { test, expect } from "./helpers.js";

const ROUTES = [
  "/",
  "/search",
  "/cart",
  "/login",
  "/signup",
  "/support",
  "/wishlist",
  "/order",
  "/order-status",
  "/order-status?id=BAD-ID!!",
  "/auth",
  "/404",
  "/nonexistent-route-xyz",
];

test.describe("smoke: routes render without uncaught exceptions", () => {
  for (const route of ROUTES) {
    test(`route ${route}`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      const consoleErrors = [];
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
      });
      await page.goto(`/#${route === "/" ? "/" : route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      // No uncaught React exceptions.
      expect(errors, `pageerrors on ${route}: ${errors.join(" | ")}`).toEqual([]);
      // A visible heading/body must exist (app shell rendered).
      const bodyText = await page.locator("body").innerText();
      expect(bodyText.trim().length).toBeGreaterThan(0);
      // Record console errors for the report without failing (many are benign).
      if (consoleErrors.length) {
        console.log(`console.errors[${route}]:`, JSON.stringify(consoleErrors.slice(0, 5)));
      }
    });
  }
});
