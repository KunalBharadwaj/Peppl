import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoServerError } from "mongodb";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import type { TestContext } from "vitest";
import { connectMongo, getMongoDb } from "../src/db/mongo";
import {
  claimForRetry,
  countActiveByOwner,
  createRepl,
  ensureReplIndexes,
  failStaleCreating,
  setReplStatus,
  STALE_CREATING_MS,
} from "../src/repositories/replRepository";

// Integration test for the repl repository against a real (ephemeral) MongoDB.
// mongodb-memory-server downloads/starts a throwaway mongod, so we exercise the
// actual indexes, unique-constraint behavior, and ownership-scoped updates —
// the parts that pure unit tests can't cover.
//
// If mongod can't start here (no network to fetch the binary, or too little free
// disk for MongoDB's startup preflight), we SKIP rather than fail — CI runners
// have both, so the suite runs for real there.

let mongod: MongoMemoryServer | undefined;
let mongoReady = false;

const OWNER_A = "google:aaa";
const OWNER_B = "google:bbb";

// Skip the current test unless a live Mongo is available.
function needMongo(ctx: TestContext): void {
  if (!mongoReady) ctx.skip();
}

// Force updatedAt into the past so the stale-creating branches become eligible.
async function ageRepl(replId: string, msAgo: number): Promise<void> {
  await getMongoDb()
    .collection("repls")
    .updateOne({ replId }, { $set: { updatedAt: new Date(Date.now() - msAgo) } });
}

beforeAll(async () => {
  try {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
    process.env.MONGODB_DB_NAME = "repl_test";
    await connectMongo();
    await ensureReplIndexes();
    mongoReady = true;
  } catch (err) {
    console.warn(
      "Skipping repl-repository integration tests (mongod unavailable):",
      (err as Error).message
    );
    mongoReady = false;
  }
}, 120_000);

afterAll(async () => {
  await mongod?.stop();
});

beforeEach(async () => {
  if (!mongoReady) return;
  await getMongoDb().collection("repls").deleteMany({});
});

describe("countActiveByOwner", () => {
  it("counts creating + ready but not failed, scoped per owner", async (ctx) => {
    needMongo(ctx);
    await createRepl("a-one", OWNER_A, "node-js");
    await createRepl("a-two", OWNER_A, "node-js");
    await createRepl("b-one", OWNER_B, "python");

    expect(await countActiveByOwner(OWNER_A)).toBe(2);
    expect(await countActiveByOwner(OWNER_B)).toBe(1);

    await setReplStatus("a-one", "ready"); // ready still occupies a slot
    expect(await countActiveByOwner(OWNER_A)).toBe(2);

    await setReplStatus("a-two", "failed"); // failed frees the slot
    expect(await countActiveByOwner(OWNER_A)).toBe(1);
  });
});

describe("createRepl unique index", () => {
  it("rejects a duplicate replId with a 11000 error", async (ctx) => {
    needMongo(ctx);
    await createRepl("dup", OWNER_A, "node-js");
    let err: unknown;
    try {
      await createRepl("dup", OWNER_B, "python");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MongoServerError);
    expect((err as MongoServerError).code).toBe(11000);
  });
});

describe("claimForRetry", () => {
  it("lets the owner reclaim a failed repl but not another user's", async (ctx) => {
    needMongo(ctx);
    await createRepl("retry-me", OWNER_A, "node-js");
    await setReplStatus("retry-me", "failed");

    // Wrong owner cannot hijack the slug.
    expect(await claimForRetry("retry-me", OWNER_B, "python")).toBe(false);

    // Owner reclaims: status flips back to creating with the new language.
    expect(await claimForRetry("retry-me", OWNER_A, "python")).toBe(true);
    const doc = await getMongoDb().collection("repls").findOne({ replId: "retry-me" });
    expect(doc?.status).toBe("creating");
    expect(doc?.language).toBe("python");
  });

  it("does not reclaim a freshly-creating repl (compare-and-set guard)", async (ctx) => {
    needMongo(ctx);
    await createRepl("busy", OWNER_A, "node-js"); // just created => fresh "creating"
    expect(await claimForRetry("busy", OWNER_A, "node-js")).toBe(false);
  });

  it("reclaims a stale-creating repl once past the threshold", async (ctx) => {
    needMongo(ctx);
    await createRepl("stuck", OWNER_A, "node-js");
    await ageRepl("stuck", STALE_CREATING_MS + 60_000);
    expect(await claimForRetry("stuck", OWNER_A, "node-js")).toBe(true);
  });
});

describe("failStaleCreating", () => {
  it("flips stale creating repls to failed and leaves fresh ones alone", async (ctx) => {
    needMongo(ctx);
    await createRepl("old", OWNER_A, "node-js");
    await ageRepl("old", STALE_CREATING_MS + 60_000);
    await createRepl("new", OWNER_A, "node-js"); // fresh

    const reconciled = await failStaleCreating();
    expect(reconciled).toBe(1);

    const oldDoc = await getMongoDb().collection("repls").findOne({ replId: "old" });
    const newDoc = await getMongoDb().collection("repls").findOne({ replId: "new" });
    expect(oldDoc?.status).toBe("failed");
    expect(newDoc?.status).toBe("creating");
  });
});
