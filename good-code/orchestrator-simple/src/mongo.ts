import { MongoClient, Db } from "mongodb";

// Orchestrator keeps a read-only view of the `repls` collection that
// init-service owns. It never writes here — it only needs to answer "who owns
// this replId?" so it can authorize /start and /stop against the record of who
// actually created the workspace (init-service is still the sole writer).

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

// Returns the owning user's id for a repl, or null if no such repl exists.
// Used to verify a caller may start/stop the workspace they're naming.
export async function getReplOwner(replId: string): Promise<string | null> {
  if (!db) {
    throw new Error("MongoDB not connected. Call connectMongo() first.");
  }
  const doc = await db
    .collection<{ replId: string; ownerId: string }>("repls")
    .findOne({ replId }, { projection: { ownerId: 1 } });
  return doc?.ownerId ?? null;
}
