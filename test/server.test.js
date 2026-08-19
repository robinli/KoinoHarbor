import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLocalAttachmentStore } from "../src/attachments.js";
import { createApplicationServer } from "../src/server.js";

async function startTestServer(options = {}) {
  const attachmentDirectory = await mkdtemp(path.join(os.tmpdir(), "koino-server-"));
  const server = createApplicationServer({
    attachmentStore: createLocalAttachmentStore({ directory: attachmentDirectory }),
    ...options,
    config: {
      appName: "Koino Harbor Test",
      developmentUsers: [
        { email: "admin@example.test", password: "CorrectPassword!", role: "admin" },
        { email: "member@example.test", password: "MemberPassword!", role: "member" },
        { email: "guest@example.test", password: "GuestPassword!", role: "guest" },
      ],
      environment: "test",
      firebaseProjectId: null,
      sessionSecret: "test-session-secret",
      ...options.config,
    },
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      await rm(attachmentDirectory, { force: true, recursive: true });
    },
  };
}

async function login(baseUrl, email, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  return {
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? null,
    payload: await response.json(),
    response,
  };
}

test("GET /api/health reports service health", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);

  const response = await fetch(`${testServer.baseUrl}/api/health`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    app: "Koino Harbor Test",
    authProvider: "development",
    environment: "test",
    firebaseConfigured: false,
    status: "ok",
  });
});

test("login creates a session that can be restored and cleared", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);

  const loginResponse = await fetch(`${testServer.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@example.test",
      password: "CorrectPassword!",
    }),
  });
  const sessionCookie = loginResponse.headers.get("set-cookie").split(";")[0];
  const loginPayload = await loginResponse.json();

  assert.equal(loginResponse.status, 200);
  assert.equal(loginPayload.user.role, "admin");

  const meResponse = await fetch(`${testServer.baseUrl}/api/auth/me`, {
    headers: { Cookie: sessionCookie },
  });
  const mePayload = await meResponse.json();

  assert.equal(meResponse.status, 200);
  assert.equal(mePayload.user.email, "admin@example.test");

  const logoutResponse = await fetch(`${testServer.baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: sessionCookie },
  });

  assert.equal(logoutResponse.status, 200);
  assert.match(logoutResponse.headers.get("set-cookie"), /Max-Age=0/);
});

test("signed-in users can update only their own display name and password", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);
  const memberLogin = await login(testServer.baseUrl, "member@example.test", "MemberPassword!");

  const updateResponse = await fetch(`${testServer.baseUrl}/api/auth/me`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: memberLogin.cookie,
    },
    body: JSON.stringify({ displayName: "Updated Member", password: "NewMemberPassword!" }),
  });
  const updatePayload = await updateResponse.json();

  assert.equal(updateResponse.status, 200);
  assert.equal(updatePayload.user.displayName, "Updated Member");
  assert.equal(updatePayload.user.role, "member");

  const rejectedRoleResponse = await fetch(`${testServer.baseUrl}/api/auth/me`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: memberLogin.cookie,
    },
    body: JSON.stringify({ role: "admin" }),
  });
  assert.equal(rejectedRoleResponse.status, 400);

  const oldPasswordLogin = await login(testServer.baseUrl, "member@example.test", "MemberPassword!");
  const newPasswordLogin = await login(testServer.baseUrl, "member@example.test", "NewMemberPassword!");
  assert.equal(oldPasswordLogin.response.status, 401);
  assert.equal(newPasswordLogin.response.status, 200);
});

test("login rejects invalid credentials", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);

  const response = await fetch(`${testServer.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@example.test",
      password: "wrong",
    }),
  });

  assert.equal(response.status, 401);
});

test("Firebase ID token endpoint exchanges a verified session cookie", async (context) => {
  const firebaseUser = { active: true, displayName: "Cloud User", email: "cloud@example.test", id: "cloud-1", role: "member" };
  const testServer = await startTestServer({
    authService: {
      provider: "firebase",
      async exchangeIdToken(token) {
        assert.equal(token, "verified-id-token");
        return { token: "firebase-session-cookie", user: firebaseUser };
      },
      async verifySession() { return null; },
    },
    config: { authProvider: "firebase" },
  });
  context.after(testServer.close);

  const response = await fetch(`${testServer.baseUrl}/api/auth/firebase-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: "verified-id-token" }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.user.email, firebaseUser.email);
  assert.match(response.headers.get("set-cookie"), /koino_session=firebase-session-cookie/);
});

