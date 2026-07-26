import { MongoClient, Db } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error("Missing required env var: MONGODB_URI");
  }
  return uri;
}

function getDbName(): string {
  return process.env.MONGODB_DB_NAME?.trim() || "repl";
}

export async function connectMongo(): Promise<Db> {
  if (db) return db;

  client = new MongoClient(getMongoUri());
  await client.connect();
  db = client.db(getDbName());
  return db;
}

export function getMongoDb(): Db {
  if (!db) {
    throw new Error("MongoDB not connected. Call connectMongo() first.");
  }
  return db;
}

// Readiness probe: true only if we can actually round-trip a command to Mongo.
export async function pingMongo(): Promise<boolean> {
  if (!db) return false;
  try {
    await db.command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

