import { MongoBackend } from "@agendajs/mongo-backend";
import { Agenda } from "agenda";
import mongoose from "mongoose";
import { waitForConnection } from "./db.js";

let agenda = null;

/**
 * Initializes Agenda by linking it to the existing Mongoose connection.
 * This prevents creating unnecessary duplicate connections to MongoDB.
 */
const initAgenda = () => {
  if (agenda) return agenda;

  const connection = mongoose.connection;

  // Ensure Mongoose is connected before initializing Agenda
  if (connection.readyState !== 1) {
    throw new Error("Mongoose must be connected before initializing Agenda.");
  }

  const backend = new MongoBackend({
    mongo: connection.db, // Use the existing Mongoose connection
    collection: "agendaJobs", // Custom collection name for Agenda jobs
  });

  agenda = new Agenda({
    // Pass the existing MongoDB driver instance directly from Mongoose
    backend: backend,
    processEvery: "1 minute", // Poll for due jobs once a minute (free-tier friendly)
    maxConcurrency: 10, // Max total jobs running at once per server instance
    defaultConcurrency: 3, // Default max concurrent jobs of a single type
    logging: false, // Disable internal logging; handle errors in your own code
  });

  // Handle Agenda internal errors safely
  agenda.on("error", (err) => {
    console.error("❌ Agenda Queue Error:", err);
  });

  return agenda;
};

/**
 * Gracefully shuts down Agenda when the Node process terminates.
 * Prevents jobs from getting stuck in a "locked/running" state indefinitely.
 */
const gracefulShutdown = async () => {
  if (agenda) {
    console.log("\nStopping Agenda gracefully...");
    await agenda.stop();
    console.log("🏁 Agenda stopped successfully.");
    process.exit(0);
  }
};

const useAgenda = () => {
  if (!agenda) return initAgenda();
  return agenda;
};

async function startAssiginTasks(callback) {
  if (!agenda) return;

  if (typeof callback === "function") {
    await callback(agenda);
  }

  if (!agenda._processInterval) {
    await agenda.start();
  }
}

const getAgenda = () => {
  return new Promise((resolve, reject) => {
    waitForConnection().then(() => {
      resolve({ agenda: useAgenda(), startAssiginTasks });
    });
  });
};

/**
 * Executes an Agenda task immediately by bypassing the database queue.
 * @param {Object} agenda - Your instantiated Agenda instance.
 * @param {string} taskName - The name of the registered task to run.
 * @param {Object} [data={}] - Optional data to pass to the task payload.
 * @returns {Promise<any>} The result of the task execution.
 */
async function executeTaskNow(agenda, taskName, data = {}) {
  // 1. Access Agenda's internal definition map
  const definition = agenda.definitions && agenda.definitions[taskName];

  if (!definition || typeof definition.fn !== "function") {
    throw new Error(
      `[AgendaUtil] Task "${taskName}" is not defined or missing a processor function.`,
    );
  }

  // 2. Mock a minimal job structure that matches Agenda's expected API
  const mockJob = {
    attrs: {
      name: taskName,
      data: data,
      failedAt: null,
      failReason: null,
    },
    // Mock standard utility methods to prevent runtime crashes if called inside the task
    touch: async () => {},
    fail: function (reason) {
      this.attrs.failedAt = new Date();
      this.attrs.failReason = reason instanceof Error ? reason.message : reason;
    },
  };

  const mockDone = (err) => {
    if (err) throw err;
  };

  // 3. Execute the processor function directly and return its output
  try {
    return await definition.fn(mockJob, mockDone);
  } catch (error) {
    console.error(
      `[AgendaUtil] Error executing task "${taskName}" directly:`,
      error,
    );
    throw error;
  }
}

// Capture system termination signals for clean shutdown
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

export {
  executeTaskNow,
  initAgenda,
  // Getter function to fetch the agenda instance anywhere in your app after initialization
  getAgenda,
  gracefulShutdown,
  useAgenda,
  startAssiginTasks,
};