test("Firebase client token endpoint requires a session and returns a custom token", async (context) => {
  const firebaseUser = { active: true, displayName: "Cloud User", email: "cloud@example.test", id: "cloud-1", role: "member" };
  const testServer = await startTestServer({
    authService: {
      provider: "firebase",
      async createClientToken(user) {
        assert.equal(user.id, firebaseUser.id);
        return "firebase-custom-token";
      },
      async verifySession(token) {
        return token === "valid-session" ? firebaseUser : null;
      },
    },
    config: { authProvider: "firebase" },
  });
  context.after(testServer.close);

  const unauthenticated = await fetch(`${testServer.baseUrl}/api/auth/firebase-client-token`, { method: "POST" });
  assert.equal(unauthenticated.status, 401);
  const response = await fetch(`${testServer.baseUrl}/api/auth/firebase-client-token`, {
    method: "POST",
    headers: { Cookie: "koino_session=valid-session" },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { token: "firebase-custom-token" });
});

test("admin can list users and update another account", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);
  const adminLogin = await login(
    testServer.baseUrl,
    "admin@example.test",
    "CorrectPassword!",
  );

  const listResponse = await fetch(`${testServer.baseUrl}/api/users`, {
    headers: { Cookie: adminLogin.cookie },
  });
  const listPayload = await listResponse.json();
  const member = listPayload.users.find((user) => user.email === "member@example.test");

  assert.equal(listResponse.status, 200);
  assert.equal(listPayload.users.length, 3);
  assert.ok(member);

  const updateResponse = await fetch(`${testServer.baseUrl}/api/users/${member.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminLogin.cookie,
    },
    body: JSON.stringify({
      active: false,
      displayName: "Disabled Member",
      role: "guest",
    }),
  });
  const updatePayload = await updateResponse.json();

  assert.equal(updateResponse.status, 200);
  assert.equal(updatePayload.user.active, false);
  assert.equal(updatePayload.user.displayName, "Disabled Member");
  assert.equal(updatePayload.user.role, "guest");

  const disabledLogin = await login(
    testServer.baseUrl,
    "member@example.test",
    "MemberPassword!",
  );
  assert.equal(disabledLogin.response.status, 401);
});

test("admin can create a user and change the user's name and password", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);
  const adminLogin = await login(testServer.baseUrl, "admin@example.test", "CorrectPassword!");

  const createResponse = await fetch(`${testServer.baseUrl}/api/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminLogin.cookie,
    },
    body: JSON.stringify({
      displayName: "New Member",
      email: "new.member@example.test",
      password: "InitialPassword!",
      role: "member",
    }),
  });
  const createPayload = await createResponse.json();

  assert.equal(createResponse.status, 201);
  assert.equal(createPayload.user.displayName, "New Member");
  assert.equal((await login(testServer.baseUrl, "new.member@example.test", "InitialPassword!")).response.status, 200);

  const updateResponse = await fetch(`${testServer.baseUrl}/api/users/${createPayload.user.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminLogin.cookie,
    },
    body: JSON.stringify({ displayName: "Renamed Member", password: "ChangedPassword!" }),
  });
  const updatePayload = await updateResponse.json();

  assert.equal(updateResponse.status, 200);
  assert.equal(updatePayload.user.displayName, "Renamed Member");
  assert.equal((await login(testServer.baseUrl, "new.member@example.test", "InitialPassword!")).response.status, 401);
  assert.equal((await login(testServer.baseUrl, "new.member@example.test", "ChangedPassword!")).response.status, 200);
});

test("member cannot access user administration", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);
  const memberLogin = await login(
    testServer.baseUrl,
    "member@example.test",
    "MemberPassword!",
  );

  const response = await fetch(`${testServer.baseUrl}/api/users`, {
    headers: { Cookie: memberLogin.cookie },
  });

  assert.equal(response.status, 403);
});

test("admin cannot remove their own access", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);
  const adminLogin = await login(
    testServer.baseUrl,
    "admin@example.test",
    "CorrectPassword!",
  );

  const response = await fetch(`${testServer.baseUrl}/api/users/${adminLogin.payload.user.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminLogin.cookie,
    },
    body: JSON.stringify({ active: false }),
  });

  assert.equal(response.status, 409);
});

