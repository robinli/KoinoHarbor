import { createHash } from "node:crypto";

import { CloudTasksClient } from "@google-cloud/tasks";
import { v3 } from "@google-cloud/translate";
import { OAuth2Client } from "google-auth-library";

import { normalizeLocale, otherLocale } from "./localization.js";

export function createGoogleTranslator(config, dependencies = {}) {
  const client = dependencies.client ?? new v3.TranslationServiceClient();
  const projectId = config.translationProjectId ?? config.firebaseProjectId;
  const location = config.translationLocation ?? "global";
  if (!projectId) throw new Error("Google Cloud Translation 必須設定 TRANSLATION_PROJECT_ID 或 FIREBASE_PROJECT_ID。");

  return Object.freeze({
    async translateFields({ sourceLocale, values }) {
      const entries = Object.entries(values).filter(([, value]) => typeof value === "string" && value.length > 0);
      if (!entries.length) return {};
      const [response] = await client.translateText({
        contents: entries.map(([, value]) => value),
        mimeType: "text/plain",
        parent: `projects/${projectId}/locations/${location}`,
        sourceLanguageCode: normalizeLocale(sourceLocale),
        targetLanguageCode: otherLocale(sourceLocale),
      });
      if (!Array.isArray(response.translations) || response.translations.length !== entries.length) {
        throw new Error("Google Cloud Translation 回傳的翻譯數量不正確。");
      }
      return Object.fromEntries(entries.map(([fieldName], index) => [
        fieldName,
        response.translations[index]?.translatedText ?? "",
      ]));
    },
  });
}

function taskId(job, attempt = 0) {
  const digest = createHash("sha256")
    .update(`${job.resourceType}\0${job.resourceId}\0${job.parentId ?? ""}\0${job.revision}\0${attempt}`)
    .digest("hex");
  return `translation-${digest}`;
}

export function createCloudTasksTranslationQueue(config, dependencies = {}) {
  const client = dependencies.client ?? new CloudTasksClient();
  const projectId = config.cloudTasksProjectId ?? config.translationProjectId ?? config.firebaseProjectId;
  const location = config.cloudTasksLocation;
  const queue = config.cloudTasksQueue;
  const targetUrl = config.cloudTasksTargetUrl;
  const serviceAccountEmail = config.cloudTasksServiceAccountEmail;
  const audience = config.cloudTasksAudience ?? targetUrl;
  if (!projectId || !location || !queue || !targetUrl || !serviceAccountEmail) {
    throw new Error("Cloud Tasks 翻譯佇列設定不完整。");
  }

  return Object.freeze({
    async enqueue(job, attempt = 0) {
      const parent = client.queuePath(projectId, location, queue);
      const name = client.taskPath(projectId, location, queue, taskId(job, attempt));
      try {
        await client.createTask({
          parent,
          task: {
            name,
            httpRequest: {
              body: Buffer.from(JSON.stringify(job)),
              headers: { "Content-Type": "application/json" },
              httpMethod: "POST",
              oidcToken: {
                audience,
                serviceAccountEmail,
              },
              url: targetUrl,
            },
          },
        });
      } catch (error) {
        if (error?.code !== 6) throw error;
      }
      return { name };
    },
  });
}

export function createInlineTranslationQueue(processJob) {
  const pending = new Set();
  return Object.freeze({
    async enqueue(job) {
      const key = taskId(job);
      if (pending.has(key)) return { name: key };
      pending.add(key);
      setImmediate(async () => {
        try {
          await processJob(job, { retryCount: 0 });
        } catch (error) {
          console.error("Inline translation failed", error);
        } finally {
          pending.delete(key);
        }
      });
      return { name: key };
    },
  });
}

export function createCloudTaskVerifier(config, dependencies = {}) {
  const client = dependencies.client ?? new OAuth2Client();
  const audience = config.cloudTasksAudience ?? config.cloudTasksTargetUrl;
  const serviceAccountEmail = config.cloudTasksServiceAccountEmail;
  return Object.freeze({
    async verify(authorization) {
      if (!audience || !serviceAccountEmail || typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
        return false;
      }
      try {
        const ticket = await client.verifyIdToken({
          audience,
          idToken: authorization.slice("Bearer ".length),
        });
        const payload = ticket.getPayload();
        return payload?.email_verified === true && payload.email === serviceAccountEmail;
      } catch {
        return false;
      }
    },
  });
}
