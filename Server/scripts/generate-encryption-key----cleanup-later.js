import { randomBytes } from "node:crypto";
import { writeFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";

const key = randomBytes(96);
const keyPath = resolve("Server/secrets/qe-master-key");

try {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(resolve("Server/secrets"), { recursive: true });

  await writeFile(keyPath, key, { flag: "wx", mode: 0o600 });
  await chmod(keyPath, 0o600);

  console.log("QE master key generated.");
  console.log(`Key location: ${keyPath}`);
  console.log("Back up this key securely. Never commit it to Git.");
} catch (error) {
  console.error("Could not create key:", error.message);
  process.exitCode = 1;
}
