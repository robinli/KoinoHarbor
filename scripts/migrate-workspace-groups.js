import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { loadConfig } from "../src/config.js";
import { getFirebaseApp } from "../src/firebase-auth.js";

const VALID_ROLES = new Set(["admin", "member", "guest"]);

export function validateWorkspaceGroupMapping(mapping, spaceIds) {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    throw new Error("設定檔必須是以工作區 ID 為鍵、群組陣列為值的 JSON 物件。");
  }
  const expected = new Set(spaceIds);
  const unknown = Object.keys(mapping).filter((spaceId) => !expected.has(spaceId));
  const missing = spaceIds.filter((spaceId) => !Object.hasOwn(mapping, spaceId));
  if (unknown.length) throw new Error(`設定檔包含未知工作區：${unknown.join("、")}`);
  if (missing.length) throw new Error(`以下工作區尚未指定群組：${missing.join("、")}`);
  for (const [spaceId, roles] of Object.entries(mapping)) {
    if (!Array.isArray(roles) || roles.length === 0) throw new Error(`工作區 ${spaceId} 至少必須指定一個群組。`);
    if (roles.some((role) => !VALID_ROLES.has(role))) throw new Error(`工作區 ${spaceId} 包含無效群組。`);
    if (new Set(roles).size !== roles.length) throw new Error(`工作區 ${spaceId} 的群組不可重複。`);
  }
  return Object.fromEntries(Object.entries(mapping).map(([spaceId, roles]) => [spaceId, [...roles]]));
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
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

export async function migrateWorkspaceGroups({ firestore, mapping, dryRun = false, log = console.log }) {
  const [spaceSnapshot, userSnapshot] = await Promise.all([
    firestore.collection("spaces").get(),
    firestore.collection("users").get(),
  ]);
  const spaces = spaceSnapshot.docs;
  const validated = validateWorkspaceGroupMapping(mapping, spaces.map((document) => document.id));
  const users = new Map(userSnapshot.docs.map((document) => [document.id, document.data()]));
  const operations = [];
  const removals = [];

  for (const space of spaces) {
    operations.push({ reference: space.ref, type: "update", data: { allowedRoles: validated[space.id] } });
    const memberships = await space.ref.collection("members").get();
    for (const membership of memberships.docs) {
      const data = membership.data();
      const user = users.get(data.userId ?? membership.id);
      if (!user || !validated[space.id].includes(user.role)) {
        removals.push({ spaceId: space.id, userId: data.userId ?? membership.id });
        operations.push({ reference: membership.ref, type: "delete" });
      } else if (Object.hasOwn(data, "role")) {
        operations.push({ reference: membership.ref, type: "update", data: { role: FieldValue.delete() } });
      }
    }
  }

  log(`已驗證 ${spaces.length} 個工作區；將移除 ${removals.length} 筆不合格加入紀錄。`);
  for (const removal of removals) log(`移除 ${removal.spaceId} / ${removal.userId}`);
  if (!dryRun) await commitOperations(firestore, operations);
  log(dryRun ? "Dry-run 完成，未修改資料。" : "工作區群組遷移完成。");
  return { removalCount: removals.length, spaceCount: spaces.length };
}

async function main() {
  const configPath = argumentValue("--config");
  if (!configPath) throw new Error("請使用 --config <path> 指定工作區群組 JSON 設定檔。");
  const mapping = JSON.parse(await readFile(configPath, "utf8"));
  const config = loadConfig({
    ...process.env,
    AUTH_PROVIDER: "firebase",
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || "migration-not-used",
  });
  const firestore = getFirestore(getFirebaseApp(config));
  await migrateWorkspaceGroups({ firestore, mapping, dryRun: process.argv.includes("--dry-run") });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
