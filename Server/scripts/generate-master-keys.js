import { randomBytes } from "node:crypto";
import { writeFile, chmod, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

/* ============================================================================
 * Generate the Tier A master key file: Server/secrets/master-keys.json
 *
 * Usage:  npm run keys:generate         (from Server/; idempotent — refuses
 *                                        to overwrite an existing file)
 * Rotation (later):
 *   1. node scripts/generate-master-keys.js --rotate   (appends a NEW active
 *      key; old rows keep decrypting — wrapped DEKs remember their key id)
 *   2. node scripts/migrate-encryption.js              (re-seals old rows)
 *   3. after the migration, optionally prune the retired entry by hand.
 *
 * NEVER commit secrets/. Back the file up out-of-band (password manager /
 * HSM vault). Losing ALL master keys makes Tier A data unrecoverable.
 * ============================================================================
 */

const keyPath = resolve("secrets", "master-keys.json");
const argMode = process.argv[2];
const keyId = `k${Date.now().toString(36)}`;

const entry = {
  version: 1,
  keys: [
    {
      id: keyId,
      algorithm: "AES-256-GCM",
      key: randomBytes(32).toString("base64url"),
      createdAt: new Date().toISOString(),
    },
  ],
};

try {
  await mkdir(resolve("secrets"), { recursive: true });

  let existing = null;
  try {
    const { readFile } = await import("node:fs/promises");
    existing = JSON.parse(await readFile(keyPath, "utf8"));
  } catch {
    existing = null;
  }

  if (argMode === "--rotate") {
    if (!existing) {
      console.error("No existing master-keys.json — run without --rotate first.");
      process.exitCode = 1;
    } else {
      existing.keys.push({
        id: keyId,
        algorithm: "AES-256-GCM",
        key: randomBytes(32).toString("base64url"),
        createdAt: new Date().toISOString(),
      });
      await writeFile(keyPath, JSON.stringify(existing, null, 2), {
        mode: 0o600,
      });
      await chmod(keyPath, 0o600);
      console.log(
        `Rotated master keys: appended "${keyId}" as the new ACTIVE key.`,
      );
      console.log("Next: run scripts/migrate-encryption.js to re-seal rows.");
    }
  } else {
    if (existing) {
      console.error(
        `master-keys.json already exists (${keyPath}). ` +
          "Refusing to overwrite — use --rotate to append a new key.",
      );
      process.exitCode = 1;
    } else {
      await writeFile(keyPath, JSON.stringify(entry, null, 2), { mode: 0o600 });
      await chmod(keyPath, 0o600);
      console.log("Tier A master keys generated:", keyPath);
      console.log("Active key id:", keyId);
      console.log(
        "Backup this file SECURELY (password manager / offline vault).",
      );
      console.log("Never commit secrets/ to Git. Add it to .gitignore.");
      console.log(
        "Rotate later with: npm run keys:rotate && node scripts/migrate-encryption.js",
      );
    }
  }
} catch (err) {
  console.error("Could not create master keys:", err?.message ?? err);
  process.exitCode = 1;
}
