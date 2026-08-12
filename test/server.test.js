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
      description: "財務部門討論",
      name: "財務部",
      type: "department",
    }),
  });
  const createPayload = await createResponse.json();

  assert.equal(createResponse.status, 201);
  assert.equal(createPayload.space.type, "department");

  const updateResponse = await fetch(`${testServer.baseUrl}/api/spaces/${createPayload.space.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminLogin.cookie,
    },
    body: JSON.stringify({ archived: true, name: "財務與會計" }),
  });
  const updatePayload = await updateResponse.json();

  assert.equal(updateResponse.status, 200);
  assert.equal(updatePayload.space.archived, true);
  assert.equal(updatePayload.space.name, "財務與會計");
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
    body: JSON.stringify({ name: "客戶 A 專案", type: "project" }),
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
    body: JSON.stringify({ name: "ERP 導入", type: "project" }),
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
  assert.match(downloadResponse.headers.get("content-disposition"), /attachment/);
});

test("guest cannot access a thread outside explicit Space membership", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);
  const adminLogin = await login(testServer.baseUrl, "admin@example.test", "CorrectPassword!");
  const guestLogin = await login(testServer.baseUrl, "guest@example.test", "GuestPassword!");
  const spaceResponse = await fetch(`${testServer.baseUrl}/api/spaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
    body: JSON.stringify({ name: "未受邀專案", type: "project" }),
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
    body: JSON.stringify({ name: "限制部門", type: "department" }),
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
      body: JSON.stringify({ name, type: "project" }),
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
  assert.match(body, /\/modern\.css/);

  const bootstrapResponse = await fetch(`${testServer.baseUrl}/vendor/bootstrap.min.css`);
  assert.equal(bootstrapResponse.status, 200);
  assert.match(bootstrapResponse.headers.get("content-type"), /text\/css/);
  assert.match(await bootstrapResponse.text(), /Bootstrap\s+v5\.3\.8/);
});

test("unknown paths return a JSON 404", async (context) => {
  const testServer = await startTestServer();
  context.after(testServer.close);

  const response = await fetch(`${testServer.baseUrl}/missing`);
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.error, "not_found");
});

