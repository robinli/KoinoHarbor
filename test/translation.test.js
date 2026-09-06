import assert from "node:assert/strict";
import test from "node:test";

import {
  createCloudTasksTranslationQueue,
  createCloudTaskVerifier,
  createGoogleTranslator,
} from "../src/translation.js";

test("Google translator sends plain text fields to the opposite supported locale", async () => {
  const requests = [];
  const translator = createGoogleTranslator({
    translationLocation: "global",
    translationProjectId: "project-1",
  }, {
    client: {
      async translateText(request) {
        requests.push(request);
        return [{ translations: [{ translatedText: "Hello" }, { translatedText: "World" }] }];
      },
    },
  });

  const result = await translator.translateFields({
    sourceLocale: "zh-TW",
    values: { content: "世界", empty: "", title: "哈囉" },
  });

  assert.deepEqual(result, { content: "Hello", title: "World" });
  assert.deepEqual(requests[0], {
    contents: ["世界", "哈囉"],
    mimeType: "text/plain",
    parent: "projects/project-1/locations/global",
    sourceLanguageCode: "zh-TW",
    targetLanguageCode: "en",
  });
});

test("Cloud Tasks queue creates a deterministic OIDC-authenticated translation request", async () => {
  const requests = [];
  const client = {
    async createTask(request) { requests.push(request); },
    queuePath(project, location, queue) { return `${project}/${location}/${queue}`; },
    taskPath(project, location, queue, id) { return `${project}/${location}/${queue}/${id}`; },
  };
  const config = {
    cloudTasksAudience: "https://service.example/tasks",
    cloudTasksLocation: "asia-east1",
    cloudTasksProjectId: "project-1",
    cloudTasksQueue: "translations",
    cloudTasksServiceAccountEmail: "tasks@project-1.iam.gserviceaccount.com",
    cloudTasksTargetUrl: "https://service.example/internal/translation-tasks",
  };
  const queue = createCloudTasksTranslationQueue(config, { client });
  const job = { parentId: null, resourceId: "space-1", resourceType: "space", revision: 2 };

  await queue.enqueue(job);
  await queue.enqueue(job);

  assert.equal(requests.length, 2);
  assert.equal(requests[0].task.name, requests[1].task.name);
  assert.equal(requests[0].task.httpRequest.oidcToken.audience, config.cloudTasksAudience);
  assert.equal(requests[0].task.httpRequest.oidcToken.serviceAccountEmail, config.cloudTasksServiceAccountEmail);
  assert.deepEqual(JSON.parse(Buffer.from(requests[0].task.httpRequest.body).toString("utf8")), job);
});

test("Cloud Task verifier accepts only the configured verified service account", async () => {
  const verifier = createCloudTaskVerifier({
    cloudTasksAudience: "https://service.example/tasks",
    cloudTasksServiceAccountEmail: "tasks@example.test",
  }, {
    client: {
      async verifyIdToken({ audience, idToken }) {
        assert.equal(audience, "https://service.example/tasks");
        assert.equal(idToken, "valid-token");
        return { getPayload: () => ({ email: "tasks@example.test", email_verified: true }) };
      },
    },
  });

  assert.equal(await verifier.verify("Bearer valid-token"), true);
  assert.equal(await verifier.verify("Basic invalid-token"), false);
});
