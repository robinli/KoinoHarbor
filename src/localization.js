export const DEFAULT_LOCALE = "zh-TW";
export const SUPPORTED_LOCALES = Object.freeze(["zh-TW", "en"]);

export function normalizeLocale(value, fallback = DEFAULT_LOCALE) {
  if (typeof value !== "string") return fallback;
  const candidate = value.trim().toLowerCase();
  if (candidate === "en" || candidate.startsWith("en-")) return "en";
  if (candidate === "zh-tw" || candidate === "zh-hant" || candidate.startsWith("zh-hant-")) return "zh-TW";
  if (candidate === "zh" || candidate.startsWith("zh-")) return "zh-TW";
  return fallback;
}

export function resolveRequestLocale(acceptLanguage, preferredLocale = null) {
  if (typeof acceptLanguage === "string" && acceptLanguage.trim()) {
    for (const part of acceptLanguage.split(",")) {
      const locale = normalizeLocale(part.split(";")[0], null);
      if (locale) return locale;
    }
  }
  return normalizeLocale(preferredLocale);
}

export function otherLocale(locale) {
  return normalizeLocale(locale) === "en" ? "zh-TW" : "en";
}

function cloneTranslations(value) {
  return {
    "zh-TW": { ...(value?.["zh-TW"] ?? {}) },
    en: { ...(value?.en ?? {}) },
  };
}

export function prepareLocalizedMutation(current, values, fieldNames, sourceLocale, now = new Date()) {
  const locale = normalizeLocale(sourceLocale);
  const targetLocale = otherLocale(locale);
  const translations = cloneTranslations(current?.translations);
  const pendingFields = [];
  let changed = false;

  for (const fieldName of fieldNames) {
    if (!Object.hasOwn(values, fieldName)) continue;
    const value = values[fieldName];
    if (translations[locale][fieldName] === value) continue;
    changed = true;
    translations[locale][fieldName] = value;
    if (typeof value === "string" && value.length > 0) {
      delete translations[targetLocale][fieldName];
      pendingFields.push(fieldName);
    } else {
      translations[targetLocale][fieldName] = value;
    }
  }

  if (!changed) {
    return {
      changed: false,
      translation: current?.translation ?? null,
      translations,
    };
  }

  const revision = (Number.isInteger(current?.translation?.revision) ? current.translation.revision : 0) + 1;
  return {
    changed: true,
    translation: {
      completedAt: pendingFields.length ? null : now.toISOString(),
      errorCode: null,
      pendingFields,
      revision,
      sourceLocale: locale,
      state: pendingFields.length ? "pending" : "ready",
      updatedAt: now.toISOString(),
    },
    translations,
  };
}

export function completeLocalizedMutation(current, revision, translatedValues, now = new Date()) {
  if (!current?.translation || current.translation.revision !== revision || current.translation.state !== "pending") {
    return { applied: false };
  }
  const sourceLocale = normalizeLocale(current.translation.sourceLocale);
  const targetLocale = otherLocale(sourceLocale);
  const translations = cloneTranslations(current.translations);
  for (const fieldName of current.translation.pendingFields ?? []) {
    if (Object.hasOwn(translatedValues, fieldName)) translations[targetLocale][fieldName] = translatedValues[fieldName];
  }
  return {
    applied: true,
    translation: {
      ...current.translation,
      completedAt: now.toISOString(),
      errorCode: null,
      pendingFields: [],
      state: "ready",
      updatedAt: now.toISOString(),
    },
    translations,
  };
}

export function failLocalizedMutation(current, revision, errorCode, now = new Date()) {
  if (!current?.translation || current.translation.revision !== revision || current.translation.state !== "pending") {
    return { applied: false };
  }
  return {
    applied: true,
    translation: {
      ...current.translation,
      errorCode: errorCode || "translation_failed",
      state: "failed",
      updatedAt: now.toISOString(),
    },
  };
}

export function localizeRecord(record, locale, fieldNames) {
  if (!record) return record;
  const requestedLocale = normalizeLocale(locale);
  const sourceLocale = normalizeLocale(record.translation?.sourceLocale);
  const result = { ...record };
  let isFallback = false;

  for (const fieldName of fieldNames) {
    const requestedValue = record.translations?.[requestedLocale]?.[fieldName];
    const sourceValue = record.translations?.[sourceLocale]?.[fieldName];
    if (requestedValue !== undefined) {
      result[fieldName] = requestedValue;
    } else if (sourceValue !== undefined) {
      result[fieldName] = sourceValue;
      isFallback = requestedLocale !== sourceLocale;
    }
  }

  result.translationStatus = record.translation
    ? {
      isFallback,
      requestedLocale,
      revision: record.translation.revision,
      sourceLocale,
      state: record.translation.state,
    }
    : {
      isFallback: requestedLocale !== DEFAULT_LOCALE,
      requestedLocale,
      revision: 0,
      sourceLocale: DEFAULT_LOCALE,
      state: "legacy",
    };
  delete result.translation;
  delete result.translations;
  return result;
}

export function isTranslationPending(record) {
  return record?.translation?.state === "pending" && Number.isInteger(record.translation.revision);
}
