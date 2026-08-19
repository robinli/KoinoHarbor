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
  });

  try {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const firestore = context.firestore();
      await firestore.doc("users/member-1").set({ active: true, role: "member" });
      await firestore.doc("users/guest-1").set({ active: true, role: "guest" });
      await firestore.doc("spaces/space-1").set({ accessMode: "restricted", parentId: null });
      await firestore.doc("spaces/space-1/members/member-1").set({ role: "member", userId: "member-1" });
      await firestore.doc("spaces/space-1/messageReactions/reaction-1").set({
        emoji: "✅",
        messageId: "thread-1",
        messageType: "thread",
        spaceId: "space-1",
        threadId: "thread-1",
        userDisplayName: "Member",
        userId: "member-1",
      });
    });

    const member = testEnvironment.authenticatedContext("member-1").firestore();
    const guest = testEnvironment.authenticatedContext("guest-1").firestore();
    const reactionPath = "spaces/space-1/messageReactions/reaction-1";
    assert.equal((await assertSucceeds(member.doc(reactionPath).get())).exists, true);
    await assertFails(guest.doc(reactionPath).get());
    await assertFails(member.doc("spaces/space-1/messageReactions/reaction-2").set({
      emoji: "👍",
      messageId: "thread-1",
      messageType: "thread",
      threadId: "thread-1",
      userId: "member-1",
    }));
    await assertFails(member.doc(reactionPath).delete());
  } finally {
    await testEnvironment.cleanup();
  }
});
