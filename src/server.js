import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./config.js";
import { createLocalAttachmentStore } from "./attachments.js";
import { createInMemoryDiscussionStore } from "./discussions.js";
import { createFirebaseAuth, getFirebaseApp } from "./firebase-auth.js";
import {
  createFirebaseAttachmentStore,
  createFirestoreDiscussionStore,
  createFirestoreSpaceStore,
} from "./firebase-stores.js";
import { createInMemorySpaceStore } from "./spaces.js";
import {
  clearSessionCookie,
  createDevelopmentAuth,
  createSessionCookie,
  readSessionCookie,
} from "./auth.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultPublicDirectory = path.resolve(moduleDirectory, "..", "public");
const bootstrapDirectory = path.resolve(moduleDirectory, "..", "node_modules", "bootstrap", "dist", "css");
const bootstrapIconsDirectory = path.resolve(moduleDirectory, "..", "node_modules", "bootstrap-icons", "font");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  response.end(JSON.stringify(payload));
}

function authenticatedUser(request) {
  return request.authenticatedUser ?? null;
}

function requireUser(request, response, _authService, requiredRole = null) {
  const user = authenticatedUser(request);

  if (!user) {
    sendJson(response, 401, {
      error: "unauthenticated",
      message: "尚未登入。",
    });
    return null;
  }

  if (requiredRole && user.role !== requiredRole) {
    sendJson(response, 403, {
      error: "forbidden",
      message: "沒有執行此操作的權限。",
    });
    return null;
  }

  return user;
}

async function readJsonBody(request, maximumBytes = 16_384) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;

    if (totalBytes > maximumBytes) {
      const error = new Error("Request body is too large");
      error.statusCode = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    const error = new Error("Request body must be valid JSON");
    error.statusCode = 400;
    throw error;
  }
}

function resolvePublicFile(publicDirectory, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const decodedPath = decodeURIComponent(requestedPath);
  const relativePath = decodedPath.replace(/^[/\\]+/, "");
  const filePath = path.resolve(publicDirectory, relativePath);
  const publicRoot = `${path.resolve(publicDirectory)}${path.sep}`;

  return filePath.startsWith(publicRoot) ? filePath : null;
}

