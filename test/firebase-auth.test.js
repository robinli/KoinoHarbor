import assert from "node:assert/strict";
import test from "node:test";

import { createFirebaseAuth } from "../src/firebase-auth.js";

function fakeFirestore(userData) {
  return {
    collection() {
      return {
        doc(id) {
          return {
            async get() {
              return { data: () => userData[id], exists: Boolean(userData[id]), id };
            },
            async update(changes) {
              userData[id] = { ...userData[id], ...changes };
            },
            async set(changes) {
              userData[id] = changes;
            },
          };
        },
        orderBy() {
          return {
            async get() {
              return {
                docs: Object.entries(userData).map(([id, data]) => ({ data: () => data, id })),
              };
            },
          };
        },
      };
    },
  };
}

test("Firebase ID token exchange creates a verified session for an active user", async () => {
  const calls = [];
  const auth = {
    async createSessionCookie(token) {
      calls.push(["create", token]);
      return "firebase-session-cookie";
    },
    async verifyIdToken(token) {
      calls.push(["verify-id", token]);
      return { uid: "user-1" };
    },
    async verifySessionCookie(token) {
      calls.push(["verify-session", token]);
      return { uid: "user-1" };
    },
  };
  const firestore = fakeFirestore({
    "user-1": { active: true, displayName: "Firebase User", email: "user@example.test", role: "member" },
  });
  const service = createFirebaseAuth(
    { firebaseProjectId: "demo-project" },
    { app: {}, auth, firestore },
  );

  const exchange = await service.exchangeIdToken("firebase-id-token");
  assert.equal(exchange.token, "firebase-session-cookie");
  assert.equal(exchange.user.role, "member");
  assert.equal((await service.verifySession("firebase-session-cookie")).email, "user@example.test");
  assert.deepEqual(calls.map(([operation]) => operation), ["verify-id", "create", "verify-session"]);
});

test("Firebase ID token exchange rejects inactive users", async () => {
  const service = createFirebaseAuth(
    { firebaseProjectId: "demo-project" },
    {
      app: {},
      auth: {
        async verifyIdToken() { return { uid: "user-1" }; },
      },
      firestore: fakeFirestore({ "user-1": { active: false, role: "member" } }),
    },
  );

  assert.equal(await service.exchangeIdToken("firebase-id-token"), null);
});

test("Firebase user administration creates users and updates names and passwords", async () => {
  const authCalls = [];
  const userData = {};
  const service = createFirebaseAuth(
    { firebaseProjectId: "demo-project" },
    {
      app: {},
      auth: {
        async createUser(input) {
          authCalls.push(["create", input]);
          return { uid: "user-2" };
        },
        async updateUser(id, changes) {
          authCalls.push(["update", id, changes]);
        },
      },
      firestore: fakeFirestore(userData),
    },
  );

  const created = await service.createUser({
    displayName: "New User",
    email: "new@example.test",
    password: "InitialPassword!",
    role: "member",
  }, "admin-1");
  const updated = await service.updateUser("user-2", {
    displayName: "Renamed User",
    password: "ChangedPassword!",
  }, "admin-1");

  assert.equal(created.email, "new@example.test");
  assert.equal(updated.displayName, "Renamed User");
  assert.deepEqual(authCalls.map(([operation]) => operation), ["create", "update"]);
  assert.equal(authCalls[1][2].password, "ChangedPassword!");
});

