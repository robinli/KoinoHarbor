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

test("security rules deny unmatched access and enforce hierarchical Space membership", async () => {
  const firestoreRules = await readFile("firestore.rules", "utf8");
  const storageRules = await readFile("storage.rules", "utf8");

  assert.match(firestoreRules, /function canAccessSpace/);
  assert.match(firestoreRules, /function isDirectSpaceMember/);
  assert.match(firestoreRules, /allowedRoles\.hasAny/);
  assert.match(firestoreRules, /allowedRoles\.toSet\(\)\.size\(\)/);
  assert.match(firestoreRules, /request\.resource\.data\.userId == userId/);
  assert.doesNotMatch(firestoreRules, /function canAccessSpace[^}]*isAdmin/);
  assert.doesNotMatch(firestoreRules, /isInternalMember/);
  assert.match(firestoreRules, /function inheritsParentAccess/);
  assert.match(firestoreRules, /function spaceNotDeleted/);
  assert.match(firestoreRules, /space\.data\.accessMode == 'restricted'/);
  assert.match(firestoreRules, /space\.data\.accessMode == 'inherited'/);
  assert.match(firestoreRules, /function validSpaceParent/);
  assert.match(firestoreRules, /match \/messageReactions\/\{reactionId\}/);
  assert.match(firestoreRules, /allow read: if canAccessSpace\(spaceId\)/);
  assert.match(firestoreRules, /allow create, update, delete: if false/);
  assert.match(storageRules, /request\.resource\.size <= 20 \* 1024 \* 1024/);
  assert.match(storageRules, /match \/\{allPaths=\*\*\}/);
  assert.match(storageRules, /allow read, write: if false/);
  assert.match(storageRules, /space\.data\.accessMode == 'inherited'/);
  assert.match(storageRules, /space\.data\.deletedAt == null/);
  assert.match(storageRules, /allowedRoles\.hasAny/);
});

test("container definition runs as a non-root user on the Cloud Run port", async () => {
  const dockerfile = await readFile("Dockerfile", "utf8");

  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /EXPOSE 8080/);
  assert.match(dockerfile, /npm ci --omit=dev/);
});
