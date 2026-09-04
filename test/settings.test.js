import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createFirestoreSettingsStore } from "../src/firebase-stores.js";
import {
  createInMemorySettingsStore,
  createLocalSettingsStore,
  normalizeSiteTitle,
} from "../src/settings.js";

test("normalizeSiteTitle trims valid text and enforces the 80 character limit", () => {
  assert.equal(normalizeSiteTitle("  港灣入口  "), "港灣入口");
  assert.equal(normalizeSiteTitle("⚓".repeat(80)), "⚓".repeat(80));
  assert.throws(() => normalizeSiteTitle(null), /不可為空白/);
  assert.throws(() => normalizeSiteTitle(" ".repeat(3)), /不可為空白/);
  assert.throws(() => normalizeSiteTitle("⚓".repeat(81)), /不可超過 80 個字元/);
});

test("in-memory settings store keeps the normalized site title", async () => {
  const store = createInMemorySettingsStore({ siteTitle: "Initial" });
  assert.deepEqual(await store.getPublicSettings(), { siteTitle: "Initial" });
  assert.deepEqual(await store.updateSettings({ siteTitle: "  Updated  " }), { siteTitle: "Updated" });
  assert.deepEqual(await store.getPublicSettings(), { siteTitle: "Updated" });
});

test("local settings store survives creating a new store instance", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koino-settings-"));
  const filePath = path.join(directory, "settings.json");
  context.after(() => rm(directory, { force: true, recursive: true }));

  const firstStore = createLocalSettingsStore({ filePath, siteTitle: "Fallback" });
  assert.deepEqual(await firstStore.getPublicSettings(), { siteTitle: "Fallback" });
  await firstStore.updateSettings({ siteTitle: "  Restart Safe  " }, { id: "admin-1" });

  const secondStore = createLocalSettingsStore({ filePath, siteTitle: "Fallback" });
  assert.deepEqual(await secondStore.getPublicSettings(), { siteTitle: "Restart Safe" });
  assert.equal(JSON.parse(await readFile(filePath, "utf8")).updatedBy, "admin-1");
});

test("Firestore settings store falls back safely and persists updates", async () => {
  let storedData = null;
  const document = {
    async get() {
      return {
        data: () => storedData,
        exists: storedData !== null,
      };
    },
    async set(data, options) {
      assert.deepEqual(options, { merge: true });
      storedData = { ...storedData, ...data };
    },
  };
  const firestore = {
    collection(name) {
      assert.equal(name, "settings");
      return {
        doc(id) {
          assert.equal(id, "site");
          return document;
        },
      };
    },
  };
  const store = createFirestoreSettingsStore({}, { firestore, siteTitle: "Fallback" });

  assert.deepEqual(await store.getPublicSettings(), { siteTitle: "Fallback" });
  assert.deepEqual(
    await store.updateSettings({ siteTitle: "  Persistent Harbor  " }, { id: "admin-1" }),
    { siteTitle: "Persistent Harbor" },
  );
  assert.equal(storedData.siteTitle, "Persistent Harbor");
  assert.equal(storedData.updatedBy, "admin-1");
  assert.ok(storedData.updatedAt instanceof Date);
  assert.deepEqual(await store.getPublicSettings(), { siteTitle: "Persistent Harbor" });

  storedData.siteTitle = "";
  assert.deepEqual(await store.getPublicSettings(), { siteTitle: "Fallback" });
});
