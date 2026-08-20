import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { loadConfig } from "../src/config.js";
import { getFirebaseApp } from "../src/firebase-auth.js";

const dryRun = process.argv.includes("--dry-run");
const config = loadConfig({
  ...process.env,
  AUTH_PROVIDER: "firebase",
  FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || "migration-not-used",
});

const firestore = getFirestore(getFirebaseApp(config));
const spaces = await firestore.collection("spaces").get();
const pending = spaces.docs.filter((document) => {
  const data = document.data();
  return data.parentId !== null || data.accessMode !== "restricted" || !Number.isInteger(data.sortOrder) || Object.hasOwn(data, "type");
});

console.log(`找到 ${spaces.size} 個工作區，其中 ${pending.length} 個需要遷移。`);
if (dryRun || !pending.length) process.exit(0);

for (let index = 0; index < pending.length; index += 500) {
  const batch = firestore.batch();
  for (const document of pending.slice(index, index + 500)) {
    batch.update(document.ref, {
      accessMode: "restricted",
      parentId: null,
      sortOrder: 0,
      type: FieldValue.delete(),
    });
  }
  await batch.commit();
}

console.log("工作區階層遷移完成。");
