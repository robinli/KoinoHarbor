import assert from "node:assert/strict";
import test from "node:test";

import {
  completeLocalizedMutation,
  failLocalizedMutation,
  localizeRecord,
  normalizeLocale,
  prepareLocalizedMutation,
  resolveRequestLocale,
} from "../src/localization.js";

test("locale normalization supports Traditional Chinese and English", () => {
  assert.equal(normalizeLocale("zh-Hant-TW"), "zh-TW");
  assert.equal(normalizeLocale("en-US"), "en");
  assert.equal(resolveRequestLocale("fr, en-US;q=0.8", "zh-TW"), "en");
  assert.equal(resolveRequestLocale("", "en"), "en");
});

test("localized mutations fall back while pending and reject stale completion", () => {
  const now = new Date("2026-09-04T00:00:00.000Z");
  const pending = prepareLocalizedMutation(null, { content: "港灣內容", title: "港灣" }, ["title", "content"], "zh-TW", now);
  const record = {
    content: "港灣內容",
    title: "港灣",
    translation: pending.translation,
    translations: pending.translations,
  };

  const englishPending = localizeRecord(record, "en", ["title", "content"]);
  assert.equal(englishPending.title, "港灣");
  assert.equal(englishPending.translationStatus.isFallback, true);
  assert.equal(englishPending.translationStatus.state, "pending");
  assert.equal(completeLocalizedMutation(record, 99, { title: "Harbor" }, now).applied, false);

  const completed = completeLocalizedMutation(record, 1, { content: "Harbor content", title: "Harbor" }, now);
  assert.equal(completed.applied, true);
  const englishReady = localizeRecord({ ...record, ...completed }, "en", ["title", "content"]);
  assert.equal(englishReady.title, "Harbor");
  assert.equal(englishReady.content, "Harbor content");
  assert.equal(englishReady.translationStatus.state, "ready");
  assert.equal(failLocalizedMutation({ ...record, ...completed }, 1, "late_failure", now).applied, false);
});
