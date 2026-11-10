import { test, expect, API, apiContext } from "./helpers.js";
import { loginAs, signupAs } from "./flow.js";

test.describe.serial("security: authorization + payment integrity", () => {
  let customer;
  let orderId;
  let FX_PID;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, "pw-admin@example.com", "Admin1234!");
    FX_PID = `pwsec-${Date.now().toString(36)}`;
    const st = await page.evaluate(
      async ({ pid, API }) => {
        const res = await fetch(`${API}/api/products/new/${pid}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: pid,
            title: `PW Security Fixture ${pid}`,
            price: 499,
            originalPrice: 599,
            thumbnail:
              "https://cdn.dummyjson.com/product-images/smartphones/vivo-s1/thumbnail.webp",
            description: "Fixture for security tests.",
            detailedDescription: "Fixture for automated security tests.",
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

  test("guests are blocked from privileged endpoints", async () => {
    const api = await apiContext();
    for (const [method, path] of [
      ["get", "/api/orders/list"],
      ["get", "/api/users"],
      ["get", "/api/analytics/orders-summary"],
      ["get", "/api/support"],
      ["post", "/api/orders"],
    ]) {
      const r =
        method === "get" ? await api.get(path) : await api.post(path, { data: {} });
      expect([401, 403], `${method} ${path} -> ${r.status()}`).toContain(r.status());
    }
    await api.dispose();
  });

  test("regular users cannot use admin endpoints or change roles", async ({
    page,
  }) => {
    customer = await signupAs(page, "sec");
    const checks = await page.evaluate(async ({ API }) => {
      const get = async (p) => (await fetch(`${API}${p}`, { credentials: "include" })).status;
      const post = async (p, b) =>
        (
          await fetch(`${API}${p}`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(b ?? {}),
          })
        ).status;
      const patch = async (p, b) =>
        (
          await fetch(`${API}${p}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(b ?? {}),
          })
        ).status;
      return {
        ordersList: await get("/api/orders/list"),
        usersList: await get("/api/users"),
        analytics: await get("/api/analytics/orders-summary"),
        adminSupport: await get("/api/support"),
        selfPromote: await patch("/api/users/auth/xxx/", {}),
        banSomeone: await post("/api/orders/ORD-FAKE/process", {}),
      };
    }, { API });
    expect(checks.ordersList).toBe(403);
    expect(checks.usersList).toBe(403);
    expect(checks.analytics).toBe(403);
    expect(checks.adminSupport).toBe(403);
    expect([400, 403, 404]).toContain(checks.selfPromote);
    expect([400, 403, 404]).toContain(checks.banSomeone);
  });

  test("users cannot read another customer's order", async ({ page, browser }) => {
    const ADDR = {
      name: "PW Sec",
      phoneNumber: "+919847000002",
      email: "pw-sec@example.com",
      street: "9 Test Lane, Kottakkal",
      city: "Malappuram",
      state: "Kerala",
      postalCode: "676505",
      country: "India",
      type: "home",
    };
    await loginAs(page, customer.email, customer.password);
    const made = await page.evaluate(
      async ({ API, FX_PID, ADDR }) => {
        const idem = `PWTEST-${Date.now()}`;
        const r = await fetch(`${API}/api/orders`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-Idempotency-Key": idem },
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
    expect(made.status).toBe(201);
    orderId = made.body.id;

    const c2 = await browser.newPage();
    const other = await signupAs(c2, "sec2");
    expect(other.email).toBeTruthy();
    const snoop = await c2.evaluate(async ({ API, orderId }) => {
      const r = await fetch(`${API}/api/orders/${orderId}`, { credentials: "include" });
      return r.status;
    }, { API, orderId });
    expect([403, 404]).toContain(snoop);
    await c2.close();
  });

  test("tampered Razorpay signature creates no order; bad webhook rejected", async ({
    page,
  }) => {
    await loginAs(page, customer.email, customer.password);
    const before = await page.evaluate(async ({ API }) => {
      const r = await fetch(`${API}/api/orders/user-orders`, { credentials: "include" });
      const j = await r.json().catch(() => []);
      return Array.isArray(j) ? j.length : (j.orders ?? []).length;
    }, { API });

    const attempt = await page.evaluate(async ({ API, FX_PID }) => {
      const ADDR = {
        name: "PW Sec",
        phoneNumber: "+919847000002",
        email: "pw-sec@example.com",
        street: "9 Test Lane, Kottakkal",
        city: "Malappuram",
        state: "Kerala",
        postalCode: "676505",
        country: "India",
        type: "home",
      };
      const r = await fetch(`${API}/api/payments/razorpay/create`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ productId: FX_PID, quantity: 1 }],
          shippingAddress: ADDR,
          billingAddress: ADDR,
        }),
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }, { API, FX_PID });
    expect(attempt.status, JSON.stringify(attempt.body)).toBe(201);

    // Tampered signature must be rejected and create no order.
    const badVerify = await page.evaluate(async ({ API, attempt }) => {
      const r = await fetch(`${API}/api/payments/razorpay/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: attempt.body.attemptId,
          razorpay_order_id: attempt.body.razorpayOrderId,
          razorpay_payment_id: "pay_TAMPERED",
          razorpay_signature: "deadbeef".repeat(8),
        }),
      });
      return r.status;
    }, { API, attempt });
    expect([400, 401, 404, 422]).toContain(badVerify);

    const after = await page.evaluate(async ({ API }) => {
      const r = await fetch(`${API}/api/orders/user-orders`, { credentials: "include" });
      const j = await r.json().catch(() => []);
      return Array.isArray(j) ? j.length : (j.orders ?? []).length;
    }, { API });
    expect(after).toBe(before); // no order conjured by a bad signature

    // Unsigned garbage webhook must not verify anything.
    const api = await apiContext();
    const hook = await api.post("/api/payments/webhooks/razorpay", {
      data: { event: "payment.captured", payload: { payment: { entity: { id: "pay_X" } } } },
    });
    expect([400, 401]).toContain(hook.status());
    await api.dispose();

    // Fixture cleanup.
    await page.evaluate(async ({ API, FX_PID }) => {
      await fetch(`${API}/api/products/${FX_PID}`, {
        method: "DELETE",
        credentials: "include",
      });
    }, { API, FX_PID });
  });
});
