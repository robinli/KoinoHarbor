import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function iso(value) {
  return value?.toDate?.().toISOString?.() ?? value ?? null;
}

function plain(document) {
  if (!document?.exists) return null;
  const data = document.data();
  return {
    ...data,
    createdAt: iso(data.createdAt),
    id: document.id,
    updatedAt: iso(data.updatedAt),
  };
}

function serverTimestamp() {
  return new Date();
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function requiredText(value, name) {
  if (typeof value !== "string" || !value.trim()) throw validationError(`${name}不可為空白。`);
  return value.trim();
}

export function createFirestoreSpaceStore(app) {
  const firestore = getFirestore(app);
  const spaces = firestore.collection("spaces");

  return Object.freeze({
    async createSpace(input, actor) {
      if (!["department", "project"].includes(input.type)) throw validationError("工作區類型必須是 department 或 project。");
      const reference = spaces.doc();
      const now = serverTimestamp();
      const data = {
        archived: false,
        createdAt: now,
        createdBy: actor.id,
        description: typeof input.description === "string" ? input.description.trim() : "",
        name: requiredText(input.name, "工作區名稱"),
        type: input.type,
        updatedAt: now,
        updatedBy: actor.id,
      };
      await reference.set(data);
      return plain(await reference.get());
    },

    async getSpace(spaceId) {
      return plain(await spaces.doc(spaceId).get());
    },

    async canAccess(spaceId, user) {
      if (!user?.active || !(await spaces.doc(spaceId).get()).exists) return false;
      if (user.role === "admin") return true;
      return (await spaces.doc(spaceId).collection("members").doc(user.id).get()).exists;
    },

    async listSpaces(user) {
      const snapshot = await spaces.orderBy("name").get();
      if (user.role === "admin") return snapshot.docs.map(plain);
      const membershipChecks = await Promise.all(snapshot.docs.map(async (space) => ({
        membership: await space.ref.collection("members").doc(user.id).get(),
        space,
      })));
      return membershipChecks.filter((item) => item.membership.exists).map((item) => plain(item.space));
    },

    async updateSpace(spaceId, changes, actor) {
      const reference = spaces.doc(spaceId);
      if (!(await reference.get()).exists) return null;
      const update = { updatedAt: serverTimestamp(), updatedBy: actor.id };
      if (changes.name !== undefined) update.name = requiredText(changes.name, "工作區名稱");
      if (changes.description !== undefined) update.description = typeof changes.description === "string" ? changes.description.trim() : (() => { throw validationError("工作區說明必須是文字。"); })();
      if (changes.type !== undefined) {
        if (!["department", "project"].includes(changes.type)) throw validationError("工作區類型必須是 department 或 project。");
        update.type = changes.type;
      }
      if (changes.archived !== undefined) {
        if (typeof changes.archived !== "boolean") throw validationError("archived 必須是布林值。");
        update.archived = changes.archived;
      }
      await reference.update(update);
      return plain(await reference.get());
    },

    async addMember(spaceId, user, role, actor) {
      if (!["manager", "member", "guest"].includes(role)) throw validationError("成員角色必須是 manager、member 或 guest。");
      const reference = spaces.doc(spaceId);
      if (!(await reference.get()).exists) return null;
      const membership = { createdAt: serverTimestamp(), createdBy: actor.id, role, spaceId, userId: user.id };
      await reference.collection("members").doc(user.id).set(membership);
      return { ...membership, createdAt: iso(membership.createdAt) };
    },

    async removeMember(spaceId, userId) {
      const reference = spaces.doc(spaceId).collection("members").doc(userId);
      if (!(await reference.get()).exists) return false;
      await reference.delete();
      return true;
    },

    async listMembers(spaceId) {
      const reference = spaces.doc(spaceId);
      if (!(await reference.get()).exists) return null;
      const snapshot = await reference.collection("members").get();
      return snapshot.docs.map(plain);
    },
  });
}

export function createFirestoreDiscussionStore(app) {
  const firestore = getFirestore(app);
  const statuses = firestore.collection("threadStatuses");
  const threads = firestore.collection("threads");

  return Object.freeze({
    async createStatus(input, actor) {
      const reference = statuses.doc();
      const now = serverTimestamp();
      await reference.set({ active: input.active ?? true, createdAt: now, createdBy: actor.id, name: requiredText(input.name, "狀態名稱"), sortOrder: Number.isInteger(input.sortOrder) ? input.sortOrder : 1, updatedAt: now, updatedBy: actor.id });
      return plain(await reference.get());
    },
    async listStatuses({ includeInactive = false } = {}) {
      const results = (await statuses.orderBy("sortOrder").get()).docs.map(plain);
      return includeInactive ? results : results.filter((status) => status.active);
    },
    async updateStatus(id, changes, actor) {
      const reference = statuses.doc(id);
      if (!(await reference.get()).exists) return null;
      const update = { updatedAt: serverTimestamp(), updatedBy: actor.id };
      if (changes.name !== undefined) update.name = requiredText(changes.name, "狀態名稱");
      if (changes.sortOrder !== undefined) {
        if (!Number.isInteger(changes.sortOrder)) throw validationError("sortOrder 必須是整數。");
        update.sortOrder = changes.sortOrder;
      }
      if (changes.active !== undefined) {
        if (typeof changes.active !== "boolean") throw validationError("active 必須是布林值。");
        update.active = changes.active;
      }
      await reference.update(update);
      return plain(await reference.get());
    },
    async deleteStatus(id) {
      const reference = statuses.doc(id);
      const snapshot = await reference.get();
      if (!snapshot.exists) return null;
      const status = plain(snapshot);
      if (status.active) {
        const error = new Error("請先停用討論狀態，再進行刪除。");
        error.statusCode = 409;
        throw error;
      }
      const referencedThreads = await threads.where("statusId", "==", id).limit(1).get();
      if (!referencedThreads.empty) {
        const error = new Error("仍有討論使用此狀態，無法刪除。");
        error.statusCode = 409;
        throw error;
      }
      await reference.delete();
      return status;
    },
    async createThread(input, actor) {
      if (input.statusId && !(await statuses.doc(input.statusId).get()).exists) throw validationError("指定的討論狀態不存在。");
      const reference = threads.doc();
      const now = serverTimestamp();
      await reference.set({ archived: false, authorId: actor.id, content: requiredText(input.content, "討論內容"), createdAt: now, createdBy: actor.id, deleted: false, pinned: false, spaceId: requiredText(input.spaceId, "工作區"), statusId: input.statusId || null, title: requiredText(input.title, "討論標題"), updatedAt: now, updatedBy: actor.id });
      return plain(await reference.get());
    },
    async getThread(id) { return plain(await threads.doc(id).get()); },
    async listThreads(spaceIds) {
      if (!spaceIds.length) return [];
      const snapshots = await Promise.all(spaceIds.map((spaceId) => threads.where("spaceId", "==", spaceId).get()));
      return snapshots.flatMap((snapshot) => snapshot.docs.map(plain)).filter((thread) => !thread.deleted).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
    },
    async updateThread(id, changes, actor, canModerate) {
      const reference = threads.doc(id);
      const current = plain(await reference.get());
      if (!current) return null;
      if (actor.id !== current.authorId && !canModerate) { const error = new Error("只能修改自己的討論串。"); error.statusCode = 403; throw error; }
      const update = { updatedAt: serverTimestamp(), updatedBy: actor.id };
      if (changes.title !== undefined) update.title = requiredText(changes.title, "討論標題");
      if (changes.content !== undefined) update.content = requiredText(changes.content, "討論內容");
      if (changes.statusId !== undefined) {
        if (changes.statusId) {
          const status = plain(await statuses.doc(changes.statusId).get());
          if (!status || !status.active) throw validationError("指定的討論狀態不存在或已停用。");
        }
        update.statusId = changes.statusId || null;
      }
      for (const field of ["pinned", "archived"]) if (changes[field] !== undefined) {
        if (!canModerate) { const error = new Error("只有管理員可以置頂或封存討論串。"); error.statusCode = 403; throw error; }
        if (typeof changes[field] !== "boolean") throw validationError(`${field} 必須是布林值。`);
        update[field] = changes[field];
      }
      if (changes.deleted !== undefined) {
        if (typeof changes.deleted !== "boolean") throw validationError("deleted 必須是布林值。");
        update.deleted = changes.deleted;
      }
      await reference.update(update);
      return plain(await reference.get());
    },
    async createReply(threadId, input, actor) {
      const parent = threads.doc(threadId);
      if (!(await parent.get()).exists) return null;
      const parentReplyId = input.parentReplyId || null;
      if (parentReplyId && !(await parent.collection("replies").doc(parentReplyId).get()).exists) throw validationError("指定的父回覆不存在。");
      const reference = parent.collection("replies").doc();
      const now = serverTimestamp();
      await reference.set({ authorId: actor.id, content: requiredText(input.content, "回覆內容"), createdAt: now, createdBy: actor.id, deleted: false, parentReplyId, threadId, updatedAt: now, updatedBy: actor.id });
      await parent.update({ updatedAt: now, updatedBy: actor.id });
      return plain(await reference.get());
    },
    async listReplies(threadId) {
      if (!(await threads.doc(threadId).get()).exists) return null;
      return (await threads.doc(threadId).collection("replies").orderBy("createdAt").get()).docs.map(plain).filter((reply) => !reply.deleted);
    },
    async getReply(threadId, replyId) { return plain(await threads.doc(threadId).collection("replies").doc(replyId).get()); },
    async updateReply(threadId, replyId, changes, actor, _canModerate) {
      const reference = threads.doc(threadId).collection("replies").doc(replyId);
      const current = plain(await reference.get());
      if (!current) return null;
      if (actor.id !== current.authorId) { const error = new Error("只能修改自己的回覆。"); error.statusCode = 403; throw error; }
      const update = typeof changes === "string" ? { content: changes } : changes;
      const values = { updatedAt: serverTimestamp(), updatedBy: actor.id };
      if (update.content !== undefined) values.content = requiredText(update.content, "回覆內容");
      if (update.deleted !== undefined) {
        if (typeof update.deleted !== "boolean") throw validationError("deleted 必須是布林值。");
        values.deleted = update.deleted;
      }
      await reference.update(values);
      return plain(await reference.get());
    },
    async setBookmark(userId, threadId, bookmarked) {
      if (!(await threads.doc(threadId).get()).exists) return null;
      const reference = firestore.collection("users").doc(userId).collection("bookmarks").doc(threadId);
      if (bookmarked) await reference.set({ createdAt: serverTimestamp(), threadId, userId }); else await reference.delete();
      return { bookmarked, threadId };
    },
    async listBookmarks(userId, allowedSpaceIds) {
      const snapshot = await firestore.collection("users").doc(userId).collection("bookmarks").get();
      const documents = await Promise.all(snapshot.docs.map((bookmark) => threads.doc(bookmark.id).get()));
      return documents.map(plain).filter((thread) => thread && !thread.deleted && allowedSpaceIds.includes(thread.spaceId));
    },
    async search(query, allowedSpaceIds) {
      const needle = requiredText(query, "搜尋關鍵字").toLocaleLowerCase("zh-Hant");
      const candidates = await this.listThreads(allowedSpaceIds);
      const results = [];
      for (const thread of candidates) {
        const threadReplies = await this.listReplies(thread.id);
        const text = [thread.title, thread.content, ...threadReplies.map((reply) => reply.content)].join("\n").toLocaleLowerCase("zh-Hant");
        if (text.includes(needle)) results.push(thread);
      }
      return results;
    },
  });
}

export function createFirebaseAttachmentStore(app) {
  const firestore = getFirestore(app);
  const bucket = getStorage(app).bucket();
  const attachments = firestore.collection("attachments");
  const allowed = /^(image\/(jpeg|png|webp)|application\/(pdf|msword|vnd\.ms-(excel|powerpoint)|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|zip))$/;
  return Object.freeze({
    async create(input, actor) {
      if (!allowed.test(input.mimeType)) throw validationError("不支援此檔案類型。");
      if (typeof input.contentBase64 !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.contentBase64)) throw validationError("附件內容格式不正確。");
      const content = Buffer.from(input.contentBase64 ?? "", "base64");
      if (content.toString("base64").replace(/=+$/, "") !== input.contentBase64.replace(/=+$/, "")) throw validationError("附件內容格式不正確。");
      if (!content.length || content.length > 20 * 1024 * 1024) throw validationError("附件不可為空白或超過 20 MB。");
      const reference = attachments.doc();
      const fileName = requiredText(input.fileName, "檔案名稱").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
      const storagePath = `spaces/${input.spaceId}/threads/${input.threadId}/${reference.id}-${fileName}`;
      await bucket.file(storagePath).save(content, { contentType: input.mimeType, resumable: false });
      const now = serverTimestamp();
      await reference.set({ createdAt: now, createdBy: actor.id, fileName, fileSize: content.length, mimeType: input.mimeType, replyId: input.replyId || null, spaceId: input.spaceId, storagePath, threadId: input.threadId, updatedAt: now, updatedBy: actor.id, uploadedBy: actor.id });
      return plain(await reference.get());
    },
    async getMetadata(id) { return plain(await attachments.doc(id).get()); },
    async listForThread(threadId) { return (await attachments.where("threadId", "==", threadId).get()).docs.map(plain); },
    async read(id) {
      const metadata = plain(await attachments.doc(id).get());
      if (!metadata) return null;
      const [content] = await bucket.file(metadata.storagePath).download();
      return { content, metadata };
    },
    async delete(id) {
      const reference = attachments.doc(id);
      const metadata = plain(await reference.get());
      if (!metadata) return null;
      await bucket.file(metadata.storagePath).delete({ ignoreNotFound: true });
      await reference.delete();
      return metadata;
    },
  });
}