test("admin can create and update spaces", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);
  const adminLogin = await login(
    testServer.baseUrl,
    "admin@example.test",
    "CorrectPassword!",
  );

  const createResponse = await fetch(`${testServer.baseUrl}/api/spaces`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminLogin.cookie,
    },
    body: JSON.stringify({
      description: "財務工作區討論",
      name: "財務部",
      sortOrder: 12,
    }),
  });
  const createPayload = await createResponse.json();

  assert.equal(createResponse.status, 201);
  assert.equal(createPayload.space.parentId, null);
  assert.equal(createPayload.space.accessMode, "inherited");
  assert.equal(createPayload.space.sortOrder, 12);

  const updateResponse = await fetch(`${testServer.baseUrl}/api/spaces/${createPayload.space.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminLogin.cookie,
    },
    body: JSON.stringify({ archived: true, name: "財務與會計", sortOrder: 3 }),
  });
  const updatePayload = await updateResponse.json();

  assert.equal(updateResponse.status, 200);
  assert.equal(updatePayload.space.archived, true);
  assert.equal(updatePayload.space.name, "財務與會計");
  assert.equal(updatePayload.space.sortOrder, 3);
});

test("spaces sort each hierarchy level by sortOrder then name", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);
  const adminLogin = await login(testServer.baseUrl, "admin@example.test", "CorrectPassword!");

  async function createSpace(body) {
    const response = await fetch(`${testServer.baseUrl}/api/spaces`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie }, body: JSON.stringify(body),
    });
    return (await response.json()).space;
  }

  const laterParent = await createSpace({ name: "Zeta", sortOrder: 1 });
  const firstParent = await createSpace({ name: "Alpha", sortOrder: 1 });
  await createSpace({ name: "Child Z", parentId: firstParent.id, sortOrder: 1 });
  await createSpace({ name: "Child A", parentId: firstParent.id, sortOrder: 1 });
  const earlierParent = await createSpace({ name: "Later by name", sortOrder: 0 });

  const response = await fetch(`${testServer.baseUrl}/api/spaces`, { headers: { Cookie: adminLogin.cookie } });
  const { spaces } = await response.json();

  assert.deepEqual(spaces.map((space) => space.name), ["Later by name", "Alpha", "Zeta", "Child A", "Child Z"]);
});

test("workspace hierarchy inherits access and restricts child access when requested", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);
  const adminLogin = await login(testServer.baseUrl, "admin@example.test", "CorrectPassword!");
  const memberLogin = await login(testServer.baseUrl, "member@example.test", "MemberPassword!");
  const users = await (await fetch(`${testServer.baseUrl}/api/users`, { headers: { Cookie: adminLogin.cookie } })).json();
  const member = users.users.find((user) => user.role === "member");

  async function createSpace(body) {
    const response = await fetch(`${testServer.baseUrl}/api/spaces`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie }, body: JSON.stringify(body),
    });
    return { response, payload: await response.json() };
  }

  const { payload: parentPayload } = await createSpace({ name: "產品群組" });
  const parent = parentPayload.space;
  await fetch(`${testServer.baseUrl}/api/spaces/${parent.id}/members`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
    body: JSON.stringify({ role: "member", userId: member.id }),
  });
  const { payload: inheritedPayload } = await createSpace({ name: "新版網站", parentId: parent.id });
  const { payload: restrictedPayload } = await createSpace({ name: "薪資整合", parentId: parent.id, accessMode: "restricted" });

  const accessible = await (await fetch(`${testServer.baseUrl}/api/spaces`, { headers: { Cookie: memberLogin.cookie } })).json();
  assert.deepEqual(accessible.spaces.map((space) => space.id), [parent.id, inheritedPayload.space.id]);
  assert.equal((await fetch(`${testServer.baseUrl}/api/threads?spaceId=${inheritedPayload.space.id}`, { headers: { Cookie: memberLogin.cookie } })).status, 200);
  assert.equal((await fetch(`${testServer.baseUrl}/api/threads?spaceId=${restrictedPayload.space.id}`, { headers: { Cookie: memberLogin.cookie } })).status, 403);

  const nested = await createSpace({ name: "不允許第三層", parentId: inheritedPayload.space.id });
  assert.equal(nested.response.status, 400);
  const move = await fetch(`${testServer.baseUrl}/api/spaces/${parent.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
    body: JSON.stringify({ parentId: inheritedPayload.space.id }),
  });
  assert.equal(move.status, 400);
});

test("admin can add and remove a Space member", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);
  const adminLogin = await login(
    testServer.baseUrl,
    "admin@example.test",
    "CorrectPassword!",
  );
  const usersResponse = await fetch(`${testServer.baseUrl}/api/users`, {
    headers: { Cookie: adminLogin.cookie },
  });
  const usersPayload = await usersResponse.json();
  const guest = usersPayload.users.find((user) => user.role === "guest");
  const createResponse = await fetch(`${testServer.baseUrl}/api/spaces`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminLogin.cookie,
    },
    body: JSON.stringify({ name: "客戶 A 專案" }),
  });
  const { space } = await createResponse.json();

  const addResponse = await fetch(`${testServer.baseUrl}/api/spaces/${space.id}/members`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminLogin.cookie,
    },
    body: JSON.stringify({ role: "guest", userId: guest.id }),
  });
  assert.equal(addResponse.status, 201);

  const guestLogin = await login(
    testServer.baseUrl,
    "guest@example.test",
    "GuestPassword!",
  );
  const guestSpacesResponse = await fetch(`${testServer.baseUrl}/api/spaces`, {
    headers: { Cookie: guestLogin.cookie },
  });
  const guestSpacesPayload = await guestSpacesResponse.json();

  assert.deepEqual(guestSpacesPayload.spaces.map((item) => item.id), [space.id]);

  const deleteResponse = await fetch(
    `${testServer.baseUrl}/api/spaces/${space.id}/members/${guest.id}`,
    {
      method: "DELETE",
      headers: { Cookie: adminLogin.cookie },
    },
  );
  assert.equal(deleteResponse.status, 200);
});

