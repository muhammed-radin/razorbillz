/**
 * Drops every collection in the configured MongoDB database.
 *
 * This is intentionally destructive. Require --confirm so an accidental
 * invocation cannot erase the database without an explicit confirmation.
 *
 * Usage:
 *   node scripts/drop-all-collections.js --confirm
 */

import "../utils/env.js";
import mongoose from "mongoose";
import {
  connectToDatabase,
  dropCollectionByName,
} from "../utils/db.js";

const CONFIRM_FLAG = "--confirm";

async function dropAllCollections() {
  if (!process.argv.includes(CONFIRM_FLAG)) {
    throw new Error(
      `Refusing to drop collections. Re-run with ${CONFIRM_FLAG} to confirm this destructive operation.`,
    );
  }

  console.log("[drop-all-collections] Connecting to MongoDB...");
  const [database, connection, agenda] = await connectToDatabase();
  const databaseName = database.databaseName;

  try {
    console.log(
      `[drop-all-collections] Connected to database "${databaseName}".`,
    );

    if (agenda) {
      console.log("[drop-all-collections] Stopping Agenda workers...");
      await agenda.stop();
      console.log("[drop-all-collections] Agenda workers stopped.");
    }

    const collections = await database.listCollections().toArray();
    console.log(
      `[drop-all-collections] Found ${collections.length} collection(s).`,
    );

    if (collections.length === 0) {
      console.log("[drop-all-collections] Nothing to drop.");
      return;
    }

    let dropped = 0;
    for (const { name } of collections) {
      console.log(`[drop-all-collections] Dropping "${name}"...`);
      await dropCollectionByName(name);
      dropped += 1;
      console.log(
        `[drop-all-collections] Dropped "${name}" (${dropped}/${collections.length}).`,
      );
    }

    console.log(
      `[drop-all-collections] Complete: dropped ${dropped} collection(s) from "${databaseName}".`,
    );
  } finally {
    if (connection.readyState !== 0) {
      console.log("[drop-all-collections] Closing MongoDB connection...");
      await connection.close();
      console.log("[drop-all-collections] MongoDB connection closed.");
    }
  }
}

try {
  await dropAllCollections();
} catch (error) {
  console.error(
    "[drop-all-collections] Failed:",
    error instanceof Error ? error.message : error,
  );
  await mongoose.disconnect().catch((closeError) => {
    console.error("[drop-all-collections] Failed to close MongoDB:", closeError);
  });
  process.exitCode = 1;
}
