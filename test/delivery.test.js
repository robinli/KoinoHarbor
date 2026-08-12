import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Firebase configuration files reference the delivered rules and indexes", async () => {
  const firebaseConfig = JSON.parse(await readFile("firebase.json", "utf8"));
  const indexes = JSON.parse(await readFile("firestore.indexes.json", "utf8"));

  assert.equal(firebaseConfig.firestore.rules, "firestore.rules");
  assert.equal(firebaseConfig.firestore.indexes, "firestore.indexes.json");
  assert.equal(firebaseConfig.storage.rules, "storage.rules");
  assert.ok(indexes.indexes.length >= 2);
});

test("security rules deny unmatched access and enforce Space membership", async () => {
  const firestoreRules = await readFile("firestore.rules", "utf8");
  const storageRules = await readFile("storage.rules", "utf8");

  assert.match(firestoreRules, /function canAccessSpace/);
  assert.match(firestoreRules, /isSpaceMember\(spaceId\)/);
  assert.doesNotMatch(firestoreRules, /isInternalMember/);
  assert.match(firestoreRules, /return isAdmin\(\) \|\| isSpaceMember\(spaceId\)/);
  assert.match(storageRules, /request\.resource\.size <= 20 \* 1024 \* 1024/);
  assert.match(storageRules, /match \/\{allPaths=\*\*\}/);
  assert.match(storageRules, /allow read, write: if false/);
  assert.match(storageRules, /return isAdmin\(\) \|\| isSpaceMember\(spaceId\)/);
});

test("container definition runs as a non-root user on the Cloud Run port", async () => {
  const dockerfile = await readFile("Dockerfile", "utf8");

  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /EXPOSE 8080/);
  assert.match(dockerfile, /npm ci --omit=dev/);
});
