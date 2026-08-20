import assert from "node:assert/strict";
import test from "node:test";

import {
  migrateWorkspaceGroups,
  validateWorkspaceGroupMapping,
} from "../scripts/migrate-workspace-groups.js";

test("workspace group mapping requires a complete valid assignment", () => {
  assert.deepEqual(validateWorkspaceGroupMapping({ "space-1": ["admin", "member"] }, ["space-1"]), {
    "space-1": ["admin", "member"],
  });
  assert.throws(() => validateWorkspaceGroupMapping({}, ["space-1"]), /尚未指定群組/);
  assert.throws(() => validateWorkspaceGroupMapping({ "space-1": ["member"], unknown: ["guest"] }, ["space-1"]), /未知工作區/);
  assert.throws(() => validateWorkspaceGroupMapping({ "space-1": [] }, ["space-1"]), /至少必須指定/);
  assert.throws(() => validateWorkspaceGroupMapping({ "space-1": ["member", "member"] }, ["space-1"]), /不可重複/);
  assert.throws(() => validateWorkspaceGroupMapping({ "space-1": ["manager"] }, ["space-1"]), /無效群組/);
});

test("workspace group migration dry-run reports cleanup without writing", async () => {
  let batchCreated = false;
  const memberDocuments = [
    { data: () => ({ role: "member", userId: "member-1" }), id: "member-1", ref: { id: "member-1" } },
    { data: () => ({ role: "guest", userId: "guest-1" }), id: "guest-1", ref: { id: "guest-1" } },
  ];
  const spaceReference = {
    collection: () => ({ get: async () => ({ docs: memberDocuments }) }),
    id: "space-1",
  };
  const firestore = {
    batch() {
      batchCreated = true;
      throw new Error("dry-run 不應建立 batch");
    },
    collection(name) {
      if (name === "spaces") return { get: async () => ({ docs: [{ id: "space-1", ref: spaceReference }] }) };
      return {
        get: async () => ({
          docs: [
            { data: () => ({ role: "member" }), id: "member-1" },
            { data: () => ({ role: "guest" }), id: "guest-1" },
          ],
        }),
      };
    },
  };
  const messages = [];
  const result = await migrateWorkspaceGroups({
    dryRun: true,
    firestore,
    log: (message) => messages.push(message),
    mapping: { "space-1": ["member"] },
  });
  assert.deepEqual(result, { removalCount: 1, spaceCount: 1 });
  assert.equal(batchCreated, false);
  assert.match(messages.at(-1), /未修改資料/);
});
