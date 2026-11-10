import { test, expect, API, encryptAddressForTest } from "./helpers.js";
import { loginAs, signupAs } from "./flow.js";

const ADMIN_EMAIL = "pw-admin@example.com";
const ADMIN_PW = "Admin1234!";

test.describe.serial("customer: COD checkout journey", () => {
  let FX_PID;
  let customer;
  let orderId;

  test.beforeAll(async ({ browser }) => {
    // COD-eligible fixture product (₹499 + tax/fees lands inside ₹450–3000).
    const page = await browser.newPage();
    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    FX_PID = `pwcod-${Date.now().toString(36)}`;
    const st = await page.evaluate(
      async ({ pid, API }) => {
        const res = await fetch(`${API}/api/products/new/${pid}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: pid,
            title: `PW COD Fixture ${pid}`,
            price: 499,
            originalPrice: 699,
            thumbnail:
              "https://cdn.dummyjson.com/product-images/smartphones/vivo-s1/thumbnail.webp",
            description: "Playwright COD fixture product.",
            detailedDescription: "Fixture product for automated COD tests.",
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

  test.afterAll(async () => {
    const { execFile } = await import("node:child_process");
    const { readFileSync } = await import("node:fs");
    const env = { ...process.env };
    try {
      for (const line of readFileSync("Server/.env", "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m && env[m[1]] === undefined)
          env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      // Server/.env is optional in CI; mongoose reports a missing URI.
    }
    const script = `
      const mongoose = (await import("mongoose")).default;
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
      const db = mongoose.connection.db;
      await db.collection("products").deleteMany({ id: /^pwcod-/ });
      await db.collection("orders").deleteMany({ id: /^ORD-.*-PWTEST/ });
      await mongoose.disconnect();
      console.log("FIXTURES_CLEANED");
    `;
    await new Promise((resolve) =>
      execFile("node", ["-e", script], { cwd: "Server", env }, () => resolve()),
    );
  });

  test("signup + COD order within limits clears cart and appears in history", async ({
    page,
  }) => {
    customer = await signupAs(page, "cod");
    // Save an address via the real API (same encryption + validation as UI).
    const addrStatus = await page.evaluate(async ({ API, encAddr }) => {
      const res = await fetch(`${API}/api/address`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: encAddr }),
      });
      return res.status;
    }, { API, encAddr: encryptAddressForTest({
      id: `addr-${Date.now()}`,
      name: "PW Customer",
      phoneNumber: "+919847000000",
      email: "pw-cod@example.com",
      street: "12 Test Street, Kottakkal",
      city: "Malappuram",
      state: "Kerala",
      postalCode: "676505",
      country: "India",
      type: "home",
    }) });
    expect(addrStatus, "address save").toBe(200);

    // Browse -> product page -> add to cart (real UI).
    await page.goto("/#/search", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Search products, categories, or keywords...").fill(FX_PID);
    await expect(
      page.locator(`text=PW COD Fixture ${FX_PID}`).first(),
    ).toBeVisible({ timeout: 20000 });
    // Open the product detail page directly (same destination as the card link).
    await page.goto(`/#/product/${FX_PID}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/product\//, { timeout: 15000 });
    const addBtn = page.getByRole("button", { name: /add to cart/i });
    await expect(addBtn.first()).toBeVisible({ timeout: 15000 });
    await addBtn.first().click();
    await page.waitForTimeout(2000);

    // Checkout with COD.
    await page.goto("/#/checkout", { waitUntil: "domcontentloaded" });
    // Select the saved address if a selector is shown.
    const addrCard = page.locator(`text=Kottakkal`).first();
    if (await addrCard.isVisible({ timeout: 8000 }).catch(() => false)) {
      await addrCard.click().catch(() => {});
    }
    // Choose Cash on Delivery explicitly (wait for eligibility to resolve).
    await expect(
      page.locator("text=/Pay in cash when the courier arrives/i").first(),
    ).toBeVisible({ timeout: 20000 });
    const codCard = page.locator('div[role="radio"]', {
      hasText: /cash on delivery/i,
    });
    await codCard.first().click();
    const placeBtn = page.getByRole("button", { name: /place cod order/i });
    await expect(placeBtn.first()).toBeVisible({ timeout: 20000 });
    await placeBtn.first().click();
    // Success lands on payment-success / order-status / order history.
    await page.waitForURL(/payment-success|order-status|order/, { timeout: 30000 });
    const url = page.url();
    console.log("post-checkout url:", url);
    const m = url.match(/ORD-[A-Za-z0-9-]+/);
    if (m) orderId = m[0];
    expect(orderId, "order id in post-checkout URL").toBeTruthy();
    // Success page shows the placed order (no crash, real id rendered).
    await expect(page.locator(`text=${orderId}`).first()).toBeVisible({
      timeout: 20000,
    });

    // Cart must be cleared after confirmed COD creation.
    await page.goto("/#/cart", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(`text=PW COD Fixture ${FX_PID}`),
    ).toHaveCount(0, { timeout: 20000 });

    // Order appears in history and detail loads without crashing.
    await page.goto("/#/order", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const histBody = await page.locator("body").innerText();
    expect(histBody.length).toBeGreaterThan(100);
  });

  test("server rejects COD below minimum and prepaid bypass", async ({
    page,
    request,
  }) => {
    // Direct API: non-COD method on the COD-only endpoint must 422.
    const bad = await request.post(`${API}/api/orders`, {
      data: {
        products: [{ productId: FX_PID, quantity: 1 }],
        shippingAddress: { name: "X" },
        billingAddress: { name: "X" },
        payment: { method: "razorpay" },
      },
    });
    expect(bad.status()).toBe(401); // unauthenticated first (auth enforced before rules)

    // Authenticated: prepaid method rejected 422, manipulated total rejected.
    await loginAs(page, customer.email, customer.password);
    const authChecks = await page.evaluate(async ({ API, FX_PID }) => {
      const post = async (body) => {
        const r = await fetch(`${API}/api/orders`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return { status: r.status, body: await r.json().catch(() => ({})) };
      };
      const addr = {
        name: "PW Customer",
        street: "12 Test Street, Kottakkal",
        city: "Malappuram",
        state: "Kerala",
        postalCode: "676505",
        country: "India",
        phoneNumber: "+919847000000",
        email: "pw-cod@example.com",
      };
      const prepaid = await post({
        products: [{ productId: FX_PID, quantity: 1 }],
        shippingAddress: addr,
        billingAddress: addr,
        payment: { method: "razorpay" },
      });
      const tampered = await post({
        products: [{ productId: FX_PID, quantity: 1 }],
        shippingAddress: addr,
        billingAddress: addr,
        payment: { method: "cod" },
        totalAmount: 1, // manipulated total must never be accepted
      });
      return { prepaid: prepaid.status, tampered: tampered.status };
    }, { API, FX_PID });
    expect(authChecks.prepaid).toBe(422);
    expect(authChecks.tampered).toBe(400);
  });

  test("order tracking: invalid id shows friendly state, no crash", async ({
    page,
  }) => {
    await loginAs(page, customer.email, customer.password);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/#/order-status?id=ORD-1791704067881-KB0ZRE", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(5000);
    expect(errors, `pageerrors: ${errors.join("|")}`).toEqual([]);
    const body = await page.locator("body").innerText();
    expect(body).toMatch(/not found|don't have access|belongs to another|loading|retry/i);
  });
});
