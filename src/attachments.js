import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/msword",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function safeFileName(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw validationError("檔案名稱不可為空白。");
  }

  return path.basename(value.trim()).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
}

export function createLocalAttachmentStore(options = {}) {
  const directory = path.resolve(options.directory ?? path.join(process.cwd(), "data", "uploads"));
  const maximumBytes = options.maximumBytes ?? MAX_FILE_SIZE;
  const metadata = new Map();

  return Object.freeze({
    async create(input, actor, now = new Date()) {
      if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
        throw validationError("不支援此檔案類型。");
      }

      let content;
      if (typeof input.contentBase64 !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.contentBase64)) {
        throw validationError("附件內容格式不正確。");
      }
      try {
        content = Buffer.from(input.contentBase64 ?? "", "base64");
      } catch {
        throw validationError("附件內容格式不正確。");
      }

      if (content.toString("base64").replace(/=+$/, "") !== input.contentBase64.replace(/=+$/, "")) {
        throw validationError("附件內容格式不正確。");
      }

      if (content.length === 0) {
        throw validationError("附件內容不可為空白。");
      }

      if (content.length > maximumBytes) {
        throw validationError(`附件不可超過 ${Math.floor(maximumBytes / 1024 / 1024)} MB。`);
      }

      const id = randomUUID();
      const attachment = {
        createdAt: now.toISOString(),
        createdBy: actor.id,
        fileName: safeFileName(input.fileName),
        fileSize: content.length,
        id,
        mimeType: input.mimeType,
        replyId: input.replyId || null,
        storagePath: `${id}.bin`,
        threadId: input.threadId,
        uploadedBy: actor.id,
      };
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, attachment.storagePath), content, { flag: "wx" });
      metadata.set(id, attachment);
      return structuredClone(attachment);
    },

    getMetadata(attachmentId) {
      const attachment = metadata.get(attachmentId);
      return attachment ? structuredClone(attachment) : null;
    },

    listForThread(threadId) {
      return [...metadata.values()]
        .filter((attachment) => attachment.threadId === threadId)
        .map((attachment) => structuredClone(attachment));
    },

    async read(attachmentId) {
      const attachment = metadata.get(attachmentId);
      if (!attachment) return null;
      return {
        content: await readFile(path.join(directory, attachment.storagePath)),
        metadata: structuredClone(attachment),
      };
    },

    async delete(attachmentId) {
      const attachment = metadata.get(attachmentId);
      if (!attachment) return null;
      await rm(path.join(directory, attachment.storagePath), { force: true });
      metadata.delete(attachmentId);
      return structuredClone(attachment);
    },
  });
}
