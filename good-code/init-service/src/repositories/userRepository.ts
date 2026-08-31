import { Collection } from "mongodb";
import { getMongoDb } from "../db/mongo";

export interface UserDoc {
  // Our stable, provider-namespaced user id, e.g. "google:1234567890".
  userId: string;
  googleSub: string;
  email: string;
  name?: string;
  picture?: string;
  createdAt: Date;
  updatedAt: Date;
}

function collection(): Collection<UserDoc> {
  return getMongoDb().collection<UserDoc>("users");
}

export async function ensureUserIndexes(): Promise<void> {
  await collection().createIndex({ userId: 1 }, { unique: true, name: "uniq_userId" });
  await collection().createIndex({ googleSub: 1 }, { unique: true, name: "uniq_googleSub" });
}

export interface GoogleProfile {
  googleSub: string;
  email: string;
  name?: string;
  picture?: string;
}

// Upsert a user identified by their Google subject id. Returns the stored doc.
// The first sign-in creates the record; subsequent sign-ins refresh the mutable
// profile fields (email/name/picture) without touching createdAt.
export async function upsertGoogleUser(profile: GoogleProfile): Promise<UserDoc> {
  const userId = `google:${profile.googleSub}`;
  const now = new Date();
  await collection().updateOne(
    { userId },
    {
      $set: {
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
        updatedAt: now,
      },
      $setOnInsert: {
        userId,
        googleSub: profile.googleSub,
        createdAt: now,
      },
    },
    { upsert: true }
  );

  const doc = await collection().findOne({ userId });
  if (!doc) {
    // Should be unreachable right after an upsert, but keep the type honest.
    throw new Error("Failed to load user after upsert");
  }
  return doc;
}
