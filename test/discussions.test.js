import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryDiscussionStore } from "../src/discussions.js";

const admin = { active: true, id: "admin-1", role: "admin" };
const member = { active: true, id: "member-1", role: "member" };

test("status lifecycle supports create, order, rename and disable", () => {
  const store = createInMemoryDiscussionStore();
  const waiting = store.createStatus({ name: "等待回覆", sortOrder: 2 }, admin);
  const processing = store.createStatus({ name: "處理中", sortOrder: 1 }, admin);

  assert.deepEqual(store.listStatuses().map((status) => status.name), ["處理中", "等待回覆"]);

  const updated = store.updateStatus(waiting.id, { active: false, name: "暫停處理" }, admin);
  assert.equal(updated.name, "暫停處理");
  assert.equal(store.listStatuses().length, 1);
  assert.equal(store.listStatuses({ includeInactive: true }).length, 2);
  assert.equal(processing.active, true);
  assert.throws(() => store.deleteStatus(processing.id), /請先停用/);
  assert.equal(store.deleteStatus(waiting.id).id, waiting.id);
  assert.equal(store.listStatuses({ includeInactive: true }).length, 1);
});

test("a status referenced by a thread cannot be deleted", () => {
  const store = createInMemoryDiscussionStore();
  const status = store.createStatus({ name: "待確認" }, admin);
  store.createThread({ content: "內容", spaceId: "space-1", statusId: status.id, title: "討論" }, member);
  store.updateStatus(status.id, { active: false }, admin);

  assert.throws(() => store.deleteStatus(status.id), /仍有討論使用此狀態/);
});

test("thread, replies, moderation, bookmarks and search work together", () => {
  const store = createInMemoryDiscussionStore();
  const status = store.createStatus({ name: "未處理" }, admin);
  const thread = store.createThread({
    content: "ERP 報價欄位顯示錯誤",
    spaceId: "space-1",
    statusId: status.id,
    title: "報價單問題",
  }, member);

  const reply = store.createReply(thread.id, { content: "已確認是稅率格式造成" }, admin);
  const nestedReply = store.createReply(thread.id, { content: "收到，稍後複驗", parentReplyId: reply.id }, member);
  assert.equal(store.listReplies(thread.id).length, 2);
  assert.equal(store.getReply(thread.id, nestedReply.id).parentReplyId, reply.id);
  assert.throws(() => store.createReply(thread.id, { content: "錯誤父回覆", parentReplyId: "missing" }, member), /父回覆不存在/);
  assert.throws(() => store.updateReply(thread.id, nestedReply.id, "管理員不可代改", admin, true), /只能修改自己的回覆/);

  const editedReply = store.updateReply(thread.id, reply.id, "已確認是稅率格式造成，正在修正", admin, true);
  assert.match(editedReply.content, /正在修正/);

  const moderated = store.updateThread(thread.id, { pinned: true }, admin, true);
  assert.equal(moderated.pinned, true);
  assert.throws(() => store.updateThread(thread.id, { archived: true }, member), /只有管理員/);

  store.setBookmark(member.id, thread.id, true);
  assert.equal(store.listBookmarks(member.id, ["space-1"]).length, 1);
  assert.equal(store.listBookmarks(member.id, ["other-space"]).length, 0);
  assert.equal(store.search("稅率格式", ["space-1"])[0].id, thread.id);
  assert.equal(store.search("稅率格式", ["other-space"]).length, 0);
});

test("message reactions are idempotent, isolated and removable", () => {
  const store = createInMemoryDiscussionStore();
  const first = {
    emoji: "✅",
    messageId: "thread-1",
    messageType: "thread",
    spaceId: "space-1",
    threadId: "thread-1",
    userDisplayName: "Member",
    userId: member.id,
  };
  const second = { ...first, userDisplayName: "Admin", userId: admin.id };
  const reply = { ...first, messageId: "reply-1", messageType: "reply" };

  store.setReaction(first, true, new Date("2026-08-19T01:00:00.000Z"));
  store.setReaction(first, true, new Date("2026-08-19T02:00:00.000Z"));
  store.setReaction(second, true, new Date("2026-08-19T03:00:00.000Z"));
  store.setReaction(reply, true, new Date("2026-08-19T04:00:00.000Z"));
  assert.equal(store.listReactions("space-1", ["thread-1"]).length, 3);
  assert.equal(store.listReactions("space-2", ["thread-1"]).length, 0);

  store.setReaction(first, false);
  const remaining = store.listReactions("space-1", ["thread-1"]);
  assert.equal(remaining.length, 2);
  assert.deepEqual(remaining.map((reaction) => reaction.messageType), ["thread", "reply"]);
});

