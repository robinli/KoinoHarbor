import { randomUUID } from "node:crypto";

const VALID_ACCESS_MODES = new Set(["inherited", "restricted"]);
const VALID_MEMBERSHIP_ROLES = new Set(["manager", "member", "guest"]);

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function copySpace(space) {
  return {
    accessMode: space.accessMode,
    archived: space.archived,
    createdAt: space.createdAt,
    createdBy: space.createdBy,
    description: space.description,
    id: space.id,
    name: space.name,
    parentId: space.parentId,
    updatedAt: space.updatedAt,
    updatedBy: space.updatedBy,
  };
}

function normaliseParentId(parentId) {
  if (parentId === undefined || parentId === null || parentId === "") return null;
  if (typeof parentId !== "string" || !parentId.trim()) throw validationError("父工作區必須是有效的工作區 ID。");
  return parentId;
}

function normaliseAccessMode(accessMode) {
  const value = accessMode ?? "inherited";
  if (!VALID_ACCESS_MODES.has(value)) throw validationError("工作區存取模式必須是 inherited 或 restricted。");
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

      if (parentId && (!spaces.has(parentId) || spaces.get(parentId).parentId !== null)) {
        throw validationError("父工作區不存在或不是頂層工作區。");
      }

      const space = {
        accessMode: normaliseAccessMode(input.accessMode),
        archived: false,
        createdAt: now.toISOString(),
        createdBy: actor.id,
        description,
        id: randomUUID(),
        name,
        parentId,
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
      if (!space || !user?.active) return false;
      if (user.role === "admin" || isDirectMember(spaceId, user.id)) return true;
      return space.parentId !== null && space.accessMode === "inherited" && isDirectMember(space.parentId, user.id);
    },

    listSpaces(user) {
      return [...spaces.values()]
        .filter((space) => this.canAccess(space.id, user))
        .map(copySpace)
        .sort((left, right) => (left.parentId ? 1 : 0) - (right.parentId ? 1 : 0) || left.name.localeCompare(right.name));
    },

    updateSpace(spaceId, changes, actor = { id: "system" }, now = new Date()) {
      const space = spaces.get(spaceId);

      if (!space) {
        return null;
      }

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

      if (changes.type !== undefined) {
        if (!VALID_SPACE_TYPES.has(changes.type)) {
          throw validationError("工作區類型必須是 department 或 project。");
        }

        space.type = changes.type;
      }

      if (changes.archived !== undefined) {
        if (typeof changes.archived !== "boolean") {
          throw validationError("archived 必須是布林值。");
        }

        space.archived = changes.archived;
      }

      space.updatedAt = now.toISOString();
      space.updatedBy = actor.id;

      return copySpace(space);
    },

    addMember(spaceId, user, role = "member", actor = user, now = new Date()) {
      if (!spaces.has(spaceId)) {
        return null;
      }

      if (!VALID_MEMBERSHIP_ROLES.has(role)) {
        throw validationError("成員角色必須是 manager、member 或 guest。");
      }

      const membership = {
        createdAt: now.toISOString(),
        createdBy: actor.id,
        role,
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
  });
}
