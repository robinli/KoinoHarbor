import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const VALID_ROLES = new Set(["admin", "member", "guest"]);

function publicUser(id, data) {
  return {
    active: data.active === true,
    createdAt: data.createdAt?.toDate?.().toISOString?.() ?? data.createdAt ?? null,
    createdBy: data.createdBy ?? null,
    displayName: data.displayName ?? data.email?.split("@")[0] ?? "user",
    email: data.email ?? "",
    id,
    role: data.role ?? "member",
    updatedAt: data.updatedAt?.toDate?.().toISOString?.() ?? data.updatedAt ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

export function getFirebaseApp(config) {
  return getApps()[0] ?? initializeApp({
    credential: applicationDefault(),
    projectId: config.firebaseProjectId,
    storageBucket: config.firebaseStorageBucket || undefined,
  });
}

export function createFirebaseAuth(config, dependencies = {}) {
  if (!config.firebaseProjectId) {
    throw new Error("使用 Firebase authentication provider 時必須設定 FIREBASE_PROJECT_ID。");
  }

  const app = dependencies.app ?? getFirebaseApp(config);
  const firebaseAuth = dependencies.auth ?? getAuth(app);
  const firestore = dependencies.firestore ?? getFirestore(app);
  const users = firestore.collection("users");

  async function userFromUid(uid) {
    const snapshot = await users.doc(uid).get();
    if (!snapshot.exists || snapshot.data().active !== true) return null;
    return publicUser(snapshot.id, snapshot.data());
  }

  return Object.freeze({
    provider: "firebase",

    async createClientToken(user) {
      return firebaseAuth.createCustomToken(user.id);
    },

    async exchangeIdToken(idToken) {
      const decodedToken = await firebaseAuth.verifyIdToken(idToken, true);
      const user = await userFromUid(decodedToken.uid);
      if (!user) return null;
      return {
        token: await firebaseAuth.createSessionCookie(idToken, { expiresIn: SESSION_DURATION_MS }),
        user,
      };
    },

    async verifySession(token) {
      if (!token) return null;
      try {
        const decodedToken = await firebaseAuth.verifySessionCookie(token, true);
        return await userFromUid(decodedToken.uid);
      } catch {
        return null;
      }
    },

    async revokeSession() {},

    async listUsers() {
      const snapshot = await users.orderBy("email").get();
      return snapshot.docs.map((document) => publicUser(document.id, document.data()));
    },

    async getUser(userId) {
      const snapshot = await users.doc(userId).get();
      return snapshot.exists ? publicUser(snapshot.id, snapshot.data()) : null;
    },

    async createUser(input, actorId) {
      const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
      const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
      const password = typeof input.password === "string" ? input.password : "";
      const role = input.role ?? "member";
      if (!email || !email.includes("@")) {
        const error = new Error("請輸入有效的 Email。");
        error.statusCode = 400;
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

      const authUser = await firebaseAuth.createUser({ displayName, email, password });
      const data = {
        active: input.active ?? true,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: actorId,
        displayName,
        email,
        role,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actorId,
      };
      await users.doc(authUser.uid).set(data);
      return publicUser(authUser.uid, { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    },

    async updateUser(userId, changes, actorId) {
      const reference = users.doc(userId);
      const snapshot = await reference.get();
      if (!snapshot.exists) return null;
      const update = {
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actorId,
      };
      if (changes.active !== undefined) {
        if (typeof changes.active !== "boolean") {
          const error = new Error("active 必須是布林值。");
          error.statusCode = 400;
          throw error;
        }
        update.active = changes.active;
      }
      if (changes.role !== undefined) {
        if (!VALID_ROLES.has(changes.role)) {
          const error = new Error("角色必須是 admin、member 或 guest。");
          error.statusCode = 400;
          throw error;
        }
        update.role = changes.role;
      }
      if (changes.displayName !== undefined) {
        if (typeof changes.displayName !== "string" || !changes.displayName.trim()) {
          const error = new Error("顯示名稱不可為空白。");
          error.statusCode = 400;
          throw error;
        }
        update.displayName = changes.displayName.trim();
      }
      const authChanges = {};
      if (changes.displayName !== undefined) authChanges.displayName = update.displayName;
      if (changes.password !== undefined) {
        if (typeof changes.password !== "string" || changes.password.length < 8) {
          const error = new Error("密碼至少需要 8 個字元。");
          error.statusCode = 400;
          throw error;
        }
        authChanges.password = changes.password;
      }
      if (Object.keys(authChanges).length) await firebaseAuth.updateUser(userId, authChanges);
      await reference.update(update);
      return publicUser(userId, { ...snapshot.data(), ...update, updatedAt: new Date().toISOString() });
    },
  });
}
