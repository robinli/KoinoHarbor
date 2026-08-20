import { randomUUID } from "node:crypto";

const VALID_ACCESS_MODES = new Set(["inherited", "restricted"]);
const VALID_USER_ROLES = new Set(["admin", "member", "guest"]);

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function conflictError(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

function copySpace(space) {
  return {
    accessMode: space.accessMode,
    allowedRoles: [...space.allowedRoles],
    archived: space.archived,
    createdAt: space.createdAt,
    createdBy: space.createdBy,
    deletedAt: space.deletedAt,
    deletedBy: space.deletedBy,
    description: space.description,
    id: space.id,
    name: space.name,
    parentId: space.parentId,
    sortOrder: space.sortOrder,
    updatedAt: space.updatedAt,
    updatedBy: space.updatedBy,
  };
}

function normaliseAllowedRoles(allowedRoles, accessMode) {
  if (accessMode === "inherited") {
    if (!Array.isArray(allowedRoles) || allowedRoles.length !== 0) {
      throw validationError("繼承父層成員的子工作區不可設定允許群組。");
    }
    return [];
  }
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    throw validationError("工作區至少必須允許一個群組加入。");
  }
  if (allowedRoles.some((role) => !VALID_USER_ROLES.has(role))) {
    throw validationError("允許群組只能包含 admin、member 或 guest。");
  }
  if (new Set(allowedRoles).size !== allowedRoles.length) {
    throw validationError("允許群組不可重複。");
  }
  return [...allowedRoles];
}

function normaliseParentId(parentId) {
  if (parentId === undefined || parentId === null || parentId === "") return null;
  if (typeof parentId !== "string" || !parentId.trim()) throw validationError("父工作區必須是有效的工作區 ID。");
  return parentId;
}

function normaliseAccessMode(accessMode, parentId) {
  if (parentId === null) {
    if (accessMode !== undefined && accessMode !== null && accessMode !== "restricted") {
      throw validationError("頂層工作區的存取模式只能是 restricted。");
    }
    return "restricted";
  }
  if (accessMode === undefined || accessMode === null) {
    throw validationError("子工作區必須指定存取模式。");
  }
  const value = accessMode;
  if (!VALID_ACCESS_MODES.has(value)) throw validationError("工作區存取模式必須是 inherited 或 restricted。");
  return value;
}

function normaliseSortOrder(sortOrder) {
  const value = sortOrder ?? 0;
  if (!Number.isInteger(value) || value < 0) throw validationError("工作區排序必須是大於或等於 0 的整數。");
  return value;
}