test("discussion status, thread, reply, bookmark and search API flow", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);
  const adminLogin = await login(testServer.baseUrl, "admin@example.test", "CorrectPassword!");
  const memberLogin = await login(testServer.baseUrl, "member@example.test", "MemberPassword!");

  const spaceResponse = await fetch(`${testServer.baseUrl}/api/spaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
    body: JSON.stringify({ name: "ERP 導入" }),
  });
  const { space } = await spaceResponse.json();
  const usersResponse = await fetch(`${testServer.baseUrl}/api/users`, {
    headers: { Cookie: adminLogin.cookie },
  });
  const usersPayload = await usersResponse.json();
  const member = usersPayload.users.find((user) => user.role === "member");
  const membershipResponse = await fetch(`${testServer.baseUrl}/api/spaces/${space.id}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
    body: JSON.stringify({ role: "member", userId: member.id }),
  });
  assert.equal(membershipResponse.status, 201);
  const statusResponse = await fetch(`${testServer.baseUrl}/api/thread-statuses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
    body: JSON.stringify({ name: "處理中", sortOrder: 1 }),
  });
  const { status } = await statusResponse.json();
  assert.equal(statusResponse.status, 201);

  const forbiddenStatusResponse = await fetch(`${testServer.baseUrl}/api/thread-statuses/${status.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: memberLogin.cookie },
    body: JSON.stringify({ name: "不應成功" }),
  });
  assert.equal(forbiddenStatusResponse.status, 403);

  const threadResponse = await fetch(`${testServer.baseUrl}/api/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: memberLogin.cookie },
    body: JSON.stringify({
      content: "ERP 報價資料異常",
      spaceId: space.id,
      statusId: status.id,
      title: "報價問題",
    }),
  });
  const { thread } = await threadResponse.json();
  assert.equal(threadResponse.status, 201);

  const authorEditResponse = await fetch(`${testServer.baseUrl}/api/threads/${thread.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: memberLogin.cookie },
    body: JSON.stringify({ title: "報價異常追蹤", content: "ERP 報價資料格式異常", statusId: status.id }),
  });
  const authorEditPayload = await authorEditResponse.json();
  assert.equal(authorEditResponse.status, 200);
  assert.equal(authorEditPayload.thread.title, "報價異常追蹤");
  assert.equal(authorEditPayload.thread.content, "ERP 報價資料格式異常");

  const replyResponse = await fetch(`${testServer.baseUrl}/api/threads/${thread.id}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: memberLogin.cookie },
    body: JSON.stringify({ content: "已補上重現步驟" }),
  });
  assert.equal(replyResponse.status, 201);
  const { reply } = await replyResponse.json();

  const nestedReplyResponse = await fetch(`${testServer.baseUrl}/api/threads/${thread.id}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
    body: JSON.stringify({ content: "已收到重現步驟", parentReplyId: reply.id }),
  });
  const nestedReplyPayload = await nestedReplyResponse.json();
  assert.equal(nestedReplyResponse.status, 201);
  assert.equal(nestedReplyPayload.reply.parentReplyId, reply.id);

  const adminCannotEditMemberReply = await fetch(`${testServer.baseUrl}/api/threads/${thread.id}/replies/${reply.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
    body: JSON.stringify({ content: "管理員不應修改此回覆" }),
  });
  assert.equal(adminCannotEditMemberReply.status, 403);

  const authorEditReply = await fetch(`${testServer.baseUrl}/api/threads/${thread.id}/replies/${reply.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: memberLogin.cookie },
    body: JSON.stringify({ content: "已補上完整重現步驟" }),
  });
  assert.equal(authorEditReply.status, 200);

  const bookmarkResponse = await fetch(`${testServer.baseUrl}/api/threads/${thread.id}/bookmark`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: memberLogin.cookie },
    body: JSON.stringify({ bookmarked: true }),
  });
  assert.equal(bookmarkResponse.status, 200);

  const searchResponse = await fetch(`${testServer.baseUrl}/api/search?q=${encodeURIComponent("重現步驟")}`, {
    headers: { Cookie: memberLogin.cookie },
  });
  const searchPayload = await searchResponse.json();
  assert.equal(searchPayload.threads[0].id, thread.id);

  const bookmarksResponse = await fetch(`${testServer.baseUrl}/api/bookmarks`, {
    headers: { Cookie: memberLogin.cookie },
  });
  const bookmarksPayload = await bookmarksResponse.json();
  assert.equal(bookmarksPayload.threads[0].id, thread.id);

  const pinResponse = await fetch(`${testServer.baseUrl}/api/threads/${thread.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
    body: JSON.stringify({ pinned: true }),
  });
  const pinPayload = await pinResponse.json();
  assert.equal(pinPayload.thread.pinned, true);

  const updateStatusResponse = await fetch(`${testServer.baseUrl}/api/thread-statuses/${status.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
    body: JSON.stringify({ name: "等待確認", sortOrder: 8 }),
  });
  const updateStatusPayload = await updateStatusResponse.json();
  assert.equal(updateStatusResponse.status, 200);
  assert.equal(updateStatusPayload.status.name, "等待確認");
  assert.equal(updateStatusPayload.status.sortOrder, 8);

  const updateThreadResponse = await fetch(`${testServer.baseUrl}/api/threads/${thread.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
    body: JSON.stringify({ title: "ERP 上線確認", content: "更新後的討論內容", statusId: status.id }),
  });
  const updateThreadPayload = await updateThreadResponse.json();
  assert.equal(updateThreadResponse.status, 200);
  assert.equal(updateThreadPayload.thread.title, "ERP 上線確認");
  assert.equal(updateThreadPayload.thread.content, "更新後的討論內容");
  assert.equal(updateThreadPayload.thread.statusId, status.id);

  const originalAttachment = Buffer.from("attachment API content", "utf8");
  const uploadResponse = await fetch(`${testServer.baseUrl}/api/threads/${thread.id}/attachments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: memberLogin.cookie },
    body: JSON.stringify({
      contentBase64: originalAttachment.toString("base64"),
      fileName: "驗收.pdf",
      mimeType: "application/pdf",
    }),
  });
  const uploadPayload = await uploadResponse.json();
  assert.equal(uploadResponse.status, 201);

  const downloadResponse = await fetch(`${testServer.baseUrl}/api/attachments/${uploadPayload.attachment.id}`, {
    headers: { Cookie: memberLogin.cookie },
  });
  assert.equal(downloadResponse.status, 200);
  assert.deepEqual(Buffer.from(await downloadResponse.arrayBuffer()), originalAttachment);
  assert.match(downloadResponse.headers.get("content-disposition"), /inline/);

  const replyAttachmentResponse = await fetch(`${testServer.baseUrl}/api/threads/${thread.id}/attachments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: memberLogin.cookie },
    body: JSON.stringify({
      contentBase64: originalAttachment.toString("base64"),
      fileName: "回覆附件.pdf",
      mimeType: "application/pdf",
      replyId: reply.id,
    }),
  });
  const replyAttachmentPayload = await replyAttachmentResponse.json();
  assert.equal(replyAttachmentResponse.status, 201);

  const adminCannotDeleteReplyAttachment = await fetch(`${testServer.baseUrl}/api/attachments/${replyAttachmentPayload.attachment.id}`, {
    method: "DELETE",
    headers: { Cookie: adminLogin.cookie },
  });
  assert.equal(adminCannotDeleteReplyAttachment.status, 403);

  const deleteReplyAttachmentResponse = await fetch(`${testServer.baseUrl}/api/attachments/${replyAttachmentPayload.attachment.id}`, {
    method: "DELETE",
    headers: { Cookie: memberLogin.cookie },
  });
  assert.equal(deleteReplyAttachmentResponse.status, 200);
  const deletedAttachmentDownload = await fetch(`${testServer.baseUrl}/api/attachments/${replyAttachmentPayload.attachment.id}`, {
    headers: { Cookie: memberLogin.cookie },
  });
  assert.equal(deletedAttachmentDownload.status, 404);
});

test("message reaction API aggregates users, toggles idempotently and enforces access", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);
  const adminLogin = await login(testServer.baseUrl, "admin@example.test", "CorrectPassword!");
  const memberLogin = await login(testServer.baseUrl, "member@example.test", "MemberPassword!");
  const guestLogin = await login(testServer.baseUrl, "guest@example.test", "GuestPassword!");
  const users = await (await fetch(`${testServer.baseUrl}/api/users`, { headers: { Cookie: adminLogin.cookie } })).json();
  const member = users.users.find((user) => user.email === "member@example.test");
  const spaceResponse = await fetch(`${testServer.baseUrl}/api/spaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
    body: JSON.stringify({ name: "Reaction Space" }),
  });
  const { space } = await spaceResponse.json();
  await fetch(`${testServer.baseUrl}/api/spaces/${space.id}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
    body: JSON.stringify({ role: "member", userId: member.id }),
  });
  const threadResponse = await fetch(`${testServer.baseUrl}/api/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: memberLogin.cookie },
    body: JSON.stringify({ content: "Reaction content", spaceId: space.id, title: "Reaction thread" }),
  });
  const { thread } = await threadResponse.json();
  assert.deepEqual(thread.reactions, []);
  const originalUpdatedAt = thread.updatedAt;
  const endpoint = `${testServer.baseUrl}/api/threads/${thread.id}/reactions`;
  const react = (cookie, body) => fetch(endpoint, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  const threadReaction = { emoji: "✅", messageId: thread.id, messageType: "thread", reacted: true };

  let response = await react(memberLogin.cookie, threadReaction);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reactions[0].count, 1);
  response = await react(memberLogin.cookie, threadReaction);
  assert.equal((await response.json()).reactions[0].count, 1);
  response = await react(adminLogin.cookie, threadReaction);
  const aggregate = (await response.json()).reactions[0];
  assert.equal(aggregate.count, 2);
  assert.equal(aggregate.reactedByCurrentUser, true);
  assert.deepEqual(aggregate.reactors.map((reactor) => reactor.displayName).sort(), ["admin", "member"]);

  const forbidden = await react(guestLogin.cookie, threadReaction);
  assert.equal(forbidden.status, 403);
  const invalid = await react(memberLogin.cookie, { ...threadReaction, emoji: "not-an-emoji" });
  assert.equal(invalid.status, 400);
  const afterThreadReactions = await (await fetch(`${testServer.baseUrl}/api/threads/${thread.id}`, {
    headers: { Cookie: adminLogin.cookie },
  })).json();
  assert.equal(afterThreadReactions.thread.updatedAt, originalUpdatedAt);

  const replyResponse = await fetch(`${testServer.baseUrl}/api/threads/${thread.id}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: memberLogin.cookie },
    body: JSON.stringify({ content: "Reply reaction target" }),
  });
  const { reply } = await replyResponse.json();
  response = await react(memberLogin.cookie, { emoji: "❤️", messageId: reply.id, messageType: "reply", reacted: true });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reactions[0].emoji, "❤️");

  const details = await (await fetch(`${testServer.baseUrl}/api/threads/${thread.id}`, {
    headers: { Cookie: adminLogin.cookie },
  })).json();
  assert.equal(details.thread.reactions[0].count, 2);
  assert.equal(details.replies[0].reactions[0].count, 1);

  response = await react(memberLogin.cookie, { ...threadReaction, reacted: false });
  assert.equal((await response.json()).reactions[0].count, 1);
  await fetch(`${testServer.baseUrl}/api/threads/${thread.id}/replies/${reply.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: memberLogin.cookie },
    body: JSON.stringify({ deleted: true }),
  });
  response = await react(memberLogin.cookie, { emoji: "✅", messageId: reply.id, messageType: "reply", reacted: true });
  assert.equal(response.status, 404);
});

