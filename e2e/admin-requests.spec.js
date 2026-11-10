import { test, expect, API } from "./helpers.js";
import { loginAs, signupAs } from "./flow.js";

const ADMIN_EMAIL = "seed-admin@example.com";
const ADMIN_PW = "Admin1234!";

const ADDR = {
  name: "PW Requests",
  phoneNumber: "+919847000011",
  email: "pw-req@example.com",
  street: "3 Request Lane, Kottakkal",
  city: "Malappuram",
  state: "Kerala",
  postalCode: "676505",
  country: "India",
  type: "home",
};

async function apiFetch(page, path, { method = "GET", body } = {}) {
  return page.evaluate(
    async ({ API, path, method, body }) => {
      const r = await fetch(`${API}${path}`, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, data: await r.json().catch(() => ({})) };
    },
    { API, path, method, body },
  );
}

test.describe.serial("admin: cancel/return request decisions", () => {
  let FX_PID;
  let customer;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    FX_PID = `pwreq-${Date.now().toString(36)}`;
    const pid = FX_PID;
    const st = await page.evaluate(
      async ({ pid, API }) => {
        const res = await fetch(`${API}/api/products/new/${pid}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: pid,
            title: `PW Request Fixture ${pid}`,
            price: 499,
            originalPrice: 599,
            thumbnail:
              "https://cdn.dummyjson.com/product-images/smartphones/vivo-s1/thumbnail.webp",
            description: "Fixture for request-decision tests.",
            detailedDescription: "Fixture for automated request decision tests.",
            category: "components",
            stock: 50,
            brand: "PWTest",
            isActive: true,
            owner: {},
          }),
        });
        return res.status;
      },
      { pid, API },
    );
    expect(st).toBe(200);
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    await apiFetch(page, `/api/products/${FX_PID}`, { method: "DELETE" });
    await page.close();
  });

  async function placeOrder(page) {
    const idem = `REQ-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const r = await apiFetch(page, "/api/orders", {
      method: "POST",
      body: {
        products: [{ productId: FX_PID, quantity: 1 }],
        shippingAddress: ADDR,
        billingAddress: ADDR,
        payment: { method: "cod" },
        idempotencyKey: idem,
      },
    });
    expect(r.status, JSON.stringify(r.data).slice(0, 200)).toBe(201);
    return r.data.id;
  }

  test("cancel request appears in admin queue and approval cancels the order", async ({
    page,
    browser,
  }) => {
    const c = await browser.newPage();
    customer = await signupAs(c, "req");
    const orderId = await placeOrder(c);
    const cancel = await apiFetch(c, `/api/orders/${orderId}/cancel`, {
      method: "POST",
      body: { reason: "Ordered by mistake" },
    });
    expect(cancel.status).toBe(200);
    await c.close();

    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/#/auth/admin/orders", { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: /requests/i }).click();
    await expect(page.locator(`text=${orderId}`).first()).toBeVisible({
      timeout: 20000,
    });
    await expect(
      page.locator("text=/ordered by mistake/i").first(),
    ).toBeVisible({ timeout: 15000 });
    expect(errors).toEqual([]);

    // Approve from the request card.
    const card = page.locator("section[aria-label='Cancellation requests']");
    await card.getByRole("button", { name: /approve/i }).first().click();
    await page.getByRole("button", { name: /approve request/i }).click();
    await expect(page.locator("text=/approved/i").first()).toBeVisible({
      timeout: 20000,
    });

    // Order is now cancelled (server state, not just local).
    const check = await apiFetch(page, `/api/orders/${orderId}`);
    expect(check.data.status).toBe("cancelled");
    expect(check.data?.cancellation?.status).toBe("approved");
  });

  test("return request can be denied with a reason", async ({ page, browser }) => {
    const c = await browser.newPage();
    await loginAs(c, customer.email, customer.password);
    const orderId = await placeOrder(c);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    for (const op of ["process", "packed", "ship", "deliver"]) {
      const st = await apiFetch(page, `/api/orders/${orderId}/${op}`, {
        method: "POST",
        body: op === "ship" ? { trackingNumber: "REQAWB1", serviceName: "ReqCourier" } : {},
      });
      expect(st.status, `deliver step ${op}`).toBe(200);
    }

    // Customer requests a return from the real UI.
    await c.goto("/#/order", { waitUntil: "domcontentloaded" });
    await expect(c.locator(`text=${orderId}`).first()).toBeVisible({ timeout: 20000 });
    await c.locator("tr", { hasText: orderId }).getByRole("button", { name: /^return$/i }).click();
    await c.locator("text=Product damaged on arrival").first().click();
    await c.getByRole("button", { name: /submit return request/i }).click();
    await expect(c.locator("text=/return.*requested/i").first()).toBeVisible({
      timeout: 20000,
    });

    // Admin denies with a reason from the Requests queue.
    await page.goto("/#/auth/admin/orders", { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: /requests/i }).click();
    await expect(page.locator(`text=${orderId}`).first()).toBeVisible({
      timeout: 20000,
    });
    const card = page.locator("section[aria-label='Return requests']");
    await card.getByRole("button", { name: /deny/i }).first().click();
    await page.locator("#decision-reason").fill("Item is outside the 7-day return window.");
    await page.getByRole("button", { name: /deny request/i }).click();
    await expect(page.locator("text=/denied/i").first()).toBeVisible({
      timeout: 20000,
    });

    const check = await apiFetch(page, `/api/orders/${orderId}`);
    expect(check.data?.return?.status).toBe("rejected");
    expect(check.data?.return?.rejectionReason).toMatch(/7-day/);
    await c.close();
  });

  test("cancel sheet is usable on a mobile viewport", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const m = await ctx.newPage();
    const errors = [];
    m.on("pageerror", (e) => errors.push(e.message));
    await loginAs(m, ADMIN_EMAIL, ADMIN_PW);
    await m.goto("/#/auth/admin/orders", { waitUntil: "domcontentloaded" });
    await m.waitForTimeout(4000);
    // Newest rows may already be cancelled/delivered by other suites —
    // iterate through the page's order menus until one offers "Cancel Order".
    const triggers = m.getByRole("button", { name: /order actions/i });
    const triggerCount = Math.min(await triggers.count(), 10);
    let opened = false;
    for (let i = 0; i < triggerCount; i++) {
      await triggers.nth(i).click();
      const item = m.getByRole("menuitem", { name: /cancel order/i }).first();
      try {
        await item.waitFor({ state: "visible", timeout: 3500 });
        opened = true;
        break;
      } catch {
        await m.keyboard.press("Escape");
        await m.waitForTimeout(600);
      }
    }
    expect(opened, "no cancelable order among the newest orders").toBe(true);
    await m.getByRole("menuitem", { name: /cancel order/i }).first().click();
    const sheet = m.locator('[role="dialog"]');
    await expect(sheet.first()).toBeVisible({ timeout: 15000 });
    // Let the slide-in animation finish before measuring geometry.
    await m.waitForTimeout(900);
    // Footer actions reachable without horizontal scrolling.
    const goBack = m.getByRole("button", { name: /go back/i });
    await expect(goBack).toBeVisible({ timeout: 10000 });
    const box = await goBack.boundingBox();
    expect(box).toBeTruthy();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(376);
    const cancelBtn = m.getByRole("button", { name: /^cancel order$/i });
    await expect(cancelBtn).toBeVisible({ timeout: 10000 });
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test("dashboard is responsive on a mobile viewport", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const m = await ctx.newPage();
    const errors = [];
    m.on("pageerror", (e) => errors.push(e.message));
    await loginAs(m, ADMIN_EMAIL, ADMIN_PW);
    await m.goto("/#/auth/admin/dashboard", { waitUntil: "domcontentloaded" });
    await expect(m.locator("h1", { hasText: /dashboard/i })).toBeVisible({
      timeout: 20000,
    });
    await m.waitForTimeout(5000);
    const overflow = await m.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "horizontal overflow on mobile").toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});
