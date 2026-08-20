import assert from "node:assert/strict";
import test from "node:test";

import { migrateWorkspaceAccess } from "../scripts/migrate-workspace-access.js";

function createFakeFirestore(seed) {
  const records = new Map();
  for (const item of seed) {
    const record = { data: structuredClone(item.data), members: new Map(item.members ?? []) };
    const reference = {
      collection(name) {
        assert.equal(name, "members");
        return {
          async get() {
            return {
              docs: [...record.members].map(([id, data]) => ({
                data: () => structuredClone(data),
                id,
                ref: { id, record, type: "member" },
              })),
            };
          },
        };
      },
      id: item.id,
      record,
      type: "space",
    };
    records.set(item.id, { id: item.id, record, reference });
  }
  return {
    batch() {
      const operations = [];
      return {
        async commit() {
          for (const operation of operations) {
            if (operation.type === "update") Object.assign(operation.reference.record.data, operation.data);
            else operation.reference.record.members.delete(operation.reference.id);
          }
        },
        delete(reference) {
          operations.push({ reference, type: "delete" });
        },
        update(reference, data) {
          operations.push({ data, reference, type: "update" });
        },
      };
    },
    collection(name) {
      assert.equal(name, "spaces");
      return {
        async get() {
          return {
            docs: [...records.values()].map(({ id, record, reference }) => ({
              data: () => structuredClone(record.data),
              id,
              ref: reference,
            })),
          };
        },
      };
    },
    records,
  };
}

test("workspace access migration normalizes roots and pure inherited children idempotently", async () => {
  const firestore = createFakeFirestore([
    {
      data: { accessMode: "inherited", allowedRoles: ["member"], parentId: null },
      id: "root",
      members: [["member-1", { userId: "member-1" }]],
    },
    {
      data: { accessMode: "inherited", allowedRoles: ["member", "guest"], parentId: "root" },
      id: "child",
      members: [["guest-1", { userId: "guest-1" }]],
    },
  ]);

  const first = await migrateWorkspaceAccess({ firestore, log: () => {} });
  assert.deepEqual(first, { membershipRemovalCount: 1, normalizedSpaceCount: 2, spaceCount: 2 });
  assert.deepEqual(firestore.records.get("root").record.data, {
    accessMode: "restricted",
    allowedRoles: ["member"],
    deletedAt: null,
    deletedBy: null,
    parentId: null,
  });
  assert.deepEqual(firestore.records.get("child").record.data, {
    accessMode: "inherited",
    allowedRoles: [],
    deletedAt: null,
    deletedBy: null,
    parentId: "root",
  });
  assert.equal(firestore.records.get("child").record.members.size, 0);

  const second = await migrateWorkspaceAccess({ firestore, log: () => {} });
  assert.deepEqual(second, { membershipRemovalCount: 0, normalizedSpaceCount: 0, spaceCount: 2 });
});

test("workspace access migration dry-run validates without writing", async () => {
  const firestore = createFakeFirestore([{
    data: { accessMode: "restricted", allowedRoles: ["member"], parentId: null },
    id: "root",
  }]);
  const result = await migrateWorkspaceAccess({ dryRun: true, firestore, log: () => {} });
  assert.deepEqual(result, { membershipRemovalCount: 0, normalizedSpaceCount: 1, spaceCount: 1 });
  assert.equal(Object.hasOwn(firestore.records.get("root").record.data, "deletedAt"), false);
});

test("workspace access migration rejects invalid restricted groups", async () => {
  const firestore = createFakeFirestore([{
    data: { accessMode: "restricted", allowedRoles: [], parentId: null },
    id: "root",
  }]);
  await assert.rejects(() => migrateWorkspaceAccess({ firestore, log: () => {} }), /restricted 工作區 root/);
});