async function serveStaticFile(response, publicDirectory, pathname) {
  let filePath;

  try {
    filePath = resolvePublicFile(publicDirectory, pathname);
  } catch {
    return false;
  }

  if (!filePath) {
    return false;
  }

  try {
    const fileStats = await stat(filePath);

    if (!fileStats.isFile()) {
      return false;
    }

    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Length": fileStats.size,
      "Content-Type": contentTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://identitytoolkit.googleapis.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    createReadStream(filePath).pipe(response);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export function createApplicationServer(options = {}) {
  const config = options.config ?? loadConfig();
  const publicDirectory = options.publicDirectory ?? defaultPublicDirectory;
  const authProvider = config.authProvider ?? "development";

  if (!options.authService && !["development", "firebase"].includes(authProvider)) {
    throw new Error(`不支援的 Authentication provider：${authProvider}`);
  }

  const firebaseApp = authProvider === "firebase" && !options.authService ? getFirebaseApp(config) : null;
  const authService = options.authService ?? (authProvider === "firebase"
    ? createFirebaseAuth(config, { app: firebaseApp })
    : createDevelopmentAuth({
      developmentUsers: config.developmentUsers ?? [],
      sessionSecret: config.sessionSecret ?? "test-secret",
    }));
  const secureCookies = config.environment === "production";
  const spaceStore = options.spaceStore ?? (firebaseApp ? createFirestoreSpaceStore(firebaseApp) : createInMemorySpaceStore());
  const discussionStore = options.discussionStore ?? (firebaseApp ? createFirestoreDiscussionStore(firebaseApp) : createInMemoryDiscussionStore());
  const attachmentStore = options.attachmentStore ?? (firebaseApp ? createFirebaseAttachmentStore(firebaseApp) : createLocalAttachmentStore());

  if (config.seedDevelopmentData && authService.provider === "development") {
    const developmentUsers = authService.listUsers();
    const admin = developmentUsers.find((user) => user.role === "admin");
    const member = developmentUsers.find((user) => user.role === "member");
    if (admin && member) {
      const company = spaceStore.createSpace({
        description: "公司內部公告與共通資訊",
        name: "公司公告",
      }, admin);
      spaceStore.addMember(company.id, member, "member", admin);
      const implementation = spaceStore.createSpace({
        description: "ERP 導入相關討論與追蹤",
        name: "ERP 導入專案",
        parentId: company.id,
      }, admin);
      const openStatus = discussionStore.createStatus({ name: "未處理", sortOrder: 1 }, admin);
      discussionStore.createStatus({ name: "處理中", sortOrder: 2 }, admin);
      discussionStore.createStatus({ name: "已完成", sortOrder: 3 }, admin);
      discussionStore.createThread({
        content: "這是本機 POC 的示範討論，可用來驗證回覆、狀態、附件、搜尋與書籤功能。",
        spaceId: implementation.id,
        statusId: openStatus.id,
        title: "歡迎使用 Koino Harbor",
      }, member);
      void company;
    }
  }

  async function accessibleSpaceIds(user) {
    return (await spaceStore.listSpaces(user)).map((space) => space.id);
  }

  async function markBookmarkedThreads(threads, user, allowedSpaceIds) {
    const bookmarkedIds = new Set((await discussionStore.listBookmarks(user.id, allowedSpaceIds)).map((thread) => thread.id));
    return threads.map((thread) => ({ ...thread, bookmarked: bookmarkedIds.has(thread.id) }));
  }

  async function withAuthorDisplayNames(messages) {
    const authors = await Promise.all(messages.map((message) => authService.getUser(message.authorId)));
    return messages.map((message, index) => ({
      ...message,
      authorDisplayName: authors[index]?.displayName ?? "Unknown user",
    }));
  }

  return http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");
      const sessionToken = readSessionCookie(request.headers.cookie);
      const publicApiPaths = new Set([
        "/api/config",
        "/api/health",
        "/api/auth/firebase-session",
        "/api/auth/login",
      ]);
      const needsAuthentication = requestUrl.pathname.startsWith("/api/")
        && !publicApiPaths.has(requestUrl.pathname)
        && requestUrl.pathname !== "/api/auth/logout";
      request.authenticatedUser = needsAuthentication
        ? await authService.verifySession(sessionToken)
        : null;

      if (request.method === "GET" && requestUrl.pathname === "/api/health") {
        sendJson(response, 200, {
          app: config.appName,
          authProvider,
          environment: config.environment,
          firebaseConfigured: Boolean(config.firebaseProjectId),
          status: "ok",
        });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/auth/login") {
        const body = await readJsonBody(request);

        if (typeof body.email !== "string" || typeof body.password !== "string") {
          sendJson(response, 400, {
            error: "invalid_request",
            message: "請輸入 Email 與密碼。",
          });
          return;
        }

        if (authService.provider !== "development") {
          sendJson(response, 400, {
            error: "firebase_login_required",
            message: "此環境必須使用 Firebase ID Token 登入。",
          });
          return;
        }

        const user = await authService.authenticate(body.email, body.password);

        if (!user) {
          sendJson(response, 401, {
            error: "invalid_credentials",
            message: "Email 或密碼不正確。",
          });
          return;
        }

        const token = await authService.createSession(user);
        response.setHeader("Set-Cookie", createSessionCookie(token, secureCookies));
        sendJson(response, 200, { user });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/auth/firebase-session") {
        if (authService.provider !== "firebase") {
          sendJson(response, 400, { error: "invalid_provider", message: "目前未啟用 Firebase 登入。" });
          return;
        }
        const body = await readJsonBody(request);
        if (typeof body.idToken !== "string" || !body.idToken) {
          sendJson(response, 400, { error: "invalid_request", message: "缺少 Firebase ID Token。" });
          return;
        }
        const session = await authService.exchangeIdToken(body.idToken);
        if (!session) {
          sendJson(response, 403, { error: "inactive_user", message: "帳號不存在或已停用。" });
          return;
        }
        response.setHeader("Set-Cookie", createSessionCookie(session.token, secureCookies));
        sendJson(response, 200, { user: session.user });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/config") {
        sendJson(response, 200, {
          appName: config.appName,
          authProvider,
          firebase: authProvider === "firebase" ? {
            apiKey: config.firebaseApiKey,
            appId: config.firebaseAppId,
            authDomain: config.firebaseAuthDomain,
            messagingSenderId: config.firebaseMessagingSenderId,
            projectId: config.firebaseProjectId,
            storageBucket: config.firebaseStorageBucket,
          } : null,
        });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/auth/logout") {
        await authService.revokeSession(sessionToken);
        response.setHeader("Set-Cookie", clearSessionCookie(secureCookies));
        sendJson(response, 200, { status: "signed_out" });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/auth/me") {
        const user = requireUser(request, response, authService);

        if (!user) {
          return;
        }

        sendJson(response, 200, { user });
        return;
      }

      if (request.method === "PATCH" && requestUrl.pathname === "/api/auth/me") {
        const currentUser = requireUser(request, response, authService);

        if (!currentUser) {
          return;
        }

        const body = await readJsonBody(request);
        const allowedFields = new Set(["displayName", "password"]);

        if (!body || Array.isArray(body) || typeof body !== "object"
          || Object.keys(body).some((key) => !allowedFields.has(key))
          || (body.displayName === undefined && body.password === undefined)) {
          sendJson(response, 400, {
            error: "invalid_profile_update",
            message: "只能修改個人名稱與密碼。",
          });
          return;
        }

        const updatedUser = await authService.updateUser(currentUser.id, body, currentUser.id);
        sendJson(response, 200, { user: updatedUser });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/users") {
        const user = requireUser(request, response, authService, "admin");

        if (!user) {
          return;
        }

        sendJson(response, 200, { users: await authService.listUsers() });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/users") {
        const currentUser = requireUser(request, response, authService, "admin");

        if (!currentUser) {
          return;
        }

        const createdUser = await authService.createUser(await readJsonBody(request), currentUser.id);
        sendJson(response, 201, { user: createdUser });
        return;
      }

      const userRouteMatch = requestUrl.pathname.match(/^\/api\/users\/([^/]+)$/);

      if (request.method === "PATCH" && userRouteMatch) {
        const currentUser = requireUser(request, response, authService, "admin");

        if (!currentUser) {
          return;
        }

        const targetUserId = decodeURIComponent(userRouteMatch[1]);
        const changes = await readJsonBody(request);

        if (targetUserId === currentUser.id && (changes.active === false || (changes.role && changes.role !== "admin"))) {
          sendJson(response, 409, {
            error: "self_lockout",
            message: "不可停用自己的帳號或移除自己的管理員角色。",
          });
          return;
        }

        const updatedUser = await authService.updateUser(targetUserId, changes, currentUser.id);

        if (!updatedUser) {
          sendJson(response, 404, {
            error: "user_not_found",
            message: "找不到指定的使用者。",
          });
          return;
        }

        sendJson(response, 200, { user: updatedUser });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/spaces") {
        const currentUser = requireUser(request, response, authService);

        if (!currentUser) {
          return;
        }

        sendJson(response, 200, { spaces: await spaceStore.listSpaces(currentUser) });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/spaces") {
        const currentUser = requireUser(request, response, authService, "admin");

        if (!currentUser) {
          return;
        }

        const space = await spaceStore.createSpace(await readJsonBody(request), currentUser);
        sendJson(response, 201, { space });
        return;
      }

      const spaceRouteMatch = requestUrl.pathname.match(/^\/api\/spaces\/([^/]+)$/);

      if (request.method === "PATCH" && spaceRouteMatch) {
        const currentUser = requireUser(request, response, authService, "admin");

        if (!currentUser) {
          return;
        }

        const space = await spaceStore.updateSpace(
          decodeURIComponent(spaceRouteMatch[1]),
          await readJsonBody(request),
          currentUser,
        );

        if (!space) {
          sendJson(response, 404, {
            error: "space_not_found",
            message: "找不到指定的工作區。",
          });
          return;
        }

        sendJson(response, 200, { space });
        return;
      }

      const spaceMembersRouteMatch = requestUrl.pathname.match(/^\/api\/spaces\/([^/]+)\/members$/);

      if (request.method === "GET" && spaceMembersRouteMatch) {
        const currentUser = requireUser(request, response, authService, "admin");

        if (!currentUser) {
          return;
        }

        const members = await spaceStore.listMembers(decodeURIComponent(spaceMembersRouteMatch[1]));

        if (!members) {
          sendJson(response, 404, {
            error: "space_not_found",
            message: "找不到指定的工作區。",
          });
          return;
        }

        sendJson(response, 200, {
          members: await Promise.all(members.map(async (membership) => ({
            ...membership,
            user: await authService.getUser(membership.userId),
          }))),
        });
        return;
      }

      if (request.method === "POST" && spaceMembersRouteMatch) {
        const currentUser = requireUser(request, response, authService, "admin");

        if (!currentUser) {
          return;
        }

        const body = await readJsonBody(request);
        const member = typeof body.userId === "string" ? await authService.getUser(body.userId) : null;

        if (!member) {
          sendJson(response, 404, {
            error: "user_not_found",
            message: "找不到指定的使用者。",
          });
          return;
        }

        const membership = await spaceStore.addMember(
          decodeURIComponent(spaceMembersRouteMatch[1]),
          member,
          body.role,
          currentUser,
        );

        if (!membership) {
          sendJson(response, 404, {
            error: "space_not_found",
            message: "找不到指定的工作區。",
          });
          return;
        }

        sendJson(response, 201, { membership });
        return;
      }

      const memberRouteMatch = requestUrl.pathname.match(/^\/api\/spaces\/([^/]+)\/members\/([^/]+)$/);

      if (request.method === "DELETE" && memberRouteMatch) {
        const currentUser = requireUser(request, response, authService, "admin");

        if (!currentUser) {
          return;
        }

        const removed = await spaceStore.removeMember(
          decodeURIComponent(memberRouteMatch[1]),
          decodeURIComponent(memberRouteMatch[2]),
        );

        if (!removed) {
          sendJson(response, 404, {
            error: "membership_not_found",
            message: "找不到指定的工作區成員。",
          });
          return;
        }

        sendJson(response, 200, { status: "removed" });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/thread-statuses") {
        const currentUser = requireUser(request, response, authService);
        if (!currentUser) return;
        sendJson(response, 200, {
          statuses: await discussionStore.listStatuses({ includeInactive: currentUser.role === "admin" }),
        });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/thread-statuses") {
        const currentUser = requireUser(request, response, authService, "admin");
        if (!currentUser) return;
        const status = await discussionStore.createStatus(await readJsonBody(request), currentUser);
        sendJson(response, 201, { status });
        return;
      }

      const statusRouteMatch = requestUrl.pathname.match(/^\/api\/thread-statuses\/([^/]+)$/);
      if (request.method === "PATCH" && statusRouteMatch) {
        const currentUser = requireUser(request, response, authService, "admin");
        if (!currentUser) return;
        const status = await discussionStore.updateStatus(
          decodeURIComponent(statusRouteMatch[1]),
          await readJsonBody(request),
          currentUser,
        );
        if (!status) {
          sendJson(response, 404, { error: "status_not_found", message: "找不到指定的討論狀態。" });
          return;
        }
        sendJson(response, 200, { status });
        return;
      }

      if (request.method === "DELETE" && statusRouteMatch) {
        const currentUser = requireUser(request, response, authService, "admin");
        if (!currentUser) return;
        const deletedStatus = await discussionStore.deleteStatus(decodeURIComponent(statusRouteMatch[1]));
        if (!deletedStatus) {
          sendJson(response, 404, { error: "status_not_found", message: "找不到指定的討論狀態。" });
          return;
        }
        sendJson(response, 200, { status: "deleted" });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/threads") {
        const currentUser = requireUser(request, response, authService);
        if (!currentUser) return;
        const requestedSpaceId = requestUrl.searchParams.get("spaceId");
        const allowedSpaceIds = await accessibleSpaceIds(currentUser);
        if (requestedSpaceId && !allowedSpaceIds.includes(requestedSpaceId)) {
          sendJson(response, 403, { error: "forbidden", message: "沒有存取此工作區的權限。" });
          return;
        }
        sendJson(response, 200, {
          threads: await withAuthorDisplayNames(await markBookmarkedThreads(
            await discussionStore.listThreads(requestedSpaceId ? [requestedSpaceId] : allowedSpaceIds),
            currentUser,
            allowedSpaceIds,
          )),
        });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/threads") {
        const currentUser = requireUser(request, response, authService);
        if (!currentUser) return;
        const body = await readJsonBody(request);
        if (!await spaceStore.canAccess(body.spaceId, currentUser)) {
          sendJson(response, 403, { error: "forbidden", message: "沒有存取此工作區的權限。" });
          return;
        }
        const thread = await discussionStore.createThread(body, currentUser);
        sendJson(response, 201, { thread });
        return;
      }

      const threadRouteMatch = requestUrl.pathname.match(/^\/api\/threads\/([^/]+)$/);
      if (request.method === "GET" && threadRouteMatch) {
        const currentUser = requireUser(request, response, authService);
        if (!currentUser) return;
        const thread = await discussionStore.getThread(decodeURIComponent(threadRouteMatch[1]));
        if (!thread) {
          sendJson(response, 404, { error: "thread_not_found", message: "找不到指定的討論串。" });
          return;
        }
        if (!await spaceStore.canAccess(thread.spaceId, currentUser)) {
          sendJson(response, 403, { error: "forbidden", message: "沒有存取此討論串的權限。" });
          return;
        }
        sendJson(response, 200, {
          replies: await withAuthorDisplayNames(await discussionStore.listReplies(thread.id)),
          thread: (await withAuthorDisplayNames([thread]))[0],
        });
        return;
      }

      if (request.method === "PATCH" && threadRouteMatch) {
        const currentUser = requireUser(request, response, authService);
        if (!currentUser) return;
        const threadId = decodeURIComponent(threadRouteMatch[1]);
        const existingThread = await discussionStore.getThread(threadId);
        if (!existingThread) {
          sendJson(response, 404, { error: "thread_not_found", message: "找不到指定的討論串。" });
          return;
        }
        if (!await spaceStore.canAccess(existingThread.spaceId, currentUser)) {
          sendJson(response, 403, { error: "forbidden", message: "沒有存取此討論串的權限。" });
          return;
        }
        const thread = await discussionStore.updateThread(
          threadId,
          await readJsonBody(request),
          currentUser,
          currentUser.role === "admin",
        );
        sendJson(response, 200, { thread });
        return;
      }

      const repliesRouteMatch = requestUrl.pathname.match(/^\/api\/threads\/([^/]+)\/replies$/);
      if (request.method === "POST" && repliesRouteMatch) {
        const currentUser = requireUser(request, response, authService);
        if (!currentUser) return;
        const threadId = decodeURIComponent(repliesRouteMatch[1]);
        const thread = await discussionStore.getThread(threadId);
        if (!thread) {
          sendJson(response, 404, { error: "thread_not_found", message: "找不到指定的討論串。" });
          return;
        }
        if (!await spaceStore.canAccess(thread.spaceId, currentUser)) {
          sendJson(response, 403, { error: "forbidden", message: "沒有存取此討論串的權限。" });
          return;
        }
        const reply = await discussionStore.createReply(threadId, await readJsonBody(request), currentUser);
        sendJson(response, 201, { reply });
        return;
      }

      const replyRouteMatch = requestUrl.pathname.match(/^\/api\/threads\/([^/]+)\/replies\/([^/]+)$/);
      if (request.method === "PATCH" && replyRouteMatch) {
        const currentUser = requireUser(request, response, authService);
        if (!currentUser) return;
        const threadId = decodeURIComponent(replyRouteMatch[1]);
        const thread = await discussionStore.getThread(threadId);
        if (!thread) {
          sendJson(response, 404, { error: "thread_not_found", message: "找不到指定的討論串。" });
          return;
        }
        if (!await spaceStore.canAccess(thread.spaceId, currentUser)) {
          sendJson(response, 403, { error: "forbidden", message: "沒有存取此討論串的權限。" });
          return;
        }
        const body = await readJsonBody(request);
        const reply = await discussionStore.updateReply(
          threadId,
          decodeURIComponent(replyRouteMatch[2]),
          body,
          currentUser,
          false,
        );
        if (!reply) {
          sendJson(response, 404, { error: "reply_not_found", message: "找不到指定的回覆。" });
          return;
        }
        sendJson(response, 200, { reply });
        return;
      }

      const bookmarkRouteMatch = requestUrl.pathname.match(/^\/api\/threads\/([^/]+)\/bookmark$/);
      if (request.method === "PUT" && bookmarkRouteMatch) {
        const currentUser = requireUser(request, response, authService);
        if (!currentUser) return;
        const threadId = decodeURIComponent(bookmarkRouteMatch[1]);
        const thread = await discussionStore.getThread(threadId);
        if (!thread) {
          sendJson(response, 404, { error: "thread_not_found", message: "找不到指定的討論串。" });
          return;
        }
        if (!await spaceStore.canAccess(thread.spaceId, currentUser)) {
          sendJson(response, 403, { error: "forbidden", message: "沒有存取此討論串的權限。" });
          return;
        }
        const body = await readJsonBody(request);
        if (typeof body.bookmarked !== "boolean") {
          sendJson(response, 400, { error: "invalid_request", message: "bookmarked 必須是布林值。" });
          return;
        }
        sendJson(response, 200, {
          bookmark: await discussionStore.setBookmark(currentUser.id, threadId, body.bookmarked),
        });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/bookmarks") {
        const currentUser = requireUser(request, response, authService);
        if (!currentUser) return;
        const allowedSpaceIds = await accessibleSpaceIds(currentUser);
        sendJson(response, 200, {
          threads: await withAuthorDisplayNames((await discussionStore.listBookmarks(currentUser.id, allowedSpaceIds))
            .map((thread) => ({ ...thread, bookmarked: true }))),
        });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/search") {
        const currentUser = requireUser(request, response, authService);
        if (!currentUser) return;
        const query = requestUrl.searchParams.get("q") ?? "";
        const allowedSpaceIds = await accessibleSpaceIds(currentUser);
        sendJson(response, 200, {
          query,
          threads: await withAuthorDisplayNames(await markBookmarkedThreads(await discussionStore.search(query, allowedSpaceIds), currentUser, allowedSpaceIds)),
        });
        return;
      }

      const attachmentsRouteMatch = requestUrl.pathname.match(/^\/api\/threads\/([^/]+)\/attachments$/);
      if (request.method === "GET" && attachmentsRouteMatch) {
        const currentUser = requireUser(request, response, authService);
        if (!currentUser) return;
        const threadId = decodeURIComponent(attachmentsRouteMatch[1]);
        const thread = await discussionStore.getThread(threadId);
        if (!thread) {
          sendJson(response, 404, { error: "thread_not_found", message: "找不到指定的討論串。" });
          return;
        }
        if (!await spaceStore.canAccess(thread.spaceId, currentUser)) {
          sendJson(response, 403, { error: "forbidden", message: "沒有存取附件的權限。" });
          return;
        }
        sendJson(response, 200, { attachments: await attachmentStore.listForThread(threadId) });
        return;
      }

      if (request.method === "POST" && attachmentsRouteMatch) {
        const currentUser = requireUser(request, response, authService);
        if (!currentUser) return;
        const threadId = decodeURIComponent(attachmentsRouteMatch[1]);
        const thread = await discussionStore.getThread(threadId);
        if (!thread) {
          sendJson(response, 404, { error: "thread_not_found", message: "找不到指定的討論串。" });
          return;
        }
        if (!await spaceStore.canAccess(thread.spaceId, currentUser)) {
          sendJson(response, 403, { error: "forbidden", message: "沒有上傳附件的權限。" });
          return;
        }
        const body = await readJsonBody(request, 28 * 1024 * 1024);
        const targetReply = body.replyId ? await discussionStore.getReply(threadId, body.replyId) : null;
        if (body.replyId && !targetReply) {
          sendJson(response, 404, { error: "reply_not_found", message: "找不到指定的回覆。" });
          return;
        }
        const messageAuthorId = targetReply?.authorId ?? thread.authorId;
        const canManageAttachment = targetReply
          ? currentUser.id === messageAuthorId
          : currentUser.role === "admin" || currentUser.id === messageAuthorId;
        if (!canManageAttachment) {
          sendJson(response, 403, { error: "forbidden", message: "只能替自己的訊息上傳附件。" });
          return;
        }
        const attachment = await attachmentStore.create({ ...body, spaceId: thread.spaceId, threadId }, currentUser);
        sendJson(response, 201, { attachment });
        return;
      }

      const attachmentRouteMatch = requestUrl.pathname.match(/^\/api\/attachments\/([^/]+)$/);
      if (request.method === "DELETE" && attachmentRouteMatch) {
        const currentUser = requireUser(request, response, authService);
        if (!currentUser) return;
        const attachmentId = decodeURIComponent(attachmentRouteMatch[1]);
        const attachment = await attachmentStore.getMetadata(attachmentId);
        if (!attachment) {
          sendJson(response, 404, { error: "attachment_not_found", message: "找不到指定的附件。" });
          return;
        }
        const thread = await discussionStore.getThread(attachment.threadId);
        if (!thread || !await spaceStore.canAccess(thread.spaceId, currentUser)) {
          sendJson(response, 403, { error: "forbidden", message: "沒有移除附件的權限。" });
          return;
        }
        const targetReply = attachment.replyId ? await discussionStore.getReply(thread.id, attachment.replyId) : null;
        const messageAuthorId = targetReply?.authorId ?? thread.authorId;
        const canManageAttachment = targetReply
          ? currentUser.id === messageAuthorId
          : currentUser.role === "admin" || currentUser.id === messageAuthorId;
        if (!canManageAttachment) {
          sendJson(response, 403, { error: "forbidden", message: "只能移除自己訊息的附件。" });
          return;
        }
        await attachmentStore.delete(attachmentId);
        sendJson(response, 200, { attachment, status: "deleted" });
        return;
      }

      if (request.method === "GET" && attachmentRouteMatch) {
        const currentUser = requireUser(request, response, authService);
        if (!currentUser) return;
        const attachmentId = decodeURIComponent(attachmentRouteMatch[1]);
        const attachment = await attachmentStore.getMetadata(attachmentId);
        if (!attachment) {
          sendJson(response, 404, { error: "attachment_not_found", message: "找不到指定的附件。" });
          return;
        }
        const thread = await discussionStore.getThread(attachment.threadId);
        if (!thread || !await spaceStore.canAccess(thread.spaceId, currentUser)) {
          sendJson(response, 403, { error: "forbidden", message: "沒有下載附件的權限。" });
          return;
        }
        const file = await attachmentStore.read(attachmentId);
        response.writeHead(200, {
          "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.metadata.fileName)}`,
          "Content-Length": file.content.length,
          "Content-Type": file.metadata.mimeType,
          "X-Content-Type-Options": "nosniff",
        });
        response.end(file.content);
        return;
      }

      if (
        request.method === "GET"
        && requestUrl.pathname === "/vendor/bootstrap.min.css"
        && await serveStaticFile(response, bootstrapDirectory, "/bootstrap.min.css")
      ) {
        return;
      }

      if (
        request.method === "GET"
        && requestUrl.pathname === "/vendor/bootstrap-icons.css"
        && await serveStaticFile(response, bootstrapIconsDirectory, "/bootstrap-icons.css")
      ) {
        return;
      }

      const bootstrapIconFontMatch = requestUrl.pathname.match(/^\/vendor\/fonts\/(bootstrap-icons\.woff2?)$/);
      if (
        request.method === "GET"
        && bootstrapIconFontMatch
        && await serveStaticFile(response, bootstrapIconsDirectory, `/fonts/${bootstrapIconFontMatch[1]}`)
      ) {
        return;
      }

      if (request.method === "GET" && await serveStaticFile(response, publicDirectory, requestUrl.pathname)) {
        return;
      }

      sendJson(response, 404, {
        error: "not_found",
        message: "找不到要求的資源。",
      });
    } catch (error) {
      console.error("Request failed", error);
      const statusCode = error.statusCode ?? 500;
      sendJson(response, statusCode, {
        error: statusCode === 500 ? "internal_server_error" : "invalid_request",
        message: statusCode === 500 ? "伺服器發生未預期的錯誤。" : error.message,
      });
    }
  });
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const config = loadConfig();
  const server = createApplicationServer({ config });

  server.listen(config.port, config.host, () => {
    console.log(`${config.appName} listening on http://${config.host}:${config.port}`);
  });
}

