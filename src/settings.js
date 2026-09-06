import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { completeLocalizedMutation, failLocalizedMutation, prepareLocalizedMutation } from "./localization.js";

export const DEFAULT_SITE_TITLE = "Koino Harbor";

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function normalizeSiteTitle(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw validationError("網站標題不可為空白。");
  }

  const siteTitle = value.trim();
  if ([...siteTitle].length > 80) {
    throw validationError("網站標題不可超過 80 個字元。");
  }

  return siteTitle;
}

export function createInMemorySettingsStore(options = {}) {
  let settings = { siteTitle: normalizeSiteTitle(options.siteTitle ?? DEFAULT_SITE_TITLE) };

  return Object.freeze({
    async getPublicSettings() {
      return structuredClone(settings);
    },

    async updateSettings(input, actor = { id: "system" }, now = new Date()) {
      const siteTitle = normalizeSiteTitle(input?.siteTitle);
      const localized = prepareLocalizedMutation(settings, { siteTitle }, ["siteTitle"], input.sourceLocale, now);
      settings = {
        ...settings,
        siteTitle,
        translation: localized.translation,
        translations: localized.translations,
        updatedAt: now.toISOString(),
        updatedBy: actor.id,
      };
      return structuredClone(settings);
    },

    async completeSettingsTranslation(revision, values, now = new Date()) {
      const completed = completeLocalizedMutation(settings, revision, values, now);
      if (!completed.applied) return false;
      settings.translation = completed.translation;
      settings.translations = completed.translations;
      return true;
    },

    async failSettingsTranslation(revision, errorCode, now = new Date()) {
      const failed = failLocalizedMutation(settings, revision, errorCode, now);
      if (!failed.applied) return false;
      settings.translation = failed.translation;
      return true;
    },
  });
}

export function createLocalSettingsStore(options = {}) {
  const filePath = path.resolve(options.filePath ?? path.join(process.cwd(), "data", "settings.json"));
  const defaultSiteTitle = normalizeSiteTitle(options.siteTitle ?? DEFAULT_SITE_TITLE);
  let cachedSettings = null;
  let pendingWrite = Promise.resolve();

  async function readSettings() {
    if (cachedSettings) return cachedSettings;

    try {
      const storedSettings = JSON.parse(await readFile(filePath, "utf8"));
      cachedSettings = { ...storedSettings, siteTitle: normalizeSiteTitle(storedSettings.siteTitle) };
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError) && error.statusCode !== 400) throw error;
      cachedSettings = { siteTitle: defaultSiteTitle };
    }

    return cachedSettings;
  }

  return Object.freeze({
    async getPublicSettings() {
      await pendingWrite;
      return { ...await readSettings() };
    },

    async updateSettings(input, actor) {
      const siteTitle = normalizeSiteTitle(input?.siteTitle);
      const current = await readSettings();
      const now = new Date();
      const localized = prepareLocalizedMutation(current, { siteTitle }, ["siteTitle"], input.sourceLocale, now);
      const storedSettings = {
        ...current,
        siteTitle,
        translation: localized.translation,
        translations: localized.translations,
        updatedAt: now.toISOString(),
        updatedBy: actor.id,
      };
      pendingWrite = pendingWrite.then(async () => {
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, `${JSON.stringify(storedSettings, null, 2)}\n`, "utf8");
        cachedSettings = storedSettings;
      });
      await pendingWrite;
      return { ...storedSettings };
    },

    async completeSettingsTranslation(revision, values, now = new Date()) {
      const current = await readSettings();
      const completed = completeLocalizedMutation(current, revision, values, now);
      if (!completed.applied) return false;
      const storedSettings = { ...current, translation: completed.translation, translations: completed.translations };
      pendingWrite = pendingWrite.then(async () => {
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, `${JSON.stringify(storedSettings, null, 2)}\n`, "utf8");
        cachedSettings = storedSettings;
      });
      await pendingWrite;
      return true;
    },

    async failSettingsTranslation(revision, errorCode, now = new Date()) {
      const current = await readSettings();
      const failed = failLocalizedMutation(current, revision, errorCode, now);
      if (!failed.applied) return false;
      const storedSettings = { ...current, translation: failed.translation };
      pendingWrite = pendingWrite.then(async () => {
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, `${JSON.stringify(storedSettings, null, 2)}\n`, "utf8");
        cachedSettings = storedSettings;
      });
      await pendingWrite;
      return true;
    },
  });
}