export function createInMemorySpaceStore() {
  const spaces = new Map();
  const memberships = new Map();

  function isDirectMember(spaceId, userId) {
    return memberships.get(spaceId)?.has(userId) ?? false;
  }

  return Object.freeze({
    createSpace(input, actor = { id: "system" }, now = new Date()) {
      const name = typeof input.name === "string" ? input.name.trim() : "";
      const description = typeof input.description === "string" ? input.description.trim() : "";
      const parentId = normaliseParentId(input.parentId);

      if (!name) {
        throw validationError("工作區名稱不可為空白。");
      }

      if (parentId && (!spaces.has(parentId) || spaces.get(parentId).deletedAt || spaces.get(parentId).parentId !== null)) {
        throw validationError("父工作區不存在、已刪除或不是頂層工作區。");
      }

      const accessMode = normaliseAccessMode(input.accessMode, parentId);
      const space = {
        accessMode,
        allowedRoles: normaliseAllowedRoles(input.allowedRoles, accessMode),
        archived: false,
        createdAt: now.toISOString(),
        createdBy: actor.id,
        deletedAt: null,
        deletedBy: null,
        description,
        id: randomUUID(),
        name,
        parentId,
        sortOrder: normaliseSortOrder(input.sortOrder),
        updatedAt: now.toISOString(),
        updatedBy: actor.id,
      };
      spaces.set(space.id, space);
      memberships.set(space.id, new Map());
      return copySpace(space);
    },

    getSpace(spaceId) {
      const space = spaces.get(spaceId);
      return space ? copySpace(space) : null;
    },

    canAccess(spaceId, user) {
      const space = spaces.get(spaceId);
      if (!space || space.deletedAt || !user?.active) return false;
      if (space.accessMode === "restricted" && space.allowedRoles.includes(user.role) && isDirectMember(spaceId, user.id)) return true;
      const parent = space.parentId === null ? null : spaces.get(space.parentId);
      return space.accessMode === "inherited"
        && !parent?.deletedAt
        && parent?.accessMode === "restricted"
        && parent?.allowedRoles.includes(user.role)
        && isDirectMember(parent.id, user.id);
    },

    canJoin(spaceId, user) {
      const space = spaces.get(spaceId);
      return Boolean(space && !space.deletedAt && !space.archived && space.accessMode === "restricted"
        && user?.active && space.allowedRoles.includes(user.role));
    },

    listSpaces(user) {
      return [...spaces.values()]
        .filter((space) => this.canAccess(space.id, user))
        .map((space) => ({
          ...copySpace(space),
          membershipType: isDirectMember(space.id, user.id) && space.allowedRoles.includes(user.role) ? "direct" : "inherited",
        }))
        .sort((left, right) => (left.parentId ? 1 : 0) - (right.parentId ? 1 : 0) || left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
    },

    listAllSpaces({ state = "active" } = {}) {
      return [...spaces.values()]
        .filter((space) => state === "all" || (state === "deleted" ? Boolean(space.deletedAt) : !space.deletedAt))
        .map(copySpace)
        .sort((left, right) => (left.parentId ? 1 : 0) - (right.parentId ? 1 : 0) || left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
    },

    listJoinableSpaces(user) {
      return [...spaces.values()]
        .filter((space) => this.canJoin(space.id, user) && !this.canAccess(space.id, user))
        .map(copySpace)
        .sort((left, right) => (left.parentId ? 1 : 0) - (right.parentId ? 1 : 0) || left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
    },

    updateSpace(spaceId, changes, actor = { id: "system" }, now = new Date()) {
      const space = spaces.get(spaceId);

      if (!space) {
        return null;
      }

      if (space.deletedAt) throw conflictError("已刪除的工作區必須先還原才能編輯。");

      if (changes.parentId !== undefined || changes.accessMode !== undefined) {
        throw validationError("工作區階層與存取模式建立後不可變更。");
      }

      if (changes.name !== undefined) {
        if (typeof changes.name !== "string" || !changes.name.trim()) {
          throw validationError("工作區名稱不可為空白。");
        }

        space.name = changes.name.trim();
      }

      if (changes.description !== undefined) {
        if (typeof changes.description !== "string") {
          throw validationError("工作區說明必須是文字。");
        }

        space.description = changes.description.trim();
      }

      if (changes.sortOrder !== undefined) {
        space.sortOrder = normaliseSortOrder(changes.sortOrder);
      }

      if (changes.archived !== undefined) {
        if (typeof changes.archived !== "boolean") {
          throw validationError("archived 必須是布林值。");
        }

        space.archived = changes.archived;
      }

      if (changes.allowedRoles !== undefined) {
        space.allowedRoles = normaliseAllowedRoles(changes.allowedRoles, space.accessMode);
      }

      space.updatedAt = now.toISOString();
      space.updatedBy = actor.id;

      return copySpace(space);
    },

    deleteSpace(spaceId, actor = { id: "system" }, now = new Date()) {
      const space = spaces.get(spaceId);
      if (!space) return null;
      if (space.deletedAt) return copySpace(space);
      if ([...spaces.values()].some((candidate) => candidate.parentId === spaceId && !candidate.deletedAt)) {
        throw conflictError("請先刪除此工作區下尚在使用的子工作區。");
      }
      space.deletedAt = now.toISOString();
      space.deletedBy = actor.id;
      space.updatedAt = now.toISOString();
      space.updatedBy = actor.id;
      return copySpace(space);
    },

    restoreSpace(spaceId, actor = { id: "system" }, now = new Date()) {
      const space = spaces.get(spaceId);
      if (!space) return null;
      if (!space.deletedAt) return copySpace(space);
      const parent = space.parentId === null ? null : spaces.get(space.parentId);
      if (space.parentId !== null && (!parent || parent.deletedAt)) {
        throw conflictError("必須先還原父工作區，才能還原此子工作區。");
      }
      space.deletedAt = null;
      space.deletedBy = null;
      space.updatedAt = now.toISOString();
      space.updatedBy = actor.id;
      return copySpace(space);
    },

    addMember(spaceId, user, actor = user, now = new Date()) {
      const space = spaces.get(spaceId);
      if (!space) {
        return null;
      }
      if (space.deletedAt) throw conflictError("已刪除的工作區不可新增成員。");
      if (space.accessMode === "inherited") throw conflictError("繼承父層成員的子工作區不接受直接加入。");
      if (!user?.active || !space.allowedRoles.includes(user.role)) {
        const error = new Error("使用者群組不符合此工作區的加入資格。");
        error.statusCode = 403;
        throw error;
      }
      const existing = memberships.get(spaceId).get(user.id);
      if (existing) return { ...existing };
      if (space.archived) {
        const error = new Error("封存的工作區不可新增成員。");
        error.statusCode = 409;
        throw error;
      }

      const membership = {
        createdAt: now.toISOString(),
        createdBy: actor.id,
        spaceId,
        userId: user.id,
      };
      memberships.get(spaceId).set(user.id, membership);
      return { ...membership };
    },

    removeMember(spaceId, userId) {
      return memberships.get(spaceId)?.delete(userId) ?? false;
    },

    listMembers(spaceId) {
      if (!spaces.has(spaceId)) {
        return null;
      }

      return [...memberships.get(spaceId).values()].map((membership) => ({ ...membership }));
    },

    removeIneligibleMembers(spaceId, users) {
      const space = spaces.get(spaceId);
      if (!space) return null;
      const usersById = new Map(users.map((user) => [user.id, user]));
      const removedUserIds = [];
      for (const userId of memberships.get(spaceId).keys()) {
        const user = usersById.get(userId);
        if (space.accessMode === "inherited" || !user || !space.allowedRoles.includes(user.role)) {
          memberships.get(spaceId).delete(userId);
          removedUserIds.push(userId);
        }
      }
      return removedUserIds;
    },

    removeIneligibleMembershipsForUser(user) {
      const removedSpaceIds = [];
      for (const [spaceId, members] of memberships) {
        const space = spaces.get(spaceId);
        if (members.has(user.id) && (space.accessMode === "inherited" || !space.allowedRoles.includes(user.role))) {
          members.delete(user.id);
          removedSpaceIds.push(spaceId);
        }
      }
      return removedSpaceIds;
    },
  });
}
