import "dotenv/config";
import mongoose from "mongoose";

import { dbEventNames, dbEvents } from "./events.manage.js";
import { initAgenda } from "./agenda.js";
import storeConfig from "../shared/store.config.js";

const DATABASE_NAME = storeConfig.brand.name.en;

const MAX_TRIES = 5;
const RETRY_DELAY = 5000;

let tries = 0;
let connectionPromise = null;
let mongoClient = null;
let agendaInstance = null;
let agendaStartPromise = null;

async function openConnection() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  // Mongoose manages the MongoDB connection.
  await mongoose.connect(uri);

  // Reuse Mongoose's underlying native MongoDB client.
  mongoClient = mongoose.connection.getClient();

  const database = mongoose.connection.db;

  if (!database) {
    throw new Error("MongoDB database instance is unavailable.");
  }

  console.log(`Connected to MongoDB database: ${DATABASE_NAME}`);

  return database;
}

async function closeFailedConnection() {
  try {
    await mongoose.disconnect();
  } catch (error) {
    console.error("Error closing MongoDB connection:", error);
  }

  mongoClient = null;
}

async function connectToDatabase() {
  if (mongoose.connection.readyState === 1 && mongoClient) {
    const database = mongoose.connection.db;
    const agenda = await startAgenda();

    return [database, mongoose.connection, agenda];
  }

  // Prevent multiple simultaneous connection attempts.
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    while (tries < MAX_TRIES) {
      dbEvents.fire(dbEventNames.CONNECTING, tries);

      try {
        const database = await openConnection();

        dbEvents.fire(dbEventNames.CONNECTED);

        const agenda = await startAgenda();

        tries = 0;

        return [database, mongoose.connection, agenda];
      } catch (error) {
        dbEvents.fire(dbEventNames.ERROR, error);

        console.error("MongoDB connection error:", error);

        await closeFailedConnection();

        tries++;

        if (tries >= MAX_TRIES) {
          const maxRetriesError = new Error(
            "Maximum MongoDB connection retries reached.",
            { cause: error },
          );

          dbEvents.fire(dbEventNames.ERROR, maxRetriesError);

          throw maxRetriesError;
        }

        console.log(
          `Retrying in ${RETRY_DELAY / 1000} seconds... ` +
            `(Attempt ${tries}/${MAX_TRIES})`,
        );

        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      }
    }
  })();

  try {
    return await connectionPromise;
  } catch (error) {
    console.error("Unable to establish database connection:", error);
    throw error;
  } finally {
    connectionPromise = null;
  }
}

async function startAgenda() {
  if (!agendaInstance) {
    agendaInstance = initAgenda();
  }

  if (agendaInstance._processInterval) {
    return agendaInstance;
  }

  // Prevent multiple simultaneous Agenda startup calls.
  if (!agendaStartPromise) {
    agendaStartPromise = agendaInstance
      .start()
      .then(() => {
        console.log("Agenda started successfully.");
        return agendaInstance;
      })
      .catch((error) => {
        agendaStartPromise = null;
        console.error("Agenda start error:", error);
        throw error;
      });
  }

  return agendaStartPromise;
}

async function dropDatabase() {
  try {
    if (mongoose.connection.readyState !== 1) {
      throw new Error("Database is not connected.");
    }

    await mongoose.connection.db.dropDatabase();

    console.log(`Database "${DATABASE_NAME}" deleted.`);
  } catch (error) {
    console.error("Failed to drop database:", error);
    throw error;
  }
}

async function dropCollectionByName(name) {
  try {
    if (mongoose.connection.readyState !== 1) {
      throw new Error("Database is not connected.");
    }

    await mongoose.connection.db.dropCollection(name);

    console.log(`Collection "${name}" dropped.`);
  } catch (error) {
    console.error(`Failed to drop collection "${name}":`, error);
    throw error;
  }
}

async function startDB(req, res, next) {
  try {
    if (mongoose.connection.readyState !== 1) {
      await connectToDatabase();
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

function checkDatabaseConnection(req, res, next) {
  if (mongoose.connection.readyState === 1) {
    return next();
  }

  return res.status(503).json({
    message: "Database connection is not ready.",
  });
}

function checkCurrentConnection() {
  return mongoose.connection.readyState === 1;
}

async function waitForConnection(timeoutMs = 120000) {
  const startedAt = Date.now();

  while (!checkCurrentConnection()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error("Timed out waiting for MongoDB connection.");
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

// Mongoose connection.
const db = mongoose.connection;

export {
  db,
  mongoClient,
  connectToDatabase,
  dropDatabase,
  dropCollectionByName,
  checkDatabaseConnection,
  startDB,
  waitForConnection,
  checkCurrentConnection,
};
