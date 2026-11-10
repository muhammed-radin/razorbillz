import { test as base, expect, request as pwRequest } from "@playwright/test";
import CryptoJS from "crypto-js";
import { readFileSync } from "node:fs";

export const test = base;
export { expect };

export const API = "http://localhost:4128";

/* Address encryption in Node — identical scheme to src/utils/crypt.js
 * (CryptoJS AES with the VITE_CRYPTED key, JSON.stringify per field).
 * Used instead of in-page `import("/src/utils/crypt.js")`, which only works
 * when the app is served by vite dev (vite preview serves a static build). */
const CRYPT_KEY =
  (readFileSync(new URL("../Server/.env", import.meta.url), "utf8").match(
    /VITE_CRYPTED(?:_STRICT)?="([^"]+)"/,
  ) || [])[1] ?? "12345678";

export function encryptAddressForTest(address) {
  return Object.fromEntries(
    Object.entries(address).map(([key, value]) => [
      key,
      key === "id"
        ? value
        : CryptoJS.AES.encrypt(JSON.stringify(value), CRYPT_KEY).toString(),
    ]),
  );
}

/** Fresh API context (no cookies) for negative/security tests. */
export async function apiContext() {
  return pwRequest.newContext({ baseURL: API });
}

export function rand(suffix = "") {
  return `pw${Date.now().toString(36)}${suffix}`;
}

/** Promote/demote/delete test users directly in the DB. */
export async function dbHelper(action, email) {
  const { execFile } = await import("node:child_process");
  const { readFileSync } = await import("node:fs");
  // DB resolution order: explicit process env (the documented test convention
  // `MONGODB_URI=mongodb://127.0.0.1:27017/razorbills …`), then Server/.env.
  // Never assume .env alone — it may point at a different environment than
  // the server under test.
  const env = { ...process.env };
  try {
    for (const line of readFileSync("Server/.env", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && env[m[1]] === undefined) {
        env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // fall through; mongoose will report a missing URI
  }
  const script = `
    const mongoose = (await import("mongoose")).default;
    (async () => {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
      const db = mongoose.connection.db;
      const email = ${JSON.stringify(email)};
      if (${JSON.stringify(action)} === "promote") {
        // Role lives in TWO collections: the app users doc (used by
        // requireAdmin fallbacks/listing) and the better-auth identity
        // (source of session.user.role). Both must agree.
        await db.collection("users").updateOne({ email }, { $set: { role: "admin", adminPermissions: ["read", "create", "update", "delete", "write"] } });
        await db.collection("users_validation").updateOne({ email }, { $set: { role: "admin", adminPermissions: ["read", "create", "update", "delete", "write"] } });
        console.log("PROMOTED", email);
      } else if (${JSON.stringify(action)} === "demote") {
        await db.collection("users").updateOne({ email }, { $set: { role: "user", adminPermissions: [] } });
        await db.collection("users_validation").updateOne({ email }, { $set: { role: "user", adminPermissions: [] } });
        console.log("DEMOTED", email);
      } else if (${JSON.stringify(action)} === "cleanup") {
        const u = await db.collection("users").findOne({ email });
        if (u) {
          await db.collection("users").deleteOne({ email });
          await db.collection("users_validation").deleteMany({ email });
          await db.collection("carts").deleteMany({ userId: u.id });
          await db.collection("orders").deleteMany({ userId: u.id, id: /^ORD-.*-PWTEST/ });
          console.log("CLEANED", email);
        } else console.log("ABSENT", email);
      }
      await mongoose.disconnect();
    })().catch((e) => { console.error("DBHELPER_FAIL", e.message); process.exit(1); });
  `;
  return new Promise((resolve, reject) => {
    execFile(
      "node",
      ["-e", script],
      { cwd: "Server", env },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stdout + stderr));
        resolve(stdout.trim());
      },
    );
  });
}
