import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

test("message reaction rules allow authorized reads and deny client writes", { skip: !emulatorAvailable }, async () => {
  const testEnvironment = await initializeTestEnvironment({
    firestore: { rules: await readFile("firestore.rules", "utf8") },
    projectId: "koino-harbor-rules-test",
    storage: { rules: await readFile("storage.rules", "utf8") },
  });

  try {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const firestore = context.firestore();
      await firestore.doc("users/member-1").set({ active: true, role: "member" });
      await firestore.doc("users/guest-1").set({ active: true, role: "guest" });
      await firestore.doc("users/admin-1").set({ active: true, role: "admin" });
      await firestore.doc("spaces/space-1").set({ accessMode: "restricted", allowedRoles: ["admin", "member"], deletedAt: null, deletedBy: null, parentId: null });
      await firestore.doc("spaces/space-1/members/member-1").set({ userId: "member-1" });
      await firestore.doc("spaces/space-1/messageReactions/reaction-1").set({
        emoji: "✅",
        messageId: "thread-1",
        messageType: "thread",
        spaceId: "space-1",
        threadId: "thread-1",
        userDisplayName: "Member",
        userId: "member-1",
      });
      await firestore.doc("spaces/child-1").set({ accessMode: "inherited", allowedRoles: [], deletedAt: null, deletedBy: null, parentId: "space-1" });
      await firestore.doc("spaces/child-1/messageReactions/reaction-1").set({
        emoji: "✅",
        messageId: "thread-2",
        messageType: "thread",
        spaceId: "child-1",
        threadId: "thread-2",
        userDisplayName: "Member",
        userId: "member-1",
      });
      await firestore.doc("spaces/deleted-1").set({
        accessMode: "restricted",
        allowedRoles: ["member"],
        deletedAt: new Date("2026-01-01T00:00:00.000Z"),
        deletedBy: "admin-1",
        parentId: null,
      });
      await firestore.doc("spaces/deleted-1/members/member-1").set({ userId: "member-1" });
      await firestore.doc("spaces/deleted-1/messageReactions/reaction-1").set({ spaceId: "deleted-1" });
    });

    const member = testEnvironment.authenticatedContext("member-1").firestore();
    const guest = testEnvironment.authenticatedContext("guest-1").firestore();
    const admin = testEnvironment.authenticatedContext("admin-1").firestore();
    const reactionPath = "spaces/space-1/messageReactions/reaction-1";
    assert.equal((await assertSucceeds(member.doc(reactionPath).get())).exists, true);
    assert.equal((await assertSucceeds(member.doc("spaces/child-1/messageReactions/reaction-1").get())).exists, true);
    await assertFails(member.doc("spaces/deleted-1/messageReactions/reaction-1").get());
    await assertFails(guest.doc(reactionPath).get());
    await assertFails(admin.doc(reactionPath).get());
    await assertFails(member.doc("spaces/space-1/messageReactions/reaction-2").set({
      emoji: "👍",
      messageId: "thread-1",
      messageType: "thread",
      threadId: "thread-1",
      userId: "member-1",
    }));
    await assertFails(member.doc(reactionPath).delete());

    const storageBucket = "gs://koino-harbor-rules-test.appspot.com";
    const memberStorage = testEnvironment.authenticatedContext("member-1").storage(storageBucket);
    const guestStorage = testEnvironment.authenticatedContext("guest-1").storage(storageBucket);
    const adminStorage = testEnvironment.authenticatedContext("admin-1").storage(storageBucket);
    const attachmentPath = "spaces/space-1/threads/thread-1/attachment.pdf";
    await assertSucceeds(memberStorage.ref(attachmentPath).put(new Uint8Array([1]), { contentType: "application/pdf" }));
    await assertFails(guestStorage.ref(attachmentPath.replace("attachment", "guest")).put(new Uint8Array([1]), { contentType: "application/pdf" }));
    await assertFails(adminStorage.ref(attachmentPath.replace("attachment", "admin")).put(new Uint8Array([1]), { contentType: "application/pdf" }));
    await assertSucceeds(memberStorage.ref("spaces/child-1/threads/thread-2/inherited.pdf").put(new Uint8Array([1]), { contentType: "application/pdf" }));
    await assertFails(memberStorage.ref("spaces/deleted-1/threads/thread-3/deleted.pdf").put(new Uint8Array([1]), { contentType: "application/pdf" }));
  } finally {
    await testEnvironment.cleanup();
  }
});
