import assert from "node:assert/strict";
import test from "node:test";

import { createApplicationServer } from "../src/server.js";

async function startSeededServer() {
  const server = createApplicationServer({
    config: {
      appName: "Koino Harbor Seed Test",
      developmentUsers: [
        { email: "admin@koino.local", password: "PocAdmin123!", role: "admin" },
        { email: "member@koino.local", password: "PocMember123!", role: "member" },
      ],
      environment: "test",
      firebaseProjectId: null,
      seedDevelopmentData: true,
      sessionSecret: "development-seed-test-secret",
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function login(baseUrl, email, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return response.headers.get("set-cookie")?.split(";")[0] ?? null;
}

test("development seed provides the requested workspace hierarchy, members, and discussions", async (context) => {
  const testServer = await startSeededServer();
  context.after(testServer.close);
  const expectedNames = ["專案", "專案P1", "專案P2", "部門", "部門D1", "部門D2"];
  const adminCookie = await login(testServer.baseUrl, "admin@koino.local", "PocAdmin123!");
  const memberCookie = await login(testServer.baseUrl, "member@koino.local", "PocMember123!");

  for (const cookie of [adminCookie, memberCookie]) {
    const response = await fetch(`${testServer.baseUrl}/api/spaces`, { headers: { Cookie: cookie } });
    const { spaces } = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(spaces.map((space) => space.name).sort(), expectedNames.sort());
    assert.equal(spaces.find((space) => space.name === "專案").membershipType, "direct");
    assert.equal(spaces.find((space) => space.name === "部門").membershipType, "direct");
    assert.equal(spaces.filter((space) => space.membershipType === "inherited").length, 4);
  }

  const spacesResponse = await fetch(`${testServer.baseUrl}/api/admin/spaces`, { headers: { Cookie: adminCookie } });
  const { spaces } = await spacesResponse.json();
  const threadsResponse = await fetch(`${testServer.baseUrl}/api/threads`, { headers: { Cookie: memberCookie } });
  const { threads } = await threadsResponse.json();

  assert.deepEqual(spaces.filter((space) => !space.parentId).map((space) => space.allowedRoles), [
    ["admin", "member"],
    ["admin", "member"],
  ]);
  assert.equal(threads.length, 6);
  assert.deepEqual(threads.map((thread) => thread.spaceId).sort(), spaces.map((space) => space.id).sort());
});
