import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const indexUrl = new URL("../public/index.html", import.meta.url);
const scriptUrl = new URL("../public/app.js", import.meta.url);
const stylesUrl = new URL("../public/styles.css", import.meta.url);
const modernStylesUrl = new URL("../public/modern.css", import.meta.url);
const firebaseStoresUrl = new URL("../src/firebase-stores.js", import.meta.url);

test("portal shell exposes the ordered account, Space, bookmark and admin entry points", async () => {
  const html = await readFile(indexUrl, "utf8");

  for (const marker of [
    'id="portal-shell"',
    'data-portal-view="home"',
    'data-portal-view="discussions"',
    'data-portal-view="spaces"',
    'data-portal-view="admin"',
    'id="dashboard-space-filter"',
    'id="thread-form"',
    'data-open-thread-form',
    'data-cancel-thread-form',
    'id="status-edit-dialog"',
    'id="profile-dialog"',
    'id="portal-profile-button"',
    'id="portal-all-spaces"',
    'href="/favicon.svg"',
    'href="/vendor/bootstrap-icons.css"',
  ]) {
    assert.match(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(html, /id="thread-form"[^>]*hidden[\s\S]*?name="attachments"[^>]*multiple/);
  assert.match(html, /id="thread-form"[\s\S]*?class="discussion-toolbar"/);
  assert.doesNotMatch(html, /id="create-thread-dialog"|id="thread-edit-dialog"|data-open-thread-dialog/);
  assert.match(html, /id="portal-admin-nav"[^>]*data-portal-target="admin"[^>]*hidden[^>]*>[\s\S]*?bi-gear-fill[\s\S]*?<\/button>/);
  assert.match(html, /id="portal-profile-button"[\s\S]*?登入者[\s\S]*?id="portal-user-name"/);
  assert.match(html, /id="portal-all-spaces"[^>]*>[\s\S]*?bi-grid-3x3-gap-fill[\s\S]*?全部工作區[\s\S]*?<\/button>/);
  assert.doesNotMatch(html, /id="portal-all-spaces"[^>]*data-portal-target="spaces"/);
  assert.match(html, /class="sidebar-brand"[\s\S]*?id="portal-profile-button"[\s\S]*?id="portal-all-spaces"[\s\S]*?id="portal-space-list"[\s\S]*?id="portal-bookmarks"[\s\S]*?id="portal-logout-button"/);
  assert.match(html, />工作區管理<\/button>/);
  assert.doesNotMatch(html, />[^<]*\bSpace\b[^<]*</);
  assert.match(html, /使用者管理[\s\S]*使用者與角色[\s\S]*新增使用者/);
  assert.match(html, /id="user-create-form"/);
  assert.match(html, /id="forgot-password-form"/);
  assert.match(html, /忘記密碼？/);
  assert.doesNotMatch(html, /id="public-intro"|class="status-card"|class="milestones"|<footer>/);
});

test("portal client aggregates accessible threads and disables creation without a Space", async () => {
  const script = await readFile(scriptUrl, "utf8");

  assert.match(script, /fetch\("\/api\/threads"/);
  assert.match(script, /dashboardSpaceFilter\.value/);
  assert.match(script, /button\.disabled = !activeSpaces\.length/);
  assert.match(script, /portalAdminNav\.hidden = user\.role !== "admin"/);
  assert.match(script, /fetch\("\/api\/auth\/me", \{\s*method: "PATCH"/);
  assert.match(script, /function showSpaceOverview\(spaceId = null\)/);
  assert.match(script, /async function showWorkspaceThreads\(spaceId = null\)/);
  assert.match(script, /threadSpaceFilter\.value = selectedThreadSpaceId \?\? ""/);
  assert.match(script, /button\.dataset\.spaceId = space\.id/);
  assert.match(script, /prefix\.textContent = "#"/);
  assert.match(script, /button\.addEventListener\("click", \(\) => showWorkspaceThreads\(space\.id\)\)/);
  assert.match(script, /portalAllSpaces\.addEventListener\("click", \(\) => showWorkspaceThreads\(\)\)/);
  assert.match(script, /loadThreads\("\/api\/bookmarks", "目前沒有已加入書籤的討論串。"\)/);
  assert.match(script, /spaceId: formData\.get\("spaceId"\)/);
  assert.match(script, /function resetPortalData\(\)/);
  assert.match(script, /function showUser\(user\) \{\s*resetPortalData\(\)/);
  assert.match(script, /function showLogin\(\) \{\s*resetPortalData\(\)/);
  assert.match(script, /password: formData\.get\("password"\)/);
  assert.match(script, /\.\.\.\(password\.value \? \{ password: password\.value \} : \{\}\)/);
  assert.match(script, /accounts:sendOobCode/);
  assert.match(script, /requestType: "PASSWORD_RESET"/);
  assert.match(script, /method: "DELETE"/);
  assert.match(script, /className = "delete-status-button"/);
  assert.match(script, /className = "thread-header-actions"/);
  assert.match(script, /replyAction\.addEventListener\("click", \(\) => \{\s*topComposer\.element\.hidden = false;\s*topComposer\.focus\(\)/);
  assert.match(script, /className = "thread-action-menu"/);
  assert.match(script, /actionMenuToggle\.setAttribute\("aria-haspopup", "menu"\)/);
  assert.match(script, /actionMenuToggle\.setAttribute\("aria-expanded", String\(actionMenu\.open\)\)/);
  assert.match(script, /addMenuItem\("編輯", "bi-pencil"/);
  assert.match(script, /addMenuItem\("加入書籤", "bi-bookmark"/);
  assert.match(script, /thread\.pinned \? "取消置頂" : "置頂"/);
  assert.match(script, /thread\.archived \? "取消封存" : "封存"/);
  assert.match(script, /parentReplyId: reply\.id/);
  assert.match(script, /const canEditReply = signedInUser\.id === reply\.authorId/);
  assert.match(script, /className = "message-edit-form thread-inline-editor"/);
  assert.match(script, /fetch\(`\/api\/attachments\/\$\{encodeURIComponent\(attachmentId\)\}`,[\s\S]*?method: "DELETE"/);
  assert.match(script, /await uploadAttachments\(payload\.thread\.id, threadCreationFilePicker\.files\)/);
  assert.doesNotMatch(script, /actions\.className = "thread-actions"/);
  assert.doesNotMatch(script, /className = "reply-form"|className = "attachment-form"/);
});

test("portal styles preserve hidden state, keyboard focus and mobile single-column layout", async () => {
  const styles = await readFile(stylesUrl, "utf8");
  const modernStyles = await readFile(modernStylesUrl, "utf8");

  assert.match(styles, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.portal-shell\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.portal-nav\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(modernStyles, /\.portal-shell\s*\{[^}]*width:\s*100vw[^}]*height:\s*100vh/s);
  assert.match(modernStyles, /\.portal-active main\s*\{[^}]*width:\s*100%[^}]*margin:\s*0/s);
  assert.match(modernStyles, /@media \(max-width: 720px\)[\s\S]*\.portal-shell\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.doesNotMatch(modernStyles, /├─|└─|🔖|↪|▦/);
  assert.match(modernStyles, /\.thread-header-actions\s*\{/);
  assert.match(modernStyles, /\.thread-menu-list\s*\{[^}]*position:\s*absolute/s);
  assert.match(modernStyles, /\.message-composer\s*,\s*\.message-edit-form\s*\{/);
  assert.match(modernStyles, /\.reply-children\s*\{/);
  assert.match(modernStyles, /\.inline-thread-form\s*\{/);
});

test("Firebase portal reads avoid unnecessary composite-index dependencies at POC scale", async () => {
  const stores = await readFile(firebaseStoresUrl, "utf8");

  assert.doesNotMatch(stores, /collectionGroup\("members"\)\.where/);
  assert.match(stores, /statuses\.orderBy\("sortOrder"\)\.get\(\)/);
  assert.match(stores, /results\.filter\(\(status\) => status\.active\)/);
});

