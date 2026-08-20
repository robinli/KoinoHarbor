import { pathToFileURL } from "node:url";

import { getFirestore } from "firebase-admin/firestore";

import { loadConfig } from "../src/config.js";
import { getFirebaseApp } from "../src/firebase-auth.js";

const VALID_ROLES = new Set(["admin", "member", "guest"]);

function validRestrictedRoles(roles) {
  return Array.isArray(roles)
    && roles.length > 0
    && roles.length <= 3
    && new Set(roles).size === roles.length
    && roles.every((role) => VALID_ROLES.has(role));
}

async function commitOperations(firestore, operations) {
  for (let offset = 0; offset < operations.length; offset += 500) {
    const batch = firestore.batch();
    for (const operation of operations.slice(offset, offset + 500)) {
      if (operation.type === "delete") batch.delete(operation.reference);
      else batch.update(operation.reference, operation.data);
    }
    await batch.commit();
  }
}

export async function migrateWorkspaceAccess({ firestore, dryRun = false, log = console.log }) {
  const snapshot = await firestore.collection("spaces").get();
  const operations = [];
  const membershipRemovals = [];
  let normalizedSpaceCount = 0;

  for (const document of snapshot.docs) {
    const space = document.data();
    const topLevel = space.parentId === null || space.parentId === undefined;
    const mode = topLevel ? "restricted" : space.accessMode;
    if (!topLevel && !["inherited", "restricted"].includes(mode)) {
      throw new Error(`子工作區 ${document.id} 的存取模式無效。`);
    }
    if (mode === "restricted" && !validRestrictedRoles(space.allowedRoles)) {
      throw new Error(`restricted 工作區 ${document.id} 必須有至少一個有效允許群組。`);
    }
    if ((space.deletedAt == null) !== (space.deletedBy == null)) {
      throw new Error(`工作區 ${document.id} 的 deletedAt 與 deletedBy 必須同時有值或同時為 null。`);
    }

    const update = {};
    if (space.accessMode !== mode) update.accessMode = mode;
    if (mode === "inherited" && (space.allowedRoles?.length ?? 0) !== 0) update.allowedRoles = [];
    if (!Object.hasOwn(space, "deletedAt")) update.deletedAt = null;
    if (!Object.hasOwn(space, "deletedBy")) update.deletedBy = null;
    if (Object.keys(update).length) {
      operations.push({ data: update, reference: document.ref, type: "update" });
      normalizedSpaceCount += 1;
    }

    if (mode === "inherited") {
      const members = await document.ref.collection("members").get();
      for (const member of members.docs) {
        membershipRemovals.push({ spaceId: document.id, userId: member.id });
        operations.push({ reference: member.ref, type: "delete" });
      }
    }
  }

  log(`已檢查 ${snapshot.docs.length} 個工作區；${normalizedSpaceCount} 個需標準化，${membershipRemovals.length} 筆繼承子工作區的直接加入紀錄將被移除。`);
  for (const removal of membershipRemovals) log(`移除 ${removal.spaceId} / ${removal.userId}`);
  if (!dryRun) await commitOperations(firestore, operations);
  log(dryRun ? "Dry-run 完成，未修改資料。" : "工作區存取模式遷移完成。");
  return { membershipRemovalCount: membershipRemovals.length, normalizedSpaceCount, spaceCount: snapshot.docs.length };
}

async function main() {
  const config = loadConfig({
    ...process.env,
    AUTH_PROVIDER: "firebase",
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || "migration-not-used",
  });
  await migrateWorkspaceAccess({
    dryRun: process.argv.includes("--dry-run"),
    firestore: getFirestore(getFirebaseApp(config)),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