test("unread messages notify effective workspace members and support read and unread state", async (context) => {
  const testServer = await startTestServer({
    config: {
      developmentUsers: [
        { email: "admin@example.test", password: "CorrectPassword!", role: "admin" },
        { email: "member@example.test", password: "MemberPassword!", role: "member" },
        { email: "guest@example.test", password: "GuestPassword!", role: "guest" },
        { active: false, email: "inactive@example.test", password: "InactivePassword!", role: "member" },
      ],
    },
  });
  context.after(testServer.close);
  const adminLogin = await login(testServer.baseUrl, "admin@example.test", "CorrectPassword!");
  const memberLogin = await login(testServer.baseUrl, "member@example.test", "MemberPassword!");
  const guestLogin = await login(testServer.baseUrl, "guest@example.test", "GuestPassword!");
  const usersResponse = await fetch(`${testServer.baseUrl}/api/users`, { headers: { Cookie: adminLogin.cookie } });
  const { users } = await usersResponse.json();
  const member = users.find((user) => user.email === "member@example.test");
  const guest = users.find((user) => user.email === "guest@example.test");
  const inactive = users.find((user) => user.email === "inactive@example.test");

  const parentResponse = await fetch(`${testServer.baseUrl}/api/spaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
    body: JSON.stringify({ name: "父工作區" }),
  });
  const { space: parent } = await parentResponse.json();
  const childResponse = await fetch(`${testServer.baseUrl}/api/spaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
    body: JSON.stringify({ name: "子工作區", parentId: parent.id }),
  });
  const { space: child } = await childResponse.json();
  for (const [spaceId, userId] of [[parent.id, member.id], [child.id, guest.id], [child.id, inactive.id]]) {
    const membershipResponse = await fetch(`${testServer.baseUrl}/api/spaces/${spaceId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
      body: JSON.stringify({ role: "member", userId }),
    });
    assert.equal(membershipResponse.status, 201);
  }

  const threadResponse = await fetch(`${testServer.baseUrl}/api/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: guestLogin.cookie },
    body: JSON.stringify({ content: "請檢視未讀提醒", spaceId: child.id, title: "未讀測試" }),
  });
  const { thread } = await threadResponse.json();
  assert.equal(threadResponse.status, 201);

  for (const loginResult of [adminLogin, memberLogin]) {
    const summaryResponse = await fetch(`${testServer.baseUrl}/api/unread-summary`, { headers: { Cookie: loginResult.cookie } });
    const summaryPayload = await summaryResponse.json();
    assert.equal(summaryPayload.unreadBySpace[child.id], 1);
    assert.deepEqual(summaryPayload.unreadMessages.map((message) => [message.messageType, message.messageId]), [["thread", thread.id]]);
  }
  const authorSummaryResponse = await fetch(`${testServer.baseUrl}/api/unread-summary`, { headers: { Cookie: guestLogin.cookie } });
  assert.deepEqual((await authorSummaryResponse.json()).unreadBySpace, {});
  const activateInactiveResponse = await fetch(`${testServer.baseUrl}/api/users/${inactive.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
    body: JSON.stringify({ active: true }),
  });
  assert.equal(activateInactiveResponse.status, 200);
  const inactiveLogin = await login(testServer.baseUrl, "inactive@example.test", "InactivePassword!");
  const inactiveSummary = await (await fetch(`${testServer.baseUrl}/api/unread-summary`, { headers: { Cookie: inactiveLogin.cookie } })).json();
  assert.deepEqual(inactiveSummary.unreadBySpace, {});

  const replyResponse = await fetch(`${testServer.baseUrl}/api/threads/${thread.id}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
    body: JSON.stringify({ content: "這是未讀回覆" }),
  });
  const { reply } = await replyResponse.json();
  assert.equal(replyResponse.status, 201);
  const memberReplySummary = await (await fetch(`${testServer.baseUrl}/api/unread-summary`, { headers: { Cookie: memberLogin.cookie } })).json();
  assert.equal(memberReplySummary.unreadBySpace[child.id], 2);
  const guestReplySummary = await (await fetch(`${testServer.baseUrl}/api/unread-summary`, { headers: { Cookie: guestLogin.cookie } })).json();
  assert.equal(guestReplySummary.unreadBySpace[child.id], 1);

  const readResponse = await fetch(`${testServer.baseUrl}/api/unread/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: memberLogin.cookie },
    body: JSON.stringify({ messages: [
      { messageId: thread.id, messageType: "thread", threadId: thread.id },
      { messageId: reply.id, messageType: "reply", threadId: thread.id },
    ] }),
  });
  assert.equal(readResponse.status, 200);
  const readSummary = await (await fetch(`${testServer.baseUrl}/api/unread-summary`, { headers: { Cookie: memberLogin.cookie } })).json();
  assert.deepEqual(readSummary.unreadBySpace, {});

  const unreadResponse = await fetch(`${testServer.baseUrl}/api/unread`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: memberLogin.cookie },
    body: JSON.stringify({ messageId: thread.id, messageType: "thread", threadId: thread.id }),
  });
  assert.equal(unreadResponse.status, 200);
  const unreadSummary = await (await fetch(`${testServer.baseUrl}/api/unread-summary`, { headers: { Cookie: memberLogin.cookie } })).json();
  assert.equal(unreadSummary.unreadBySpace[child.id], 1);
});

test("guest cannot access a thread outside explicit Space membership", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);
  const adminLogin = await login(testServer.baseUrl, "admin@example.test", "CorrectPassword!");
  const guestLogin = await login(testServer.baseUrl, "guest@example.test", "GuestPassword!");
  const spaceResponse = await fetch(`${testServer.baseUrl}/api/spaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
    body: JSON.stringify({ name: "未受邀專案" }),
  });
  const { space } = await spaceResponse.json();

  const createResponse = await fetch(`${testServer.baseUrl}/api/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: guestLogin.cookie },
    body: JSON.stringify({ content: "越權內容", spaceId: space.id, title: "越權測試" }),
  });
  assert.equal(createResponse.status, 403);

  const listResponse = await fetch(`${testServer.baseUrl}/api/threads?spaceId=${space.id}`, {
    headers: { Cookie: guestLogin.cookie },
  });
  assert.equal(listResponse.status, 403);
});

test("member also requires explicit Space membership", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);
  const adminLogin = await login(testServer.baseUrl, "admin@example.test", "CorrectPassword!");
  const memberLogin = await login(testServer.baseUrl, "member@example.test", "MemberPassword!");
  const spaceResponse = await fetch(`${testServer.baseUrl}/api/spaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
    body: JSON.stringify({ name: "限制工作區" }),
  });
  const { space } = await spaceResponse.json();

  const response = await fetch(`${testServer.baseUrl}/api/threads?spaceId=${space.id}`, {
    headers: { Cookie: memberLogin.cookie },
  });
  assert.equal(response.status, 403);
});

