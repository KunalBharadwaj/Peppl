import { Collection } from "mongodb";
import { getMongoDb } from "../db/mongo";

export type ReplStatus = "creating" | "ready" | "failed";

export interface ReplDoc {
  replId: string;
  // Owning user's stable id (see userRepository.UserDoc.userId).
  ownerId: string;
  language: string;
  status: ReplStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Statuses that occupy one of a user's workspace slots for cap enforcement.
// "failed" repls are not counted — they represent no live/pending workspace.
const ACTIVE_STATUSES: ReplStatus[] = ["creating", "ready"];

// A repl that has been "creating" longer than this is considered stuck (the
// process that started it likely crashed mid-init) and is eligible for either
// a reconciliation sweep or a fresh retry.
export const STALE_CREATING_MS = 5 * 60 * 1000;

function collection(): Collection<ReplDoc> {
  return getMongoDb().collection<ReplDoc>("repls");
}

export async function ensureReplIndexes(): Promise<void> {
  await collection().createIndex({ replId: 1 }, { unique: true, name: "uniq_replId" });
  // Supports the per-user active-repl count used for cap enforcement.
  await collection().createIndex({ ownerId: 1, status: 1 }, { name: "owner_status" });
}

export async function createRepl(
  replId: string,
  ownerId: string,
  language: string
): Promise<void> {
  const now = new Date();
  await collection().insertOne({
    replId,
    ownerId,
    language,
    status: "creating",
    createdAt: now,
    updatedAt: now,
  });
}

// Number of workspaces this user currently occupies (creating or ready).
// Used to enforce the per-user cap before creating a new repl.
export async function countActiveByOwner(ownerId: string): Promise<number> {
  return collection().countDocuments({
    ownerId,
    status: { $in: ACTIVE_STATUSES },
  });
}

export async function setReplStatus(replId: string, status: ReplStatus): Promise<void> {
  await collection().updateOne(
    { replId },
    {
      $set: {
        status,
        updatedAt: new Date(),
      },
    }
  );
}

// Atomically claim an existing repl for a fresh (re)initialization attempt.
// Only succeeds if the doc is "failed" or a stale "creating" AND is owned by the
// requesting user — a "ready" repl, one actively being created (fresh
// "creating"), or one owned by someone else is left untouched. Returns true iff
// this caller now owns the retry. The compare-and-set on status prevents two
// concurrent retries from both proceeding, and the ownerId match prevents one
// user from hijacking another user's replId slug.
export async function claimForRetry(
  replId: string,
  ownerId: string,
  language: string
): Promise<boolean> {
  const staleThreshold = new Date(Date.now() - STALE_CREATING_MS);
  const result = await collection().updateOne(
    {
      replId,
      ownerId,
      $or: [
        { status: "failed" },
        { status: "creating", updatedAt: { $lt: staleThreshold } },
      ],
    },
    {
      $set: {
        status: "creating",
        language,
        updatedAt: new Date(),
      },
    }
  );
  return result.modifiedCount === 1;
}

// Reconciliation: flip any repl stuck in "creating" past the stale threshold to
// "failed" so status readers see a terminal state (and it becomes retry-eligible).
// Returns the number of docs reconciled.
export async function failStaleCreating(): Promise<number> {
  const staleThreshold = new Date(Date.now() - STALE_CREATING_MS);
  const result = await collection().updateMany(
    { status: "creating", updatedAt: { $lt: staleThreshold } },
    {
      $set: {
        status: "failed",
        updatedAt: new Date(),
      },
    }
  );
  return result.modifiedCount;
}

