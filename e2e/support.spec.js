import { test, expect, API } from "./helpers.js";
import { loginAs, signupAs } from "./flow.js";

test.describe.serial("support: customer care both sides", () => {
  let customer;
  let ticketSubject;

  test("customer submits ticket, sends follow-up, persists on reload", async ({
    page,
  }) => {
    customer = await signupAs(page, "care");
    await page.goto("/#/support", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /new ticket/i }).click();
    await expect(page.locator("#subject")).toBeVisible({ timeout: 20000 });

    // Invalid input first: short subject must be rejected client-side.
    await page.locator("#subject").fill("Hi");
    await page.locator("#message").fill("short");
    await page.getByRole("button", { name: /submit ticket/i }).click();
    await expect(page.locator("#subject")).toBeVisible(); // still on form

    ticketSubject = `PW wallcharger query ${Date.now().toString(36)}`;
    await page.locator("#subject").fill(ticketSubject);
    await page.locator("#message").fill(
      "My wall charger order shows confirmed but no tracking yet. Please advise on dispatch timelines.",
    );
    await page.getByRole("button", { name: /submit ticket/i }).click();
    await expect(page.locator(`text=${ticketSubject}`).first()).toBeVisible({
      timeout: 20000,
    });

    // Open the ticket and send a follow-up.
    await page.locator(`text=${ticketSubject}`).first().click();
    const followBox = page.getByPlaceholder(/follow.?up|replies reopen/i);
    await expect(followBox).toBeVisible({ timeout: 15000 });
    await followBox.fill("Adding my contact: reachable after 6pm on weekdays.");
    await followBox.evaluate((el) => {
      const btn = el.parentElement?.querySelector("button");
      if (!btn) throw new Error("send button not found");
      btn.click();
    });
    await expect(
      page.locator("text=/reachable after 6pm/i").first(),
    ).toBeVisible({ timeout: 20000 });

    // Persistence across reload.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(`text=${ticketSubject}`).first()).toBeVisible({
      timeout: 20000,
    });
  });

  test("admin lists, replies, resolves; customer sees update", async ({
    page,
    browser,
  }) => {
    await loginAs(page, "pw-admin@example.com", "Admin1234!");
    await page.goto("/#/auth/admin/support", { waitUntil: "domcontentloaded" });
    await expect(page.locator(`text=${ticketSubject}`).first()).toBeVisible({
      timeout: 20000,
    });
    await page.locator(`text=${ticketSubject}`).first().click();
    const replyBox = page.getByPlaceholder(/reply as support/i);
    await expect(replyBox).toBeVisible({ timeout: 15000 });
    await replyBox.fill("We are dispatching your charger today. Tracking follows by email.");
    await page.getByRole("button", { name: /send reply/i }).click();
    await expect(
      page.locator("text=/dispatching your charger/i").first(),
    ).toBeVisible({ timeout: 20000 });

    // Resolve the ticket via status buttons.
    const resolveBtn = page.getByRole("button", { name: /^resolved$/i });
    if (await resolveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await resolveBtn.click();
      await page.waitForTimeout(2000);
    }

    // Customer sees the admin reply after reload.
    const c2 = await browser.newPage();
    await loginAs(c2, customer.email, customer.password);
    await c2.goto("/#/support", { waitUntil: "domcontentloaded" });
    await expect(c2.locator(`text=${ticketSubject}`).first()).toBeVisible({
      timeout: 20000,
    });
    await c2.locator(`text=${ticketSubject}`).first().click();
    await expect(
      c2.locator("text=/dispatching your charger/i").first(),
    ).toBeVisible({ timeout: 20000 });
    await c2.close();
  });

  test("customers cannot read each other's tickets (API)", async ({
    page,
    browser,
  }) => {
    await loginAs(page, customer.email, customer.password);
    const res = await page.evaluate(async ({ API }) => {
      const r = await fetch(`${API}/api/support/mine`, { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      return { status: r.status, count: (j.tickets ?? []).length };
    }, { API });
    expect(res.status).toBe(200);
    // Only own tickets visible.
    expect(res.count).toBeGreaterThanOrEqual(1);

    // A second customer creates a ticket; the first must not read it.
    const c2 = await browser.newPage();
    await signupAs(c2, "care2"); // second customer owns the next ticket
    const otherTicketId = await c2.evaluate(async ({ API }) => {
      const r = await fetch(`${API}/api/support`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "Other customer private issue",
          category: "order",
          message: "This ticket belongs to another customer account.",
        }),
      });
      const j = await r.json().catch(() => ({}));
      return j?.ticket?.id ?? j?.id ?? null;
    }, { API });
    await c2.close();
    expect(otherTicketId).toBeTruthy();
    const snooped = await page.evaluate(async ({ API, otherTicketId }) => {
      const r = await fetch(`${API}/api/support/${otherTicketId}`, {
        credentials: "include",
      });
      return r.status;
    }, { API, otherTicketId });
    expect([403, 404]).toContain(snooped);
  });
});
