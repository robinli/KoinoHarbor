import { randomUUID } from "node:crypto";

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function requiredText(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw validationError(`${fieldName}不可為空白。`);
  }

  return value.trim();
}

function copy(value) {
  return structuredClone(value);
}

export function createInMemoryDiscussionStore() {
  const statuses = new Map();
  const threads = new Map();
  const replies = new Map();
  const bookmarks = new Map();

  return Object.freeze({
    createStatus(input, actor, now = new Date()) {
      const status = {
        active: input.active ?? true,
        createdAt: now.toISOString(),
        createdBy: actor.id,
        id: randomUUID(),
        name: requiredText(input.name, "狀態名稱"),
        sortOrder: Number.isInteger(input.sortOrder) ? input.sortOrder : statuses.size + 1,
        updatedAt: now.toISOString(),
        updatedBy: actor.id,
      };
      statuses.set(status.id, status);
      return copy(status);
    },

    listStatuses({ includeInactive = false } = {}) {
      return [...statuses.values()]
        .filter((status) => includeInactive || status.active)
        .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
        .map(copy);
    },

    updateStatus(statusId, changes, actor, now = new Date()) {
      const status = statuses.get(statusId);

      if (!status) {
        return null;
      }

      if (changes.name !== undefined) {
        status.name = requiredText(changes.name, "狀態名稱");
      }

      if (changes.sortOrder !== undefined) {
        if (!Number.isInteger(changes.sortOrder)) {
          throw validationError("sortOrder 必須是整數。");
        }

        status.sortOrder = changes.sortOrder;
      }

      if (changes.active !== undefined) {
        if (typeof changes.active !== "boolean") {
          throw validationError("active 必須是布林值。");
        }

        status.active = changes.active;
      }

      status.updatedAt = now.toISOString();
      status.updatedBy = actor.id;
      return copy(status);
    },

    deleteStatus(statusId) {
      const status = statuses.get(statusId);

      if (!status) {
        return null;
      }
      if (status.active) {
        const error = new Error("請先停用討論狀態，再進行刪除。");
        error.statusCode = 409;
        throw error;
      }
      if ([...threads.values()].some((thread) => thread.statusId === statusId)) {
        const error = new Error("仍有討論使用此狀態，無法刪除。");
        error.statusCode = 409;
        throw error;
      }

      statuses.delete(statusId);
      return copy(status);
    },

    createThread(input, actor, now = new Date()) {
      const statusId = input.statusId || null;

      if (statusId && (!statuses.has(statusId) || !statuses.get(statusId).active)) {
        throw validationError("指定的討論狀態不存在或已停用。");
      }

      const thread = {
        archived: false,
        authorId: actor.id,
        content: requiredText(input.content, "討論內容"),
        createdAt: now.toISOString(),
        createdBy: actor.id,
        id: randomUUID(),
        pinned: false,
        spaceId: requiredText(input.spaceId, "工作區"),
        statusId,
        title: requiredText(input.title, "討論標題"),
        updatedAt: now.toISOString(),
        updatedBy: actor.id,
      };
      threads.set(thread.id, thread);
      replies.set(thread.id, new Map());
      return copy(thread);
    },

    getThread(threadId) {
      const thread = threads.get(threadId);
      return thread ? copy(thread) : null;
    },

    listThreads(spaceIds) {
      const allowedSpaces = new Set(spaceIds);
      return [...threads.values()]
        .filter((thread) => allowedSpaces.has(thread.spaceId))
        .sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.updatedAt.localeCompare(left.updatedAt))
        .map(copy);
    },

    updateThread(threadId, changes, actor, canModerate = false, now = new Date()) {
      const thread = threads.get(threadId);

      if (!thread) {
        return null;
      }

      if (actor.id !== thread.authorId && !canModerate) {
        const error = new Error("只能修改自己的討論串。");
        error.statusCode = 403;
        throw error;
      }

      if (changes.title !== undefined) {
        thread.title = requiredText(changes.title, "討論標題");
      }

      if (changes.content !== undefined) {
        thread.content = requiredText(changes.content, "討論內容");
      }

      if (changes.statusId !== undefined) {
        if (changes.statusId && (!statuses.has(changes.statusId) || !statuses.get(changes.statusId).active)) {
          throw validationError("指定的討論狀態不存在或已停用。");
        }
        thread.statusId = changes.statusId || null;
      }

      for (const field of ["pinned", "archived"]) {
        if (changes[field] !== undefined) {
          if (!canModerate) {
            const error = new Error("只有管理員可以置頂或封存討論串。");
            error.statusCode = 403;
            throw error;
          }
          if (typeof changes[field] !== "boolean") {
            throw validationError(`${field} 必須是布林值。`);
          }
          thread[field] = changes[field];
        }
      }

      thread.updatedAt = now.toISOString();
      thread.updatedBy = actor.id;
      return copy(thread);
    },

    createReply(threadId, input, actor, now = new Date()) {
      if (!threads.has(threadId)) {
        return null;
      }

      const reply = {
        authorId: actor.id,
        content: requiredText(input.content, "回覆內容"),
        createdAt: now.toISOString(),
        createdBy: actor.id,
        id: randomUUID(),
        threadId,
        updatedAt: now.toISOString(),
        updatedBy: actor.id,
      };
      replies.get(threadId).set(reply.id, reply);
      threads.get(threadId).updatedAt = now.toISOString();
      return copy(reply);
    },

    listReplies(threadId) {
      if (!threads.has(threadId)) {
        return null;
      }
      return [...replies.get(threadId).values()]
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(copy);
    },

    updateReply(threadId, replyId, content, actor, canModerate = false, now = new Date()) {
      const reply = replies.get(threadId)?.get(replyId);
      if (!reply) return null;
      if (actor.id !== reply.authorId && !canModerate) {
        const error = new Error("只能修改自己的回覆。");
        error.statusCode = 403;
        throw error;
      }
      reply.content = requiredText(content, "回覆內容");
      reply.updatedAt = now.toISOString();
      reply.updatedBy = actor.id;
      return copy(reply);
    },

    setBookmark(userId, threadId, bookmarked, now = new Date()) {
      if (!threads.has(threadId)) return null;
      const userBookmarks = bookmarks.get(userId) ?? new Map();
      bookmarks.set(userId, userBookmarks);
      if (bookmarked) {
        userBookmarks.set(threadId, { createdAt: now.toISOString(), threadId, userId });
      } else {
        userBookmarks.delete(threadId);
      }
      return { bookmarked, threadId };
    },

    listBookmarks(userId, allowedSpaceIds) {
      const allowedSpaces = new Set(allowedSpaceIds);
      return [...(bookmarks.get(userId)?.values() ?? [])]
        .map((bookmark) => threads.get(bookmark.threadId))
        .filter((thread) => thread && allowedSpaces.has(thread.spaceId))
        .map(copy);
    },

    search(query, allowedSpaceIds) {
      const normalizedQuery = requiredText(query, "搜尋關鍵字").toLocaleLowerCase("zh-Hant");
      const allowedSpaces = new Set(allowedSpaceIds);
      return [...threads.values()]
        .filter((thread) => allowedSpaces.has(thread.spaceId))
        .map((thread) => {
          const threadReplies = [...replies.get(thread.id).values()];
          const haystack = [thread.title, thread.content, ...threadReplies.map((reply) => reply.content)]
            .join("\n")
            .toLocaleLowerCase("zh-Hant");
          return haystack.includes(normalizedQuery) ? copy(thread) : null;
        })
        .filter(Boolean);
    },
  });
}
