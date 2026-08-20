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
  assert.match(html, /id="spaces-title"[^>]*>工作區管理<\/h2>/);
  assert.match(html, /id="create-root-space-button"[\s\S]*?新增頂層工作區/);
  assert.doesNotMatch(html, /id="space-form"/);
  assert.match(html, /id="space-edit-dialog"[\s\S]*?name="parentId"[\s\S]*?name="sortOrder"[\s\S]*?name="accessMode"[\s\S]*?name="archived"[\s\S]*?儲存變更/);
  assert.doesNotMatch(html, /id="space-edit-dialog"[\s\S]*?<p class="eyebrow">Workspace<\/p>/);
  assert.doesNotMatch(html, /Workspace overview|顯示所有可存取工作區的資訊。/);
  assert.doesNotMatch(html, /id="portal-all-spaces"[^>]*data-portal-target="spaces"/);
  assert.match(html, /class="sidebar-brand"[\s\S]*?id="portal-profile-button"[\s\S]*?id="portal-all-spaces"[\s\S]*?id="portal-space-list"[\s\S]*?id="portal-bookmarks"[\s\S]*?id="portal-logout-button"/);
  assert.match(html, />工作區管理<\/button>/);
  assert.doesNotMatch(html, />[^<]*\bSpace\b[^<]*</);
  assert.match(html, /後台管理[\s\S]*使用者與角色[\s\S]*新增使用者/);
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
  assert.match(script, /function openSpaceDialog\(\{ parent = null, space = null \} = \{\}\)/);
  assert.match(script, /editButton\.textContent = "編輯工作區"/);
  assert.match(script, /排序:\$\{space\.sortOrder \?\? 0\}/);
  assert.match(script, /spaceEditDialog\.showModal\(\)/);
  assert.match(script, /archived: formData\.get\("archived"\) === "true"/);
  assert.match(script, /async function showWorkspaceThreads\(spaceId = null\)/);
  assert.match(script, /threadSpaceFilter\.value = selectedThreadSpaceId \?\? ""/);
  assert.match(script, /button\.dataset\.spaceId = space\.id/);
  assert.match(script, /prefix\.textContent = "#"/);
  assert.match(script, /label\.className = "workspace-label"/);
  assert.match(script, /async function loadUnreadSummary\(\)/);
  assert.match(script, /fetch\("\/api\/unread-summary"/);
  assert.match(script, /workspace-unread-dot/);
  assert.match(script, /unreadMessageKeys = new Set/);
  assert.match(script, /button\.classList\.toggle\("is-child-space-link"/);
  assert.match(script, /function orderedSpaces\(spaces\)/);
  assert.match(script, /left\.sortOrder \?\? 0\) - \(right\.sortOrder \?\? 0\) \|\| left\.name\.localeCompare\(right\.name\)/);
  assert.match(script, /openSpaceDialog\(\{ parent: space \}\)/);
  assert.match(script, /createRootSpaceButton\.addEventListener\("click", \(\) => openSpaceDialog\(\)\)/);
  assert.match(script, /accessMode: formData\.get\("accessMode"\)/);
  assert.match(script, /sortOrder: Number\.parseInt\(formData\.get\("sortOrder"\), 10\)/);
  assert.match(script, /method: creating \? "POST" : "PATCH"/);
  assert.doesNotMatch(script, /announcementList|space\.type/);
  assert.match(script, /button\.addEventListener\("click", \(\) => showWorkspaceThreads\(space\.id\)\)/);
  assert.match(script, /portalAllSpaces\.addEventListener\("click", \(\) => showWorkspaceThreads\(\)\)/);
  assert.match(script, /setThreadSource\("\/api\/bookmarks", "目前沒有已加入書籤的討論串。"\)/);
  assert.match(script, /function setThreadSource\(sourceUrl = null, emptyMessage = "目前沒有符合條件的討論串。"\)/);
  assert.match(script, /const url = threadSourceUrl \?\? \(selectedSpaceId \? `\/api\/threads\?spaceId=\$\{encodeURIComponent\(selectedSpaceId\)\}` : "\/api\/threads"\)/);
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
  assert.match(script, /addMenuItem\("設定未讀取", "bi-envelope"/);
  assert.match(script, /className = "reply-action-menu"/);
  assert.match(script, /unreadButton\.textContent = "設定未讀取"/);
  assert.match(script, /fetch\("\/api\/unread\/read"/);
  assert.match(script, /new IntersectionObserver/);
  assert.match(script, /threshold: 0\.25/);
  assert.match(script, /function observeUnreadMessage\(/);
  assert.match(script, /function showUnreadMessageMarker\(/);
  assert.match(script, /showUnreadMessageMarker\(messageType, messageId\)/);
  assert.doesNotMatch(script, /訊息已設定為未讀。/);
  assert.match(script, /addMenuItem\("加入書籤", "bi-bookmark"/);
  assert.match(script, /thread\.pinned \? "取消置頂" : "置頂"/);
  assert.match(script, /thread\.archived \? "取消封存" : "封存"/);
  assert.match(script, /parentReplyId: reply\.id/);
  assert.match(script, /item\.append\(message\);[\s\S]*?item\.append\(childList\);[\s\S]*?item\.append\(composerHost\);/);
  assert.match(script, /const canEditReply = signedInUser\.id === reply\.authorId/);
  assert.match(script, /function formatRelativeTime\(value\)/);
  assert.match(script, /elapsedSeconds >= 604_800/);
  assert.match(script, /timestamp\.getFullYear\(\) !== now\.getFullYear\(\)/);
  assert.match(script, /\$\{amount\} \$\{label\}\$\{amount !== 1 \? "s" : ""\} ago/);
  assert.match(script, /function formatFullDateTime\(value\)/);
  assert.match(script, /author\.textContent = `\$\{authorName\} \/ `;/);
  assert.match(script, /timestamp\.title = formatFullDateTime\(message\.updatedAt\)/);
  assert.match(script, /edited\.textContent = " \(edited\)"/);
  assert.match(script, /titleLine\.append\(title, createAuthorMetadata\(thread\)\)/);
  assert.match(script, /message\.append\(authorMeta, content, attachmentList, reactionList, actions\)/);
  assert.match(script, /className = "reaction-list"/);
  assert.match(script, /className = `reaction-chip/);
  assert.match(script, /新增表情符號/);
  assert.match(script, /function createAddReactionIcon\(\)/);
  assert.match(script, /function configureMessageIconAction\(/);
  assert.match(script, /button\.dataset\.tooltip = tooltip/);
  assert.match(script, /createElementNS\(namespace, "svg"\)/);
  assert.match(script, /setAttribute\("viewBox", "0 0 24 24"\)/);
  assert.match(script, /button\.append\(createAddReactionIcon\(\)\)/);
  assert.match(script, /reaction-action-button btn btn-quiet/);
  assert.match(script, /reaction-add-button is-compact btn btn-quiet/);
  assert.doesNotMatch(script, /reaction-add-plus/);
  assert.doesNotMatch(script, /replyLabel\.textContent = "回覆"/);
  assert.match(script, /configureMessageIconAction\(replyAction,[\s\S]*?tooltip: "回覆"/);
  assert.match(script, /configureMessageIconAction\(replyButton,[\s\S]*?tooltip: "回覆"/);
  assert.match(script, /emoji-picker\/picker\.js/);
  assert.match(script, /firebasejs\/12\.17\.0\/firebase-firestore\.js/);
  assert.match(script, /function startReactionRealtime\(/);
  assert.match(script, /stopReactionRealtime\(\)/);
  assert.match(script, /applySlackInspiredEmojiPickerStyles/);
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
  assert.match(modernStyles, /\.thread-menu-item\.btn\s*\{[^}]*display:\s*flex[^}]*gap:\s*4px/s);
  assert.match(modernStyles, /\.thread-header-button\.btn,[\s\S]*?gap:\s*4px/s);
  assert.match(modernStyles, /\.attachment-identity\s*\{[^}]*gap:\s*4px/s);
  assert.match(modernStyles, /\.message-composer\s*,\s*\.message-edit-form\s*\{/);
  assert.match(modernStyles, /\.reply-children\s*\{/);
  assert.match(modernStyles, /\.thread-title-line\s*\{/);
  assert.match(modernStyles, /\.message-author-meta\s*\{/);
  assert.match(modernStyles, /\.message-edited\s*\{/);
  assert.match(modernStyles, /\.inline-thread-form\s*\{/);
  assert.match(modernStyles, /\.space-item\.is-child-space\s*\{/);
  assert.match(modernStyles, /margin-left: clamp\(18px, 4vw, 56px\)/);
  assert.match(modernStyles, /\.portal-space-links\s*\{[^}]*padding:\s*0;/s);
  assert.match(modernStyles, /\.portal-page-heading\s*\{[^}]*margin-bottom:\s*10px[^}]*padding-bottom:\s*0[^}]*border-bottom:\s*0/s);
  assert.match(modernStyles, /\.discussion-toolbar,[\s\S]*?margin-bottom:\s*10px/s);
  assert.match(modernStyles, /\.thread-list\s*\{[^}]*gap:\s*10px/s);
  assert.match(modernStyles, /\.workspace-label\s*\{[^}]*font-weight:\s*400/s);
  assert.match(modernStyles, /\.workspace-unread-dot\s*\{/);
  assert.match(modernStyles, /\.message-unread-dot\s*\{/);
  assert.match(modernStyles, /\.reply-action-menu\s*\{/);
  assert.match(modernStyles, /\.reaction-list\s*\{/);
  assert.match(modernStyles, /\.reaction-chip\.is-selected\.btn\s*\{/);
  assert.match(modernStyles, /\.reaction-add-icon\s*\{/);
  assert.match(modernStyles, /\.message-icon-action::before\s*\{/);
  assert.match(modernStyles, /\.message-icon-action\s*\{[^}]*display:\s*inline-flex[^}]*min-width:\s*32px/s);
  assert.match(modernStyles, /\.message-icon-action > \.bi\s*\{[^}]*width:\s*18px[^}]*pointer-events:\s*none/s);
  assert.match(modernStyles, /\.thread-header-actions > \.message-icon-action,[\s\S]*?width:\s*32px;[\s\S]*?height:\s*32px/s);
  assert.match(modernStyles, /\.message-icon-action:hover,[\s\S]*?background:\s*var\(--kh-surface-soft\)/s);
  assert.match(modernStyles, /\.message-icon-action:hover > \.reaction-add-icon,[\s\S]*?transform:\s*scale\(1\.12\)/s);
  assert.match(modernStyles, /content:\s*attr\(data-tooltip\)/);
  assert.doesNotMatch(modernStyles, /\.reaction-add-plus\s*\{/);
  assert.match(modernStyles, /\.emoji-picker-popover\s*\{/);
  assert.match(modernStyles, /--num-columns:\s*9/);
  assert.match(modernStyles, /\.reply-menu-item\.btn\s*\{[^}]*color:\s*#514f53[^}]*background:\s*transparent/s);
  assert.match(modernStyles, /\.reply-menu-item\.btn:hover,[\s\S]*?background:\s*var\(--kh-surface-soft\)/s);
  assert.match(modernStyles, /\.portal-nav-secondary\s*\{[^}]*border-top:\s*0;/s);
});

test("Firebase portal reads avoid unnecessary composite-index dependencies at POC scale", async () => {
  const stores = await readFile(firebaseStoresUrl, "utf8");

  assert.doesNotMatch(stores, /collectionGroup\("members"\)\.where/);
  assert.match(stores, /statuses\.orderBy\("sortOrder"\)\.get\(\)/);
  assert.match(stores, /results\.filter\(\(status\) => status\.active\)/);
});