test("portal aggregate APIs return only explicitly accessible Spaces and threads", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);
  const adminLogin = await login(testServer.baseUrl, "admin@example.test", "CorrectPassword!");
  const memberLogin = await login(testServer.baseUrl, "member@example.test", "MemberPassword!");
  const guestLogin = await login(testServer.baseUrl, "guest@example.test", "GuestPassword!");

  const usersResponse = await fetch(`${testServer.baseUrl}/api/users`, { headers: { Cookie: adminLogin.cookie } });
  const usersPayload = await usersResponse.json();
  const member = usersPayload.users.find((user) => user.role === "member");

  async function createSpace(name) {
    const response = await fetch(`${testServer.baseUrl}/api/spaces`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
      body: JSON.stringify({ name }),
    });
    return (await response.json()).space;
  }

  const joinedSpace = await createSpace("已加入專案");
  const hiddenSpace = await createSpace("未加入專案");
  await fetch(`${testServer.baseUrl}/api/spaces/${joinedSpace.id}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
    body: JSON.stringify({ role: "member", userId: member.id }),
  });

  for (const [space, title] of [[joinedSpace, "可見討論"], [hiddenSpace, "不可見討論"]]) {
    const response = await fetch(`${testServer.baseUrl}/api/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
      body: JSON.stringify({ content: `${title}內容`, spaceId: space.id, title }),
    });
    assert.equal(response.status, 201);
  }

  const memberSpacesResponse = await fetch(`${testServer.baseUrl}/api/spaces`, { headers: { Cookie: memberLogin.cookie } });
  const memberSpacesPayload = await memberSpacesResponse.json();
  assert.deepEqual(memberSpacesPayload.spaces.map((space) => space.name), ["已加入專案"]);

  const memberThreadsResponse = await fetch(`${testServer.baseUrl}/api/threads`, { headers: { Cookie: memberLogin.cookie } });
  const memberThreadsPayload = await memberThreadsResponse.json();
  assert.deepEqual(memberThreadsPayload.threads.map((thread) => thread.title), ["可見討論"]);

  assert.equal(memberThreadsPayload.threads[0].authorDisplayName, "admin");

  const guestSpacesResponse = await fetch(`${testServer.baseUrl}/api/spaces`, { headers: { Cookie: guestLogin.cookie } });
  const guestSpacesPayload = await guestSpacesResponse.json();
  assert.deepEqual(guestSpacesPayload.spaces, []);

  const guestThreadsResponse = await fetch(`${testServer.baseUrl}/api/threads`, { headers: { Cookie: guestLogin.cookie } });
  const guestThreadsPayload = await guestThreadsResponse.json();
  assert.deepEqual(guestThreadsPayload.threads, []);
});

