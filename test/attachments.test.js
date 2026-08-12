import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLocalAttachmentStore } from "../src/attachments.js";

const actor = { id: "member-1" };

test("attachment store validates, writes, lists and reads files", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koino-attachment-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const store = createLocalAttachmentStore({ directory, maximumBytes: 1024 });
  const original = Buffer.from("POC attachment content", "utf8");

  const attachment = await store.create({
    contentBase64: original.toString("base64"),
    fileName: "驗證文件.pdf",
    mimeType: "application/pdf",
    threadId: "thread-1",
  }, actor);

  assert.equal(attachment.fileName, "驗證文件.pdf");
  assert.equal(store.listForThread("thread-1").length, 1);
  const file = await store.read(attachment.id);
  assert.deepEqual(file.content, original);
});

test("attachment store rejects unsupported and oversized files", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koino-attachment-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const store = createLocalAttachmentStore({ directory, maximumBytes: 4 });

  await assert.rejects(() => store.create({
    contentBase64: Buffer.from("content").toString("base64"),
    fileName: "script.exe",
    mimeType: "application/octet-stream",
    threadId: "thread-1",
  }, actor), /不支援/);

  await assert.rejects(() => store.create({
    contentBase64: Buffer.from("content").toString("base64"),
    fileName: "large.pdf",
    mimeType: "application/pdf",
    threadId: "thread-1",
  }, actor), /不可超過/);
});
