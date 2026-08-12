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
  assert.equal(store.listReplies(thread.id).length, 1);

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