test("GET / serves the application shell", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);

  const response = await fetch(`${testServer.baseUrl}/`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(body, /Koino Harbor/);
  assert.match(body, /\/vendor\/bootstrap\.min\.css/);
  assert.match(body, /\/vendor\/bootstrap-icons\.css/);
  assert.match(body, /\/modern\.css/);
  assert.match(body, /\/favicon\.svg/);

  const bootstrapResponse = await fetch(`${testServer.baseUrl}/vendor/bootstrap.min.css`);
  assert.equal(bootstrapResponse.status, 200);
  assert.match(bootstrapResponse.headers.get("content-type"), /text\/css/);
  assert.match(await bootstrapResponse.text(), /Bootstrap\s+v5\.3\.8/);

  const bootstrapIconsResponse = await fetch(`${testServer.baseUrl}/vendor/bootstrap-icons.css`);
  assert.equal(bootstrapIconsResponse.status, 200);
  assert.match(bootstrapIconsResponse.headers.get("content-type"), /text\/css/);
  assert.match(await bootstrapIconsResponse.text(), /Bootstrap Icons v1\.13\.1/);

  const bootstrapIconsFontResponse = await fetch(`${testServer.baseUrl}/vendor/fonts/bootstrap-icons.woff2`);
  assert.equal(bootstrapIconsFontResponse.status, 200);
  assert.match(bootstrapIconsFontResponse.headers.get("content-type"), /font\/woff2/);

  const faviconResponse = await fetch(`${testServer.baseUrl}/favicon.svg`);
  assert.equal(faviconResponse.status, 200);
  assert.match(faviconResponse.headers.get("content-type"), /image\/svg\+xml/);
  assert.match(await faviconResponse.text(), /⚓/);

  const emojiPickerResponse = await fetch(`${testServer.baseUrl}/vendor/emoji-picker/picker.js`);
  assert.equal(emojiPickerResponse.status, 200);
  assert.match(emojiPickerResponse.headers.get("content-type"), /javascript/);
  assert.match(await emojiPickerResponse.text(), /class Picker/);

  const emojiDataResponse = await fetch(`${testServer.baseUrl}/vendor/emoji-data.json`);
  assert.equal(emojiDataResponse.status, 200);
  assert.match(emojiDataResponse.headers.get("content-type"), /application\/json/);
  assert.match(await emojiDataResponse.text(), /笑臉/);
  const emojiDataHeadResponse = await fetch(`${testServer.baseUrl}/vendor/emoji-data.json`, { method: "HEAD" });
  assert.equal(emojiDataHeadResponse.status, 200);

  const csp = response.headers.get("content-security-policy");
  assert.match(csp, /https:\/\/www\.gstatic\.com/);
  assert.match(csp, /https:\/\/firestore\.googleapis\.com/);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  assert.match(csp, /script-src 'self' https:\/\/www\.gstatic\.com/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
});

test("unknown paths return a JSON 404", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);

  const response = await fetch(`${testServer.baseUrl}/missing`);
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.error, "not_found");
});

