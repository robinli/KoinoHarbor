import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const SESSION_DURATION_SECONDS = 8 * 60 * 60;
const VALID_ROLES = new Set(["admin", "member", "guest"]);

function encode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function publicUser(user) {
  return {
    active: user.active,
    createdAt: user.createdAt,
    createdBy: user.createdBy,
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    updatedAt: user.updatedAt,
    updatedBy: user.updatedBy,
  };
}

export function createDevelopmentAuth(config) {
  const usersByEmail = new Map();
  const usersById = new Map();

  for (const entry of config.developmentUsers) {
    const email = entry.email.toLowerCase();
    const now = new Date().toISOString();
    const user = {
      active: entry.active ?? true,
      createdAt: now,
      createdBy: "system",
      id: randomUUID(),
      email,
      displayName: entry.displayName?.trim() || email.split("@")[0],
      password: entry.password,
      role: entry.role,
      updatedAt: now,
      updatedBy: "system",
    };
    usersByEmail.set(email, user);
    usersById.set(user.id, user);
  }

  return Object.freeze({
    provider: "development",
    authenticate(email, password) {
      const user = usersByEmail.get(email.trim().toLowerCase());

      if (!user || !user.active || !constantTimeEqual(user.password, password)) {
        return null;
      }

      return publicUser(user);
    },

    createSession(user, now = Date.now()) {
      const payload = encode(JSON.stringify({
        exp: Math.floor(now / 1000) + SESSION_DURATION_SECONDS,
        userId: user.id,
      }));

      return `${payload}.${sign(payload, config.sessionSecret)}`;
    },

    verifySession(token, now = Date.now()) {
      if (!token) {
        return null;
      }

      const [payload, signature, extra] = token.split(".");

      if (!payload || !signature || extra || !constantTimeEqual(sign(payload, config.sessionSecret), signature)) {
        return null;
      }

      try {
        const session = JSON.parse(decode(payload));

        if (!session.exp || session.exp <= Math.floor(now / 1000)) {
          return null;
        }

        const user = usersById.get(session.userId);

        return user?.active ? publicUser(user) : null;
      } catch {
        return null;
      }
    },

    revokeSession() {},

    listUsers() {
      return [...usersById.values()]
        .map(publicUser)
        .sort((left, right) => left.email.localeCompare(right.email));
    },

    getUser(userId) {
      const user = usersById.get(userId);
      return user ? publicUser(user) : null;
    },

    createUser(input, actorId = "admin") {
      const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
      const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
      const password = typeof input.password === "string" ? input.password : "";
      const role = input.role ?? "member";

      if (!email || !email.includes("@")) {
        const error = new Error("請輸入有效的 Email。");
        error.statusCode = 400;
        throw error;
      }
      if (usersByEmail.has(email)) {
        const error = new Error("此 Email 已經存在。");
        error.statusCode = 409;
        throw error;
      }
      if (!displayName) {
        const error = new Error("顯示名稱不可為空白。");
        error.statusCode = 400;
        throw error;
      }
      if (password.length < 8) {
        const error = new Error("密碼至少需要 8 個字元。");
        error.statusCode = 400;
        throw error;
      }
      if (!VALID_ROLES.has(role)) {
        const error = new Error("角色必須是 admin、member 或 guest。");
        error.statusCode = 400;
        throw error;
      }

      const now = new Date().toISOString();
      const user = {
        active: input.active ?? true,
        createdAt: now,
        createdBy: actorId,
        displayName,
        email,
        id: randomUUID(),
        password,
        role,
        updatedAt: now,
        updatedBy: actorId,
      };
      usersByEmail.set(email, user);
      usersById.set(user.id, user);
      return publicUser(user);
    },

    updateUser(userId, changes, actorId = "admin") {
      const user = usersById.get(userId);

      if (!user) {
        return null;
      }

      if (changes.role !== undefined) {
        if (!VALID_ROLES.has(changes.role)) {
          const error = new Error("角色必須是 admin、member 或 guest。");
          error.statusCode = 400;
          throw error;
        }

        user.role = changes.role;
      }

      if (changes.active !== undefined) {
        if (typeof changes.active !== "boolean") {
          const error = new Error("active 必須是布林值。");
          error.statusCode = 400;
          throw error;
        }

        user.active = changes.active;
      }

      if (changes.displayName !== undefined) {
        if (typeof changes.displayName !== "string" || !changes.displayName.trim()) {
          const error = new Error("顯示名稱不可為空白。");
          error.statusCode = 400;
          throw error;
        }

        user.displayName = changes.displayName.trim();
      }

      if (changes.password !== undefined) {
        if (typeof changes.password !== "string" || changes.password.length < 8) {
          const error = new Error("密碼至少需要 8 個字元。");
          error.statusCode = 400;
          throw error;
        }

        user.password = changes.password;
      }


      user.updatedAt = new Date().toISOString();
      user.updatedBy = actorId;

      return publicUser(user);
    },
  });
}

export function createSessionCookie(token, secure = false) {
  const parts = [
    `koino_session=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${SESSION_DURATION_SECONDS}`,
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function clearSessionCookie(secure = false) {
  const parts = ["koino_session=", "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function readSessionCookie(cookieHeader = "") {
  for (const cookie of cookieHeader.split(";")) {
    const [name, ...valueParts] = cookie.trim().split("=");

    if (name === "koino_session") {
      return valueParts.join("=");
    }
  }

  return null;
}

