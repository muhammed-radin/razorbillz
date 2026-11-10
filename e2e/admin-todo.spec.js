import { test, expect, API, encryptAddressForTest } from "./helpers.js";
import { loginAs, signupAs } from "./flow.js";

const ADMIN_EMAIL = "pw-admin@example.com";
const ADMIN_PW = "Admin1234!";

// 1x1 red PNG — real decodable image for the webp-conversion + Cloudinary path.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const ADDR = {
  name: "PW Todo",
  phoneNumber: "+919847000011",
  email: "pw-todo@example.com",
  street: "9 Todo Lane, Kottakkal",
  city: "Malappuram",
  state: "Kerala",
  postalCode: "676505",
  country: "India",
  type: "home",
};

/* ------------------------- 1. categories ------------------------------ */

test.describe.serial("admin categories: icon picker + webp logo upload", () => {
  let catId;
  let pickedIcon = "";

  test("icon picker + logo upload + create end-to-end", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    await page.goto("/#/auth/admin/categories", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1", { hasText: /^categories$/i })).toBeVisible({ timeout: 20000 });

    await page.getByRole("button", { name: /new category/i }).click();
    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible();

    catId = `pwtodo-cat-${Date.now().toString(36)}`;
    // Fill name first, then override the auto-slugged id with our own.
    await dialog.locator('input[placeholder*="Microcontrollers"]').fill("PW Todo Cats");
    await dialog.locator('input[placeholder*="microcontrollers"]').fill(catId);
    await dialog.locator("textarea").fill("Icon picker + logo upload test category.");

    // --- IconPicker: fuzzy search, pick first filtered result ----------
    await dialog.getByRole("button", { name: /pick an icon/i }).click();
    const grid = page.locator(".max-h-60");
    await grid.locator("button").first().waitFor({ state: "visible", timeout: 20000 });
    expect(await grid.locator("button").count()).toBeGreaterThan(0);
    await page.getByPlaceholder(/search for an icon/i).fill("cpu");
    await page.waitForTimeout(800);
    expect(await grid.locator("button").count()).toBeGreaterThan(0);
    await grid.locator("button").first().click();
    const shown = await dialog.locator("text=/^lucide: .+/").innerText();
    pickedIcon = shown.replace("lucide:", "").trim();
    expect(pickedIcon.length, "picked icon name").toBeGreaterThan(0);

    // --- Logo: real webp conversion + Cloudinary upload on save --------
    await dialog.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: "cat-logo.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await expect(dialog.locator('img[alt="Logo preview"]')).toBeVisible({ timeout: 10000 });
    await expect(dialog.locator("text=/converted \\.webp/i")).toBeVisible();
    await expect(dialog.locator("text=/uploads on save/i")).toBeVisible();

    await dialog.getByRole("button", { name: /^create$/i }).click();
    await expect(page.locator("text=/category created/i")).toBeVisible({ timeout: 45000 });
    await expect(dialog).toBeHidden();

    // Real server state: icon name stored, Logo is an uploaded webp URL.
    const cat = await page.evaluate(async ({ API, catId }) => {
      const r = await fetch(`${API}/api/categories/${catId}`, { credentials: "include" });
      return r.json().catch(() => ({}));
    }, { API, catId });
    expect(cat.icon, JSON.stringify(cat)).toBe(pickedIcon);
    expect(cat.Logo, JSON.stringify(cat)).toMatch(/res\.cloudinary\.com/);
    expect(cat.Logo).toMatch(/\.webp/);
  });

  test("row shows icon + uploaded logo, cleanup removes category", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    await page.goto("/#/auth/admin/categories", { waitUntil: "domcontentloaded" });
    const row = page.locator("tr", { hasText: catId });
    await expect(row).toBeVisible({ timeout: 20000 });
    await expect(row.locator('img[alt="PW Todo Cats logo"]')).toBeVisible();
    await expect(row.locator("svg.lucide").first()).toBeVisible();

    // UI delete with confirm dialog
    page.on("dialog", (d) => d.accept());
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("text=/category deleted/i")).toBeVisible({ timeout: 20000 });
    await expect(row).toHaveCount(0, { timeout: 20000 });
  });
});

/* --------------------- 2. orders dynamic menu -------------------------- */

