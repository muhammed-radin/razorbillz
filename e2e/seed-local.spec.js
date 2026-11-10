import { test, expect, API, dbHelper } from "./helpers.js";
import { loginAs } from "./flow.js";

// Local-dev seeder: builds a minimal catalog + mixed-status orders on an
// EMPTY database (e.g. fresh local Mongo or empty Atlas project).
// Run:  MONGODB_URI=mongodb://127.0.0.1:27017/razorbills npx playwright test e2e/seed-local.spec.js
// The dbHelper + backend both resolve MONGODB_URI from the environment first.

const ADMIN = { name: "Seed Admin", email: "seed-admin@example.com", password: "Admin1234!" };
const CUSTOMER = { name: "Seed Customer", email: "seed-customer@example.com", password: "Test1234!" };

const ADDR = {
  name: "Seed Customer",
  phoneNumber: "+919847000010",
  email: "seed-customer@example.com",
  street: "5 Seed Farm Road, Kottakkal",
  city: "Malappuram",
  state: "Kerala",
  postalCode: "676505",
  country: "India",
  type: "home",
};

const PRODUCTS = [
  {
    id: "seed-resistor-kit",
    title: "Seed Resistor Kit 500pcs",
    price: 499,
    originalPrice: 699,
    thumbnail: "https://cdn.dummyjson.com/product-images/smartphones/vivo-s1/thumbnail.webp",
    description: "Local-dev seed product, COD eligible.",
    detailedDescription: "A 500-piece resistor kit for local development and COD testing.",
    category: "components",
    stock: 50,
    brand: "SeedTest",
  },
  {
    id: "seed-uno-board",
    title: "Seed Uno R3 Board",
    price: 1499,
    originalPrice: 1999,
    thumbnail: "https://cdn.dummyjson.com/product-images/smartphones/vivo-s1/thumbnail.webp",
    description: "Local-dev seed microcontroller board.",
    detailedDescription: "Microcontroller development board for local testing.",
    category: "components",
    stock: 25,
    brand: "SeedTest",
  },
  {
    id: "seed-led-strip",
    title: "Seed LED Strip 5m",
    price: 899,
    originalPrice: 1299,
    thumbnail: "https://cdn.dummyjson.com/product-images/smartphones/vivo-s1/thumbnail.webp",
    description: "Local-dev seed LED strip.",
    detailedDescription: "Five metre LED strip for local testing.",
    category: "audio",
    stock: 40,
    brand: "SeedTest",
  },
];

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

test.describe.serial("seed local database", () => {
  test("admin account exists and is promoted", async ({ page }) => {
    await dbHelper("cleanup", ADMIN.email).catch(() => {});
    await page.goto("/#/signup", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder(/full name|name/i).first().fill(ADMIN.name);
    await page.getByPlaceholder(/email/i).first().fill(ADMIN.email);
    await page.getByPlaceholder(/password/i).first().fill(ADMIN.password);
    await page.getByRole("button", { name: /continue with email/i }).click();
    await page.waitForURL(/.*#\/$|.*#\/login.*/, { timeout: 25000 });
    console.log(await dbHelper("promote", ADMIN.email));
  });

  test("categories + products seeded", async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password);
    for (const c of [
      { id: "components", name: "Components", description: "Electronic components" },
      { id: "audio", name: "Audio", description: "Audio gadgets" },
    ]) {
      const r = await apiFetch(page, "/api/categories", { method: "POST", body: c });
      expect([200, 201, 409], `category ${c.id}`).toContain(r.status);
    }
    for (const p of PRODUCTS) {
      const r = await apiFetch(page, `/api/products/new/${p.id}`, {
        method: "POST",
        body: { ...p, isActive: true, owner: {} },
      });
      expect([200, 201, 403], `product ${p.id}: ${JSON.stringify(r.data).slice(0, 120)}`).toContain(r.status);
    }
  });

  test("customer + mixed-status orders seeded", async ({ page, browser }) => {
    await dbHelper("cleanup", CUSTOMER.email).catch(() => {});
    const c = await browser.newPage();
    await c.goto("/#/signup", { waitUntil: "domcontentloaded" });
    await c.getByPlaceholder(/full name|name/i).first().fill(CUSTOMER.name);
    await c.getByPlaceholder(/email/i).first().fill(CUSTOMER.email);
    await c.getByPlaceholder(/password/i).first().fill(CUSTOMER.password);
    await c.getByRole("button", { name: /continue with email/i }).click();
    await c.waitForURL(/.*#\/$|.*#\/login.*/, { timeout: 25000 });

    const ids = [];
    for (let i = 0; i < 3; i++) {
      const idem = `SEED-${Date.now()}-${i}`;
      const r = await apiFetch(c, "/api/orders", {
        method: "POST",
        body: {
          products: [{ productId: "seed-resistor-kit", quantity: 1 }],
          shippingAddress: ADDR,
          billingAddress: ADDR,
          payment: { method: "cod" },
          idempotencyKey: idem,
        },
      });
      expect(r.status, JSON.stringify(r.data).slice(0, 200)).toBe(201);
      ids.push(r.data.id);
    }
    console.log("seed orders:", ids.join(","));

    // Drive statuses: packed / delivered / cancelled (confirmed stays).
    await loginAs(page, ADMIN.email, ADMIN.password);
    expect((await apiFetch(page, `/api/orders/${ids[0]}/process`, { method: "POST" })).status).toBe(200);
    expect((await apiFetch(page, `/api/orders/${ids[0]}/packed`, { method: "POST" })).status).toBe(200);
    for (const op of ["process", "packed", "ship", "deliver"]) {
      const st = await apiFetch(page, `/api/orders/${ids[1]}/${op}`, {
        method: "POST",
        body: op === "ship" ? { trackingNumber: "SEEDAWB1", serviceName: "SeedCourier" } : {},
      });
      expect(st.status, `seed ${op}`).toBe(200);
    }
    // Customer requests cancel on the third; admin approves.
    expect(
      (await apiFetch(c, `/api/orders/${ids[2]}/cancel`, { method: "POST", body: { reason: "Ordered by mistake" } })).status,
    ).toBe(200);
    expect((await apiFetch(page, `/api/orders/${ids[2]}/cancel/approve`, { method: "POST" })).status).toBe(200);
    await c.close();
  });
});
