import { test, expect, API, encryptAddressForTest } from "./helpers.js";
import { loginAs, signupAs } from "./flow.js";

const ADMIN_EMAIL = "pw-admin@example.com";
const ADMIN_PW = "Admin1234!";

const ADDR = {
  name: "PW Returns",
  phoneNumber: "+919847000001",
  email: "pw-ret@example.com",
  street: "7 Test Road, Kottakkal",
  city: "Malappuram",
  state: "Kerala",
  postalCode: "676505",
  country: "India",
  type: "home",
};

test.describe.serial("orders: cancel + return lifecycle", () => {
  let FX_PID;
  let customer;
  let orderId;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    FX_PID = `pwret-${Date.now().toString(36)}`;
    const st = await page.evaluate(
      async ({ pid, API }) => {
        const res = await fetch(`${API}/api/products/new/${pid}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: pid,
            title: `PW Return Fixture ${pid}`,
            price: 499,
            originalPrice: 599,
            thumbnail:
              "https://cdn.dummyjson.com/product-images/smartphones/vivo-s1/thumbnail.webp",
            description: "Fixture for cancel/return tests.",
            detailedDescription: "Fixture for automated cancel return tests.",
            category: "components",
            stock: 50,
            brand: "PWTest",
            isActive: true,
            owner: {},
          }),
        });
        return res.status;
      },
      { pid: FX_PID, API },
    );
    expect(st).toBe(200);
    await page.close();
  });

  test("customer places COD order then requests cancellation with reason", async ({
    page,
  }) => {
    customer = await signupAs(page, "ret");
    const created = await page.evaluate(
      async ({ API, FX_PID, ADDR, encAddr }) => {
        await fetch(`${API}/api/address`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: encAddr,
          }),
        });
        const idem = `PWTEST-${Date.now()}`;
        const r = await fetch(`${API}/api/orders`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-Idempotency-Key": idem,
          },
          body: JSON.stringify({
            products: [{ productId: FX_PID, quantity: 1 }],
            shippingAddress: ADDR,
            billingAddress: ADDR,
            payment: { method: "cod" },
            idempotencyKey: idem,
          }),
        });
        return { status: r.status, body: await r.json().catch(() => ({})) };
      },
      { API, FX_PID, ADDR },
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    orderId = created.body.id;
    expect(orderId).toBeTruthy();

    // Cancel via the real UI dialog with a meaningful reason.
    await page.goto("/#/order", { waitUntil: "domcontentloaded" });
    await expect(page.locator(`text=${orderId}`).first()).toBeVisible({
      timeout: 20000,
    });
    await page.getByRole("button", { name: /^cancel$/i }).first().click();
    await page.locator("text=Ordered by mistake").first().click();
    await page.getByRole("button", { name: /confirm cancellation/i }).click();
    await expect(page.locator("text=/cancel.*requested/i").first()).toBeVisible({
      timeout: 20000,
    });

    // Persists across reload.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("text=/cancel.*requested/i").first()).toBeVisible({
      timeout: 20000,
    });

    // Duplicate cancel is handled safely (error toast, no crash, no duplicate).
    const dup = await page.evaluate(async ({ API, orderId }) => {
      const r = await fetch(`${API}/api/orders/${orderId}/cancel`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Duplicate order" }),
      });
      return r.status;
    }, { API, orderId });
    expect([200, 400, 409, 422]).toContain(dup);
  });

  test("return on undelivered order is rejected; delivered order can be returned", async ({
    page,
    browser,
  }) => {
    await loginAs(page, customer.email, customer.password);
    // Undelivered (cancel-requested/COD) order: return must be rejected.
    const early = await page.evaluate(async ({ API, orderId }) => {
      const r = await fetch(`${API}/api/orders/${orderId}/return`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Product damaged on arrival" }),
      });
      return r.status;
    }, { API, orderId });
    expect([400, 404, 409, 422]).toContain(early);

    // Admin approves the cancellation first (cleanup path), then place a
    // second order and drive it to delivered for the return flow.
    const admin = await browser.newPage();
    await loginAs(admin, ADMIN_EMAIL, ADMIN_PW);
    await admin.evaluate(async ({ API, orderId }) => {
      await fetch(`${API}/api/orders/${orderId}/cancel/approve`, {
        method: "POST",
        credentials: "include",
      });
    }, { API, orderId });

    const second = await page.evaluate(
      async ({ API, FX_PID, ADDR }) => {
        const idem = `PWTEST-${Date.now()}-2`;
        const r = await fetch(`${API}/api/orders`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-Idempotency-Key": idem,
          },
          body: JSON.stringify({
            products: [{ productId: FX_PID, quantity: 1 }],
            shippingAddress: ADDR,
            billingAddress: ADDR,
            payment: { method: "cod" },
            idempotencyKey: idem,
          }),
        });
        return { status: r.status, body: await r.json().catch(() => ({})) };
      },
      { API, FX_PID, ADDR, encAddr: encryptAddressForTest({ ...ADDR, id: `addr-${Date.now()}` }) },
    );
    expect(second.status).toBe(201);
    const order2 = second.body.id;

    // Admin: process -> packed -> ship -> deliver.
    for (const op of ["process", "packed", "ship", "deliver"]) {
      const st = await admin.evaluate(async ({ API, order2, op }) => {
        const r = await fetch(`${API}/api/orders/${order2}/${op}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: op === "ship" ? JSON.stringify({ trackingNumber: "PW AWB 1", serviceName: "TestCourier" }) : "{}",
        });
        return r.status;
      }, { API, order2, op });
      expect(st, `admin ${op}`).toBe(200);
    }

    // Customer requests return via UI on the delivered order.
    await page.goto("/#/order", { waitUntil: "domcontentloaded" });
    await expect(page.locator(`text=${order2}`).first()).toBeVisible({
      timeout: 20000,
    });
    const row = page.locator("tr", { hasText: order2 });
    await row.getByRole("button", { name: /^return$/i }).click();
    await page.locator("text=Product damaged on arrival").first().click();
    await page.getByRole("button", { name: /submit return request/i }).click();
    await expect(page.locator("text=/return.*requested/i").first()).toBeVisible({
      timeout: 20000,
    });

    // Admin approves; COD order must NOT gain a fictitious refund.
    const approve = await admin.evaluate(async ({ API, order2 }) => {
      const r = await fetch(`${API}/api/orders/${order2}/return/approve`, {
        method: "POST",
        credentials: "include",
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }, { API, order2 });
    expect(approve.status).toBe(200);
    const check = await admin.evaluate(async ({ API, order2 }) => {
      const r = await fetch(`${API}/api/orders/${order2}`, { credentials: "include" });
      return r.json().catch(() => ({}));
    }, { API, order2 });
    expect(Number(check?.payment?.refundedAmount ?? 0)).toBe(0);
    await admin.close();

    // Fixture cleanup for this suite.
    await page.evaluate(async ({ API, FX_PID }) => {
      await fetch(`${API}/api/products/${FX_PID}`, {
        method: "DELETE",
        credentials: "include",
      });
    }, { API, FX_PID });
  });
});
