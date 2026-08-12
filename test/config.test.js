import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { loadConfig } from "../src/config.js";

test("loadConfig applies development defaults", () => {
  const config = loadConfig({});

  assert.deepEqual(config, {
    appName: "Koino Harbor",
    authProvider: "development",
    developmentUsers: [
      { email: "admin@koino.local", password: "PocAdmin123!", role: "admin" },
      { email: "member@koino.local", password: "PocMember123!", role: "member" },
      { email: "guest@koino.local", password: "PocGuest123!", role: "guest" },
    ],
    environment: "development",
    firebaseProjectId: null,
    firebaseApiKey: null,
    firebaseAppId: null,
    firebaseAuthDomain: null,
    firebaseMessagingSenderId: null,
    firebaseStorageBucket: null,
    host: "0.0.0.0",
    port: 8080,
    sessionSecret: "local-poc-secret-change-before-production",
    seedDevelopmentData: true,
  });
});

test("loadConfig rejects an invalid port", () => {
  assert.throws(() => loadConfig({ PORT: "70000" }), /PORT/);
});

test("loadConfig rejects development authentication in production", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "production" }), /development authentication provider/);
});

test("loadConfig requires Firebase project and API key", () => {
  assert.throws(() => loadConfig({ AUTH_PROVIDER: "firebase" }), /FIREBASE_PROJECT_ID/);
  const config = loadConfig({
    AUTH_PROVIDER: "firebase",
    FIREBASE_API_KEY: "api-key",
    FIREBASE_PROJECT_ID: "demo-project",
  });
  assert.equal(config.authProvider, "firebase");
});

test("Firestore indexes retain optional membership collection-group support", async () => {
  const indexes = JSON.parse(await readFile(new URL("../firestore.indexes.json", import.meta.url), "utf8"));
  const membershipIndex = indexes.fieldOverrides.find((item) => item.collectionGroup === "members" && item.fieldPath === "userId");

  assert.ok(membershipIndex);
  assert.ok(membershipIndex.indexes.some((index) => index.queryScope === "COLLECTION_GROUP" && index.order === "ASCENDING"));
});

