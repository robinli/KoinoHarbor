import { randomUUID } from "node:crypto";

const VALID_SPACE_TYPES = new Set(["department", "project"]);
const VALID_MEMBERSHIP_ROLES = new Set(["manager", "member", "guest"]);

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function copySpace(space) {
  return {
    archived: space.archived,
    createdAt: space.createdAt,
    createdBy: space.createdBy,
    description: space.description,
    id: space.id,
    name: space.name,
    type: space.type,
    updatedAt: space.updatedAt,
    updatedBy: space.updatedBy,
  };
}

export function createInMemorySpaceStore() {
  const spaces = new Map();
  const memberships = new Map();

  return Object.freeze({
    createSpace(input, actor = { id: "system" }, now = new Date()) {
      const name = typeof input.name === "string" ? input.name.trim() : "";
      const description = typeof input.description === "string" ? input.description.trim() : "";

      if (!name) {
        throw validationError("工作區名稱不可為空白。");
      }

      if (!VALID_SPACE_TYPES.has(input.type)) {
        throw validationError("工作區類型必須是 department 或 project。");
      }

      const space = {
        archived: false,
        createdAt: now.toISOString(),
        createdBy: actor.id,
        description,
        id: randomUUID(),
        name,
        type: input.type,
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
      if (!spaces.has(spaceId) || !user?.active) {
        return false;
      }

      if (user.role === "admin") {
        return true;
      }

      return memberships.get(spaceId)?.has(user.id) ?? false;
    },

    listSpaces(user) {
      return [...spaces.values()]
        .filter((space) => {
          if (user.role === "admin") {
            return true;
          }

          return memberships.get(space.id)?.has(user.id) ?? false;
        })
        .map(copySpace)
        .sort((left, right) => left.name.localeCompare(right.name));
    },

    updateSpace(spaceId, changes, actor = { id: "system" }, now = new Date()) {
      const space = spaces.get(spaceId);

      if (!space) {
        return null;
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
