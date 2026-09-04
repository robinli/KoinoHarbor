import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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
  let siteTitle = normalizeSiteTitle(options.siteTitle ?? DEFAULT_SITE_TITLE);

  return Object.freeze({
    async getPublicSettings() {
      return { siteTitle };
    },

    async updateSettings(input) {
      siteTitle = normalizeSiteTitle(input?.siteTitle);
      return { siteTitle };
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
      cachedSettings = { siteTitle: normalizeSiteTitle(storedSettings.siteTitle) };
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
      const storedSettings = {
        siteTitle,
        updatedAt: new Date().toISOString(),
        updatedBy: actor.id,
      };
      pendingWrite = pendingWrite.then(async () => {
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, `${JSON.stringify(storedSettings, null, 2)}\n`, "utf8");
        cachedSettings = { siteTitle };
      });
      await pendingWrite;
      return { siteTitle };
    },
  });
}