test.describe.serial("admin orders: dynamic action menu by state", () => {
  let FX_PID;
  let customer;
  let orderId;

  const openMenu = async (page) => {
    const row = page.locator("tr", { hasText: orderId });
    await expect(row).toBeVisible({ timeout: 25000 });
    const trigger = row.locator('button[aria-label="Order actions"]');
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await page.keyboard.press("Escape"); // close any half-open menu
        await page.waitForTimeout(1200);
      }
      await trigger.click();
      const menu = page.getByRole("menu");
      try {
        await menu.waitFor({ state: "visible", timeout: 5000 });
        return menu;
      } catch {
        /* re-render races can swallow the first open — retry */
      }
    }
    throw new Error("Order actions menu did not open");
  };

  const searchOrder = async (page) => {
    await page.goto("/#/auth/admin/orders", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1", { hasText: /^orders$/i })).toBeVisible({ timeout: 20000 });
    await page.getByPlaceholder("Search orders...").fill(orderId);
    await page.waitForTimeout(1500);
  };

  test("fixture: product + fresh COD order (pending)", async ({ page, browser }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    FX_PID = `pwmn-${Date.now().toString(36)}`;
    const st = await page.evaluate(
      async ({ pid, API }) => {
        const res = await fetch(`${API}/api/products/new/${pid}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: pid,
            title: `PW Menu Fixture ${pid}`,
            price: 599,
            originalPrice: 699,
            thumbnail: "https://cdn.dummyjson.com/product-images/smartphones/vivo-s1/thumbnail.webp",
            description: "Fixture for dynamic order-menu tests.",
            detailedDescription: "Fixture for automated dynamic-menu tests.",
            category: "components",
            stock: 50,
            brand: "PWTest",
            isActive: true,
          }),
        });
        return res.status;
      },
      { pid: FX_PID, API },
    );
    expect(st).toBe(200);

    // Keep the admin session in this page; check out as a customer in a
    // fresh one (a logged-in user gets diverted away from /signup).
    const custPage = await browser.newPage();
    customer = await signupAs(custPage, "mn");
    const created = await custPage.evaluate(
      async ({ API, FX_PID, ADDR, encAddr }) => {
        await fetch(`${API}/api/address`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: encAddr }),
        });
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
      { API, FX_PID, ADDR, encAddr: encryptAddressForTest({ ...ADDR, id: `addr-${Date.now()}` }) },
    );
    expect([200, 201], JSON.stringify(created.body)).toContain(created.status);
    orderId = created.body.id;
    expect(orderId).toBeTruthy();
    await custPage.close();
  });

  test("pending order: quick ops + COD visible, later-stage ops hidden", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    await searchOrder(page);

    const menu = await openMenu(page);
    await expect(menu.getByRole("menuitem", { name: /move to processing/i })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /^mark packed$/i })).toBeHidden();
    await expect(menu.getByRole("menuitem", { name: /^mark shipped$/i })).toBeHidden();
    await expect(menu.getByRole("menuitem", { name: /track shipment/i })).toBeHidden();
    await expect(menu.getByRole("menuitem", { name: /mark delivered/i })).toBeHidden();
    await expect(menu.getByRole("menuitem", { name: /^create shipmozo shipment/i })).toBeHidden();
    await expect(menu.getByRole("menuitem", { name: /collect cod/i })).toBeVisible(); // COD + pending_collection
    await expect(menu.getByRole("menuitem", { name: /^cancel order$/i })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /approve cancel request/i })).toBeHidden();
    await page.keyboard.press("Escape");
  });

  test("cancellation request swaps Cancel Order for Approve/Deny", async ({ page, browser }) => {
    // Customer requests cancellation through the real API.
    const custPage = await browser.newPage();
    await loginAs(custPage, customer.email, customer.password);
    const st = await custPage.evaluate(async ({ API, orderId }) => {
      const r = await fetch(`${API}/api/orders/${orderId}/cancel`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Duplicated by mistake", detail: "menu test" }),
      });
      return r.status;
    }, { API, orderId });
    expect([200, 201, 400]).toContain(st); // 400 → already requested, acceptable
    await custPage.close();

    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    await searchOrder(page);

    let menu = await openMenu(page);
    await expect(menu.getByRole("menuitem", { name: /^cancel order$/i })).toBeHidden();
    await expect(menu.getByRole("menuitem", { name: /approve cancel request/i })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /deny cancel request/i })).toBeVisible();

    // Deny with a real reason through the decision dialog.
    await menu.getByRole("menuitem", { name: /deny cancel request/i }).click();
    const dlg = page.getByRole("dialog").filter({ hasText: /cancellation request/i }).first();
    await expect(dlg).toBeVisible();
    await dlg.locator("#decision-reason").fill("Stock was still shipped in time — keeping the order.");
    await dlg.getByRole("button", { name: /deny request/i }).click();
    await expect(page.locator("text=/request denied/i")).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1500);

    const menu2 = await openMenu(page);
    await expect(menu2.getByRole("menuitem", { name: /^cancel order$/i })).toBeVisible();
    await expect(menu2.getByRole("menuitem", { name: /approve cancel request/i })).toBeHidden();
    await page.keyboard.press("Escape");
  });

  test("processing → packed: menu follows the state machine", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    await searchOrder(page);

    // Pending → Processing via the REAL menu entry.
    let menu = await openMenu(page);
    await menu.getByRole("menuitem", { name: /move to processing/i }).click();
    await expect(page.locator("text=/order moved to processing/i")).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1500);

    menu = await openMenu(page);
    await expect(menu.getByRole("menuitem", { name: /move to processing/i })).toBeHidden();
    await expect(menu.getByRole("menuitem", { name: /^mark packed$/i })).toBeVisible();
    await page.keyboard.press("Escape");

    // Processing → Packed via the REAL menu entry.
    menu = await openMenu(page);
    await menu.getByRole("menuitem", { name: /^mark packed$/i }).click();
    await expect(page.locator("text=/order marked packed/i")).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1500);

    const menu3 = await openMenu(page);
    // Packed with NO AWB → shipment creation, not "Mark Shipped".
    await expect(menu3.getByRole("menuitem", { name: /^create shipmozo shipment/i })).toBeVisible();
    await expect(menu3.getByRole("menuitem", { name: /^mark shipped$/i })).toBeHidden();
    await expect(menu3.getByRole("menuitem", { name: /track shipment/i })).toBeHidden();
    await page.keyboard.press("Escape");
  });

  test("cancelled order: destructive + fulfilment actions disappear", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    const st = await page.evaluate(async ({ API, orderId }) => {
      const r = await fetch(`${API}/api/orders/${orderId}/updateStatus`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled", note: "Menu test cleanup" }),
      });
      return r.status;
    }, { API, orderId });
    expect(st).toBe(200);

    await searchOrder(page);

    const menu = await openMenu(page);
    await expect(menu.getByRole("menuitem", { name: /^cancel order$/i })).toBeHidden();
    await expect(menu.getByRole("menuitem", { name: /move to processing/i })).toBeHidden();
    await expect(menu.getByRole("menuitem", { name: /^mark packed$/i })).toBeHidden();
    await expect(menu.getByRole("menuitem", { name: /^create shipmozo shipment/i })).toBeHidden();
    await expect(menu.getByRole("menuitem", { name: /collect cod/i })).toBeHidden();
    await expect(menu.getByRole("menuitem", { name: /edit order/i })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("cleanup: delete fixture product", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    await page.evaluate(async ({ API, FX_PID }) => {
      await fetch(`${API}/api/products/${FX_PID}`, { method: "DELETE", credentials: "include" });
    }, { API, FX_PID });
  });
});

/* ---------------- 3/4. product .md import ------------------------------ */

const SPEC_MD = `| Label | Value |
| --- | --- |
| Clock Speed | 16 MHz |
| Digital Pins | 14 |`;

const FEATURE_MD = `- Genuine ATmega328P with pre-flashed bootloader
- 14 digital I/O pins
- USB programming port`;

test.describe.serial("admin products: .md / .csv import", () => {
  let createdProductId = "";

  test("specifications + features import from markdown (replace/append)", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    await page.goto("/#/auth/admin/products/new", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1", { hasText: /^create product$/i })).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1500); // hydration settle

    // Panels start collapsed ("basic" only) — open Specifications.
    await page.getByRole("button", { name: "Specifications" }).click();
    const importBtn = page.getByRole("button", { name: /^import$/i }).first();
    await expect(importBtn).toBeVisible({ timeout: 15000 });
    await importBtn.click();
    await page.getByRole("menuitem", { name: /paste text/i }).click();
    const dlg = page.getByRole("dialog").first();
    await expect(dlg).toBeVisible();
    await dlg.locator("textarea").fill(SPEC_MD);
    await dlg.getByRole("button", { name: /^import$/i }).click();
    await expect(dlg).toBeHidden();

    // Two parsed rows are now real inputs.
    const labelInputs = page.locator('input[placeholder="Specification name"]');
    await expect(labelInputs.nth(0)).toHaveValue("Clock Speed");
    await expect(labelInputs.nth(1)).toHaveValue("Digital Pins");
    expect(await page.locator('input[placeholder="Specification value"]').nth(0).inputValue()).toBe("16 MHz");

    // Features panel (type="single" closes specs — fine, they were asserted).
    await page.getByRole("button", { name: "Features" }).click();
    await page.getByRole("button", { name: /^import$/i }).first().click();
    await page.getByRole("menuitem", { name: /paste text/i }).click();
    await dlg.locator("textarea").fill(FEATURE_MD);
    await dlg.getByRole("button", { name: /^import$/i }).click();
    await expect(dlg).toBeHidden();
    const featureInputs = page.locator('input[placeholder="Product feature"]');
    await expect(featureInputs.nth(0)).toHaveValue("Genuine ATmega328P with pre-flashed bootloader");
    await expect(featureInputs.nth(2)).toHaveValue("USB programming port");

    // Append via pasted CSV-style lines — real second import.
    await page.getByRole("button", { name: /^import$/i }).first().click();
    await page.getByRole("menuitem", { name: /paste text/i }).click();
    await dlg.getByRole("button", { name: /^append$/i }).click();
    await dlg.locator("textarea").fill("IPX5 water resistance,Route 328P shield");
    await dlg.getByRole("button", { name: /^import$/i }).click();
    await expect(dlg).toBeHidden();
    await expect(featureInputs.nth(3)).toHaveValue("IPX5 water resistance");
    await expect(featureInputs.nth(4)).toHaveValue("Route 328P shield");
  });

  test("full product import from .md validates then creates", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    await page.goto("/#/auth/admin/products/new", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1", { hasText: /^create product$/i })).toBeVisible({ timeout: 20000 });

    const pid = `pwtodo-md-${Date.now().toString(36)}`;
    const fullMd = `---
id: ${pid}
title: PW Import Uno Board
category: components
brand: PWImport
sku: PW-MD-0001
price: 1299
originalPrice: 1599
stock: 12
tax: 18
currency: INR
isActive: true
rating: 4.2
reviewCount: 21
warranty: 1 year warranty
returnPolicy: 7 day return
shippingDetails: Ships in 2 days
width: 8
height: 3
depth: 5
weight: 220
thumbnail: https://cdn.dummyjson.com/product-images/smartphones/vivo-s1/thumbnail.webp
---
## Description

Import-ready ATmega328P board generated by the AI product document flow.

## Detailed Description

This product was created from a documented markdown product file to prove
the full-import pipeline end to end.

## Specifications

| Label | Value |
| --- | --- |
| Microcontroller | ATmega328P |
| Operating Voltage | 5V |

## Features

- Genuine ATmega328P with pre-flashed bootloader
- 14 digital I/O pins and 6 analog inputs

## Tags

arduino, uno, import test, pwtest

## Keywords

uno board test, import flow

## Images

- https://cdn.dummyjson.com/product-images/smartphones/vivo-s1/thumbnail.webp
`;

    await page.getByRole("button", { name: /import product/i }).click();
    const dlg = page.getByRole("dialog").first();
    await expect(dlg).toBeVisible();

    // The format documentation is viewable in-product.
    await dlg.getByRole("button", { name: /format documentation/i }).click();
    const docsDlg = page.getByRole("dialog").filter({ hasText: /Product document format/ });
    await expect(docsDlg.locator("pre").first()).toBeVisible({ timeout: 15000 });
    await docsDlg.getByRole("button", { name: "Close" }).first().click();

    await dlg.locator("textarea").fill(fullMd);
    await dlg.getByRole("button", { name: /^validate$/i }).click();
    await expect(dlg.locator("text=/valid md document/i")).toBeVisible({ timeout: 20000 });
    await expect(dlg.locator("text=/PW Import Uno Board/").first()).toBeVisible();

    await dlg.getByRole("button", { name: /apply to form/i }).click();
    await expect(dlg).toBeHidden();

    // Form + arrays were filled (draft persistence is the page's real store).
    await page.waitForTimeout(800);
    const drafts = await page.evaluate(() => ({
      form: JSON.parse(localStorage.getItem("newProductForm") ?? "{}"),
      arr: JSON.parse(localStorage.getItem("arrayDataForm") ?? "{}"),
    }));
    expect(drafts.form.title).toBe("PW Import Uno Board");
    expect(drafts.form.sku).toBe("PW-MD-0001");
    expect(drafts.form.brand).toBe("PWImport");
    expect(Number(drafts.form.price)).toBe(1299);
    expect(drafts.form.category).toBe("components");
    expect(drafts.form.height).toBe(3);
    expect(drafts.arr.specifications?.some((s) => s.label === "Microcontroller")).toBeTruthy();
    expect(drafts.arr.features?.length).toBeGreaterThanOrEqual(2);
    expect(drafts.arr.tags?.length).toBeGreaterThanOrEqual(3);

    // Thumbnail URL from the doc appears in the Images panel.
    await page.getByRole("button", { name: "Images" }).first().click();
    await expect(page.locator('img[src*="vivo-s1"]').first()).toBeVisible({ timeout: 20000 });

    // Submit → real product created on the server.
    await page.getByRole("button", { name: "Create Product" }).click();
    await expect(page.locator("text=/product created successfully/i")).toBeVisible({ timeout: 60000 });
    await page.waitForURL(/.*\/auth\/admin\/products$/, { timeout: 30000 });
    createdProductId = pid;

    const server = await page.evaluate(async ({ API, pid }) => {
      const r = await fetch(`${API}/api/products/${pid}`, { credentials: "include" });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }, { API, pid });
    expect(server.status).toBe(200);
    expect(server.body.title).toBe("PW Import Uno Board");
    expect(server.body.features.length).toBeGreaterThanOrEqual(2);
    expect(server.body.specifications.some((s) => s.label === "Microcontroller")).toBeTruthy();
  });

  test("invalid import is rejected by validation, nothing applied", async ({ page }) => {
    // Clean draft store so "untouched" is provable.
    await page.addInitScript(() => {
      localStorage.removeItem("newProductForm");
      localStorage.removeItem("arrayDataForm");
    });
    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    await page.goto("/#/auth/admin/products/new", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1", { hasText: /^create product$/i })).toBeVisible({ timeout: 20000 });

    await page.getByRole("button", { name: /import product/i }).click();
    const dlg = page.getByRole("dialog").first();
    await dlg.locator("textarea").fill(`---\nid: pwtodo-invalid-doc\nprice: 10\n---\n\n## Description\nToo short.\n`);
    await dlg.getByRole("button", { name: /^validate$/i }).click();
    await expect(dlg.locator("text=/validation failed/i")).toBeVisible({ timeout: 20000 });
    await expect(dlg.getByRole("button", { name: /apply to form/i })).toBeDisabled();
    await dlg.getByRole("button", { name: /^cancel$/i }).click();
    await expect(dlg).toBeHidden();

    const drafts = await page.evaluate(() => ({
      form: JSON.parse(localStorage.getItem("newProductForm") ?? "{}"),
      arr: JSON.parse(localStorage.getItem("arrayDataForm") ?? "{}"),
    }));
    expect(drafts.form.title ?? "").toBe("");
    expect(drafts.arr.specifications?.length ?? 0).toBeLessThanOrEqual(1);
  });

  test("cleanup: delete imported product", async ({ page }) => {
    if (!createdProductId) test.skip(true, "no product created");
    await loginAs(page, ADMIN_EMAIL, ADMIN_PW);
    await page.evaluate(async ({ API, pid }) => {
      await fetch(`${API}/api/products/${pid}`, { method: "DELETE", credentials: "include" });
    }, { API, pid: createdProductId });
  });
});
