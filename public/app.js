const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#login-message");
const forgotPasswordButton = document.querySelector("#forgot-password-button");
const forgotPasswordForm = document.querySelector("#forgot-password-form");
const forgotPasswordMessage = document.querySelector("#forgot-password-message");
const cancelForgotPassword = document.querySelector("#cancel-forgot-password");
const signedOutView = document.querySelector("#signed-out-view");
const userAdmin = document.querySelector("#user-admin");
const userCreateForm = document.querySelector("#user-create-form");
const userTableBody = document.querySelector("#user-table-body");
const userAdminMessage = document.querySelector("#user-admin-message");
const spacesPanel = document.querySelector("#spaces-panel");
const spaceList = document.querySelector("#space-list");
const spaceMessage = document.querySelector("#space-message");
const discussionPanel = document.querySelector("#discussion-panel");
const statusForm = document.querySelector("#status-form");
const statusList = document.querySelector("#status-list");
const threadSpaceFilter = document.querySelector("#thread-space-filter");
const threadStatusFilter = document.querySelector("#thread-status-filter");
const threadForm = document.querySelector("#thread-form");
const threadStatusSelect = document.querySelector("#thread-status-select");
const threadList = document.querySelector("#thread-list");
const discussionMessage = document.querySelector("#discussion-message");
const searchForm = document.querySelector("#search-form");
const authCard = document.querySelector("#auth-card");
const portalShell = document.querySelector("#portal-shell");
const portalAvatar = document.querySelector(".portal-avatar");
const portalUserName = document.querySelector("#portal-user-name");
const portalUserRole = document.querySelector("#portal-user-role");
const portalProfileButton = document.querySelector("#portal-profile-button");
const portalLogoutButton = document.querySelector("#portal-logout-button");
const portalAdminNav = document.querySelector("#portal-admin-nav");
const portalAllSpaces = document.querySelector("#portal-all-spaces");
const portalBookmarks = document.querySelector("#portal-bookmarks");
const portalSpaceList = document.querySelector("#portal-space-list");
const spacesTitle = document.querySelector("#spaces-title");
const createRootSpaceButton = document.querySelector("#create-root-space-button");
const discussionTitle = document.querySelector("#discussion-title");
const dashboardThreadList = document.querySelector("#dashboard-thread-list");
const dashboardSpaceFilter = document.querySelector("#dashboard-space-filter");
const statusSummary = document.querySelector("#status-summary");
const threadSpaceSelect = document.querySelector("#thread-space-select");
const statusEditDialog = document.querySelector("#status-edit-dialog");
const statusEditForm = document.querySelector("#status-edit-form");
const profileDialog = document.querySelector("#profile-dialog");
const profileForm = document.querySelector("#profile-form");
const profileMessage = document.querySelector("#profile-message");
const spaceEditDialog = document.querySelector("#space-edit-dialog");
const spaceEditForm = document.querySelector("#space-edit-form");
const spaceEditMessage = document.querySelector("#space-edit-message");
const spaceDialogTitle = document.querySelector("#space-dialog-title");
const spaceDialogSubmit = document.querySelector("#space-dialog-submit");
const spaceAccessModeField = document.querySelector("#space-access-mode-field");
const spaceArchivedField = document.querySelector("#space-archived-field");
let availableUsers = [];
let availableSpaces = [];
let availableStatuses = [];
let signedInUser = null;
let runtimeConfig = null;
let selectedSidebarSpaceId = null;
let selectedThreadSpaceId = null;
let threadSourceUrl = null;
let threadEmptyMessage = "目前沒有符合條件的討論串。";
let unreadBySpace = {};
let unreadMessages = [];
let unreadMessageKeys = new Set();
const unreadMessageTargets = new WeakMap();
const pendingUnreadReads = new Map();
let unreadReadTimer = null;
const messageTimers = new WeakMap();
let emojiPickerHost = null;
let emojiPickerTarget = null;
let emojiPickerTrigger = null;
let firebaseRealtimeContext = null;
let reactionListenerUnsubscribers = [];
let reactionRealtimeGeneration = 0;
const realtimeReactionDocuments = new Map();

function setSystemMessage(messageElement, message, type = "success") {
  const existingTimer = messageTimers.get(messageElement);
  if (existingTimer) window.clearTimeout(existingTimer);
  messageTimers.delete(messageElement);
  messageElement.replaceChildren();
  messageElement.classList.remove("is-success", "is-error");
  if (!message) return;

  const text = document.createElement("span");
  text.textContent = message;
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "system-message-close";
  closeButton.setAttribute("aria-label", "關閉訊息");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => setSystemMessage(messageElement, ""));
  messageElement.classList.add(type === "error" ? "is-error" : "is-success");
  messageElement.append(text, closeButton);

  if (type === "success") {
    messageTimers.set(messageElement, window.setTimeout(() => setSystemMessage(messageElement, ""), 8_000));
  }
}

function enhanceBootstrapUI(root = document) {
  const selectAll = (selector) => [
    ...(root instanceof Element && root.matches(selector) ? [root] : []),
    ...root.querySelectorAll(selector),
  ];

  for (const button of selectAll("button:not(.btn)")) {
    button.classList.add("btn");
    if (button.matches(".delete-status-button")) {
      button.classList.add("btn-danger");
    } else if (
      button.matches(".secondary-button, .text-button, .subtle-button, .dialog-close, .portal-logout, .archive-space-button")
      || button.closest(".portal-nav, .portal-space-links, .admin-breadcrumb, .sidebar-brand, .portal-user")
    ) {
      button.classList.add("btn-quiet");
    } else {
      button.classList.add("btn-primary");
    }
  }

  for (const input of selectAll("input:not(.form-control):not(.form-check-input)")) {
    if (["checkbox", "radio"].includes(input.type)) {
      input.classList.add("form-check-input");
    } else {
      input.classList.add("form-control");
      if (input.type === "file") input.classList.add("form-control-sm");
    }
  }

  for (const select of selectAll("select:not(.form-select)")) select.classList.add("form-select");
  for (const textarea of selectAll("textarea:not(.form-control)")) textarea.classList.add("form-control");
  for (const table of selectAll("table:not(.table)")) table.classList.add("table", "table-hover", "align-middle");
  for (const wrapper of selectAll(".table-wrap:not(.table-responsive)")) wrapper.classList.add("table-responsive");
}

enhanceBootstrapUI();
const bootstrapObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof Element) enhanceBootstrapUI(node);
    }
  }
});
bootstrapObserver.observe(document.body, { childList: true, subtree: true });

document.addEventListener("click", (event) => {
  for (const menu of document.querySelectorAll(".thread-action-menu[open], .reply-action-menu[open]")) {
    if (!menu.contains(event.target)) menu.removeAttribute("open");
  }
  if (emojiPickerHost && !emojiPickerHost.contains(event.target) && !emojiPickerTrigger?.contains(event.target)) {
    closeEmojiPicker();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (emojiPickerHost) {
    closeEmojiPicker();
    return;
  }
  const menu = document.querySelector(".thread-action-menu[open], .reply-action-menu[open]");
  if (!menu) return;
  menu.removeAttribute("open");
  menu.querySelector("summary")?.focus();
});

window.addEventListener("resize", positionEmojiPicker);
window.addEventListener("scroll", positionEmojiPicker, true);

function resetPortalData() {
  closeEmojiPicker();
  stopReactionRealtime();
  if (firebaseRealtimeContext) {
    void firebaseRealtimeContext.modules.signOut(firebaseRealtimeContext.auth).catch(() => {});
    firebaseRealtimeContext = null;
  }
  availableUsers = [];
  availableSpaces = [];
  availableStatuses = [];
  userTableBody.replaceChildren();
  spaceList.replaceChildren();
  statusList.replaceChildren();
  threadList.replaceChildren();
  dashboardThreadList.replaceChildren();
  statusSummary.replaceChildren();
  portalSpaceList.replaceChildren();
  threadSpaceFilter.replaceChildren();
  threadStatusFilter.replaceChildren();
  dashboardSpaceFilter.replaceChildren();
  threadSpaceSelect.replaceChildren();
  threadStatusSelect.replaceChildren();
  threadForm.hidden = true;
  selectedSidebarSpaceId = null;
  selectedThreadSpaceId = null;
  threadSourceUrl = null;
  threadEmptyMessage = "目前沒有符合條件的討論串。";
  unreadBySpace = {};
  unreadMessages = [];
  unreadMessageKeys = new Set();
  pendingUnreadReads.clear();
  if (unreadReadTimer) window.clearTimeout(unreadReadTimer);
  unreadReadTimer = null;
  unreadVisibilityObserver.disconnect();
}

function showPortalView(viewName) {
  for (const view of document.querySelectorAll("[data-portal-view]")) {
    view.hidden = view.dataset.portalView !== viewName;
  }
  for (const button of document.querySelectorAll(".portal-sidebar [data-portal-target], #portal-bookmarks")) {
    button.classList.toggle("is-active", button.dataset.portalTarget === viewName);
  }
  portalAllSpaces.classList.remove("is-active");
  for (const button of portalSpaceList.querySelectorAll("button[data-space-id]")) {
    button.classList.remove("is-active");
  }
}

function updateWorkspaceThreadNavigation(spaceId = null, active = true) {
  portalAllSpaces.classList.toggle("is-active", active && !spaceId);
  for (const button of portalSpaceList.querySelectorAll("button[data-space-id]")) {
    button.classList.toggle("is-active", active && button.dataset.spaceId === spaceId);
  }
}

function updateDiscussionHeading(space = null) {
  discussionTitle.textContent = space?.name ?? "全部工作區";
}

function formatRelativeTime(value) {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return "unknown time";

  const now = new Date();
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - timestamp.getTime()) / 1_000));
  if (elapsedSeconds >= 604_800) {
    return new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
      ...(timestamp.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
    }).format(timestamp);
  }

  const units = [
    [86_400, "day"],
    [3_600, "hr"],
    [60, "min"],
  ];
  const unit = units.find(([seconds]) => elapsedSeconds >= seconds);
  if (!unit) return "just now";

  const [seconds, label] = unit;
  const amount = Math.floor(elapsedSeconds / seconds);
  return `${amount} ${label}${amount !== 1 ? "s" : ""} ago`;
}

function formatFullDateTime(value) {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return "Unknown time";

  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function createAuthorMetadata(message) {
  const authorName = message.authorDisplayName ?? "Unknown user";
  const meta = document.createElement("span");
  meta.className = "message-author-meta";
  const author = document.createElement("span");
  author.textContent = `${authorName} / `;
  const timestamp = document.createElement("time");
  timestamp.dateTime = message.updatedAt ?? "";
  timestamp.title = formatFullDateTime(message.updatedAt);
  timestamp.textContent = formatRelativeTime(message.updatedAt);
  meta.append(author, timestamp);
  if (message.createdAt && message.updatedAt && new Date(message.updatedAt).getTime() > new Date(message.createdAt).getTime()) {
    const edited = document.createElement("span");
    edited.className = "message-edited";
    edited.textContent = " (edited)";
    meta.append(edited);
  }
  return meta;
}

function unreadMessageKey(messageType, messageId) {
  return `${messageType}:${messageId}`;
}

function createUnreadDot() {
  const dot = document.createElement("span");
  dot.className = "message-unread-dot";
  dot.setAttribute("aria-label", "未讀取");
  dot.setAttribute("role", "img");
  return dot;
}

function queueVisibleUnreadMessage(message) {
  const key = unreadMessageKey(message.messageType, message.messageId);
  pendingUnreadReads.set(key, message);
  if (unreadReadTimer) return;
  unreadReadTimer = window.setTimeout(async () => {
    const messages = [...pendingUnreadReads.values()];
    pendingUnreadReads.clear();
    unreadReadTimer = null;
    try {
      await markMessagesRead(messages);
      for (const message of messages) {
        const key = unreadMessageKey(message.messageType, message.messageId);
        for (const element of document.querySelectorAll(`[data-unread-message-key="${key}"]`)) {
          element.querySelector(".message-unread-dot")?.remove();
          element.classList.remove("is-unread-message");
        }
      }
    } catch (error) {
      setSystemMessage(discussionMessage, error.message, "error");
    }
  }, 150);
}

const unreadVisibilityObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const message = unreadMessageTargets.get(entry.target);
    unreadVisibilityObserver.unobserve(entry.target);
    if (message) queueVisibleUnreadMessage(message);
  }
}, { threshold: 0.25 });

function observeUnreadMessage(element, messageType, messageId, threadId) {
  if (!unreadMessageKeys.has(unreadMessageKey(messageType, messageId))) return;
  element.classList.add("is-unread-message");
  element.dataset.unreadMessageKey = unreadMessageKey(messageType, messageId);
  unreadMessageTargets.set(element, { messageId, messageType, threadId });
  unreadVisibilityObserver.observe(element);
}

function showUnreadMessageMarker(messageType, messageId) {
  const key = unreadMessageKey(messageType, messageId);
  unreadMessageKeys.add(key);
  for (const element of document.querySelectorAll(`[data-message-key="${key}"]`)) {
    const actions = element.matches(".thread-card")
      ? element.querySelector(".thread-header-actions")
      : element.querySelector(".reply-message-actions");
    if (!actions?.querySelector(".message-unread-dot")) actions?.append(createUnreadDot());
  }
}

async function showWorkspaceThreads(spaceId = null) {
  const selectedSpace = availableSpaces.find((space) => !space.archived && space.id === spaceId) ?? null;
  selectedThreadSpaceId = selectedSpace?.id ?? null;
  showPortalView("discussions");
  threadSpaceFilter.value = selectedThreadSpaceId ?? "";
  updateDiscussionHeading(selectedSpace);
  updateWorkspaceThreadNavigation(selectedThreadSpaceId);
  setThreadSource();
  await loadThreads();
}

function updateUnreadWorkspaceLabels() {
  for (const button of portalSpaceList.querySelectorAll("button[data-space-id]")) {
    const hasUnread = (unreadBySpace[button.dataset.spaceId] ?? 0) > 0;
    button.querySelector(".workspace-unread-dot")?.toggleAttribute("hidden", !hasUnread);
  }
}

async function loadUnreadSummary() {
  const response = await fetch("/api/unread-summary", { headers: { Accept: "application/json" } });
  const payload = await readJsonResponse(response);
  unreadBySpace = payload.unreadBySpace;
  unreadMessages = payload.unreadMessages;
  unreadMessageKeys = new Set(unreadMessages.map((message) => unreadMessageKey(message.messageType, message.messageId)));
  updateUnreadWorkspaceLabels();
}

async function markMessagesRead(messages) {
  if (!messages.length) return;
  const response = await fetch("/api/unread/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  await readJsonResponse(response);
  await loadUnreadSummary();
}

async function setMessageUnread(messageType, messageId, threadId) {
  const response = await fetch("/api/unread", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId, messageType, threadId }),
  });
  await readJsonResponse(response);
  await loadUnreadSummary();
  showUnreadMessageMarker(messageType, messageId);
}

function createThreadSummary(thread) {
  const card = document.createElement("article");
  card.className = "thread-summary";
  const space = availableSpaces.find((item) => item.id === thread.spaceId);
  const status = availableStatuses.find((item) => item.id === thread.statusId);
  const meta = document.createElement("p");
  meta.className = "thread-summary-meta";
  meta.textContent = `${space?.name ?? "工作區"} · ${status?.name ?? "無狀態"}`;
  const title = document.createElement("h4");
  title.textContent = thread.title;
  const content = document.createElement("p");
  content.className = "thread-summary-content";
  content.textContent = thread.content;
  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.textContent = "開啟討論";
  openButton.addEventListener("click", async () => {
    await showWorkspaceThreads(space?.id ?? null);
  });
  card.append(meta, title, content, openButton);
  return card;
}

async function loadDashboard() {
  const response = await fetch("/api/threads", { headers: { Accept: "application/json" } });
  const payload = await readJsonResponse(response);
  const allThreads = payload.threads;
  const threads = dashboardSpaceFilter.value
    ? allThreads.filter((thread) => thread.spaceId === dashboardSpaceFilter.value)
    : allThreads;
  dashboardThreadList.replaceChildren(...threads.slice(0, 8).map(createThreadSummary));
  if (!threads.length) dashboardThreadList.textContent = "目前沒有可顯示的討論。";

  const counts = new Map();
  for (const thread of threads) {
    const label = availableStatuses.find((status) => status.id === thread.statusId)?.name ?? "無狀態";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  statusSummary.replaceChildren(...[...counts.entries()].map(([label, count]) => {
    const item = document.createElement("div");
    const name = document.createElement("span");
    name.textContent = label;
    const value = document.createElement("strong");
    value.textContent = String(count);
    item.append(name, value);
    return item;
  }));
  if (!counts.size) statusSummary.textContent = "目前沒有討論資料。";
}

function createUserRow(user) {
  const row = document.createElement("tr");
  row.dataset.userId = user.id;

  const identityCell = document.createElement("td");
  const identity = document.createElement("div");
  identity.className = "user-identity";
  const displayName = document.createElement("input");
  displayName.value = user.displayName;
  displayName.setAttribute("aria-label", `${user.email} 的顯示名稱`);
  const email = document.createElement("small");
  email.textContent = user.email;
  identity.append(displayName, email);
  identityCell.append(identity);

  const passwordCell = document.createElement("td");
  const password = document.createElement("input");
  password.type = "password";
  password.minLength = 8;
  password.autocomplete = "new-password";
  password.placeholder = "留空則不變更";
  password.setAttribute("aria-label", `${user.email} 的新密碼`);
  passwordCell.append(password);

  const roleCell = document.createElement("td");
  const role = document.createElement("select");
  role.setAttribute("aria-label", `${user.email} 的角色`);
  for (const value of ["admin", "member", "guest"]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.selected = value === user.role;
    role.append(option);
  }
  roleCell.append(role);

  const activeCell = document.createElement("td");
  const activeLabel = document.createElement("label");
  activeLabel.className = "status-toggle";
  const active = document.createElement("input");
  active.type = "checkbox";
  active.checked = user.active;
  activeLabel.append(active, document.createTextNode("啟用"));
  activeCell.append(activeLabel);

  const actionCell = document.createElement("td");
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "save-user-button";
  saveButton.textContent = "儲存";
  saveButton.addEventListener("click", async () => {
    userAdminMessage.textContent = "";
    saveButton.disabled = true;

    try {
      const response = await fetch(`/api/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          active: active.checked,
          displayName: displayName.value,
          ...(password.value ? { password: password.value } : {}),
          role: role.value,
        }),
      });
      await readJsonResponse(response);
      const changedPassword = Boolean(password.value);
      password.value = "";
      setSystemMessage(userAdminMessage, `已更新 ${user.email} 的名稱${changedPassword ? "與密碼" : ""}。`);
    } catch (error) {
      setSystemMessage(userAdminMessage, error.message, "error");
    } finally {
      saveButton.disabled = false;
    }
  });
  actionCell.append(saveButton);

  row.append(identityCell, passwordCell, roleCell, activeCell, actionCell);
  return row;
}

async function loadUsers() {
  userAdminMessage.textContent = "";

  try {
    const response = await fetch("/api/users", {
      headers: { Accept: "application/json" },
    });
    const payload = await readJsonResponse(response);
    availableUsers = payload.users;
    userTableBody.replaceChildren(...payload.users.map(createUserRow));
  } catch (error) {
    setSystemMessage(userAdminMessage, error.message, "error");
  }
}

userCreateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  userAdminMessage.textContent = "";
  const formData = new FormData(userCreateForm);

  try {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: formData.get("displayName"),
        email: formData.get("email"),
        password: formData.get("password"),
        role: formData.get("role"),
      }),
    });
    const payload = await readJsonResponse(response);
    userCreateForm.reset();
    await loadUsers();
    setSystemMessage(userAdminMessage, `已新增 ${payload.user.email}。`);
  } catch (error) {
    setSystemMessage(userAdminMessage, error.message, "error");
  }
});

async function loadSpaceMembers(spaceId, listElement) {
  const response = await fetch(`/api/spaces/${encodeURIComponent(spaceId)}/members`, {
    headers: { Accept: "application/json" },
  });
  const payload = await readJsonResponse(response);

  listElement.replaceChildren(...payload.members.map((membership) => {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${membership.user?.email ?? membership.userId} · ${membership.role}`;
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "移除";
    removeButton.addEventListener("click", async () => {
      const deleteResponse = await fetch(
        `/api/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(membership.userId)}`,
        { method: "DELETE" },
      );
      await readJsonResponse(deleteResponse);
      await loadSpaceMembers(spaceId, listElement);
    });
    item.append(label, removeButton);
    return item;
  }));
}

function userInitials(displayName) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]).join("");
  return (initials || "KH").toUpperCase();
}

function renderSpaceOverview() {
  const selectedSpace = availableSpaces.find((space) => space.id === selectedSidebarSpaceId) ?? null;
  const visibleSpaces = selectedSpace ? [selectedSpace] : orderedSpaces(availableSpaces);

  spacesTitle.textContent = selectedSpace?.name ?? "工作區管理";
  createRootSpaceButton.hidden = signedInUser?.role !== "admin";
  spaceList.replaceChildren(...visibleSpaces.map(createSpaceCard));

  if (!visibleSpaces.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "目前沒有可顯示的工作區。";
    spaceList.append(empty);
  }

}

function orderedSpaces(spaces) {
  const visibleIds = new Set(spaces.map((space) => space.id));
  const childrenByParent = new Map();
  const roots = [];
  for (const space of spaces) {
    if (space.parentId && visibleIds.has(space.parentId)) {
      const children = childrenByParent.get(space.parentId) ?? [];
      children.push(space);
      childrenByParent.set(space.parentId, children);
    } else {
      roots.push(space);
    }
  }
  const bySortOrderThenName = (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0) || left.name.localeCompare(right.name);
  return roots.sort(bySortOrderThenName).flatMap((space) => [space, ...(childrenByParent.get(space.id) ?? []).sort(bySortOrderThenName)]);
}

function showSpaceOverview(spaceId = null) {
  selectedSidebarSpaceId = spaceId;
  showPortalView("spaces");
  renderSpaceOverview();
}

function createSpaceCard(space) {
  const card = document.createElement("article");
  card.className = `space-item${space.archived ? " is-archived" : ""}${space.parentId ? " is-child-space" : ""}`;
  const header = document.createElement("div");
  header.className = "space-item-header";
  const headingGroup = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = space.name;
  headingGroup.append(title);
  header.append(headingGroup);

  if (signedInUser.role === "admin") {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "edit-space-button";
    editButton.textContent = "編輯工作區";
    editButton.addEventListener("click", () => openSpaceDialog({ space }));
    const actions = document.createElement("div");
    actions.className = "space-item-actions";
    actions.append(editButton);
    if (!space.parentId) {
      const childButton = document.createElement("button");
      childButton.type = "button";
      childButton.className = "secondary-button";
      childButton.textContent = "新增子工作區";
      childButton.addEventListener("click", () => openSpaceDialog({ parent: space }));
      actions.append(childButton);
    }
    header.append(actions);
  }

  const description = document.createElement("p");
  description.textContent = `排序:${space.sortOrder ?? 0} ${space.description || "尚未提供說明。"}`;
  card.append(header, description);

  if (signedInUser.role === "admin") {
    const editor = document.createElement("div");
    editor.className = "member-editor";
    const editorTitle = document.createElement("h4");
    editorTitle.textContent = "成員管理";
    const control = document.createElement("div");
    control.className = "member-control";
    const userSelect = document.createElement("select");
    userSelect.setAttribute("aria-label", `${space.name} 新增成員`);
    for (const user of availableUsers.filter((item) => item.active)) {
      const option = document.createElement("option");
      option.value = user.id;
      option.textContent = user.email;
      userSelect.append(option);
    }
    const roleSelect = document.createElement("select");
    roleSelect.setAttribute("aria-label", `${space.name} 成員角色`);
    for (const roleValue of ["member", "manager", "guest"]) {
      const option = document.createElement("option");
      option.value = roleValue;
      option.textContent = roleValue;
      roleSelect.append(option);
    }
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.textContent = "加入";
    const memberList = document.createElement("ul");
    memberList.className = "member-list";
    addButton.addEventListener("click", async () => {
      spaceMessage.textContent = "";

      try {
        const response = await fetch(`/api/spaces/${encodeURIComponent(space.id)}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: roleSelect.value, userId: userSelect.value }),
        });
        await readJsonResponse(response);
        await loadSpaceMembers(space.id, memberList);
      } catch (error) {
        setSystemMessage(spaceMessage, error.message, "error");
      }
    });
    control.append(userSelect, roleSelect, addButton);
    editor.append(editorTitle, control, memberList);
    card.append(editor);
    loadSpaceMembers(space.id, memberList).catch((error) => {
      setSystemMessage(spaceMessage, error.message, "error");
    });
  }

  return card;
}

function openSpaceDialog({ parent = null, space = null } = {}) {
  const creating = space === null;
  spaceEditForm.reset();
  spaceEditForm.elements.spaceId.value = space?.id ?? "";
  spaceEditForm.elements.parentId.value = parent?.id ?? "";
  spaceEditForm.elements.name.value = space?.name ?? "";
  spaceEditForm.elements.sortOrder.value = space?.sortOrder ?? 0;
  spaceEditForm.elements.description.value = space?.description ?? "";
  spaceEditForm.elements.archived.value = String(Boolean(space?.archived));
  spaceAccessModeField.hidden = !creating;
  spaceArchivedField.hidden = creating;
  spaceDialogTitle.textContent = creating
    ? (parent ? `在「${parent.name}」下新增子工作區` : "新增頂層工作區")
    : "編輯工作區";
  spaceDialogSubmit.textContent = creating ? "建立工作區" : "儲存變更";
  setSystemMessage(spaceEditMessage, "");
  spaceEditDialog.showModal();
  spaceEditForm.elements.name.focus();
}

async function loadSpaces() {
  spaceMessage.textContent = "";

  try {
    const response = await fetch("/api/spaces", {
      headers: { Accept: "application/json" },
    });
    const payload = await readJsonResponse(response);
    availableSpaces = payload.spaces;
    const previousSpaceId = selectedThreadSpaceId ?? threadSpaceFilter.value;
    const previousCreateSpaceId = threadSpaceSelect.value;
    const activeSpaces = orderedSpaces(payload.spaces.filter((space) => !space.archived));
    const visibleIds = new Set(activeSpaces.map((space) => space.id));
    const spaceOptions = activeSpaces
      .filter((space) => !space.archived)
      .map((space) => {
        const option = document.createElement("option");
        option.value = space.id;
        option.textContent = `${space.parentId && visibleIds.has(space.parentId) ? "↳ " : ""}${space.name}`;
        return option;
      });
    const allSpacesOption = document.createElement("option");
    allSpacesOption.value = "";
    allSpacesOption.textContent = "全部工作區";
    threadSpaceFilter.replaceChildren(allSpacesOption, ...spaceOptions.map((option) => option.cloneNode(true)));
    dashboardSpaceFilter.replaceChildren(allSpacesOption.cloneNode(true), ...spaceOptions.map((option) => option.cloneNode(true)));
    threadSpaceSelect.replaceChildren(...spaceOptions.map((option) => option.cloneNode(true)));
    if (payload.spaces.some((space) => space.id === previousSpaceId && !space.archived)) {
      threadSpaceFilter.value = previousSpaceId;
      selectedThreadSpaceId = previousSpaceId;
    } else {
      threadSpaceFilter.value = "";
      selectedThreadSpaceId = null;
    }
    if (payload.spaces.some((space) => space.id === previousCreateSpaceId && !space.archived)) {
      threadSpaceSelect.value = previousCreateSpaceId;
    }
    portalSpaceList.replaceChildren(...activeSpaces.map((space) => {
      const button = document.createElement("button");
      button.type = "button";
      const prefix = document.createElement("span");
      prefix.className = "workspace-prefix";
      prefix.setAttribute("aria-hidden", "true");
      prefix.textContent = "#";
      const unreadDot = document.createElement("span");
      unreadDot.className = "workspace-unread-dot";
      unreadDot.setAttribute("aria-label", "有未讀訊息");
      unreadDot.setAttribute("role", "img");
      unreadDot.hidden = true;
      const label = document.createElement("span");
      label.className = "workspace-label";
      label.textContent = space.name;
      button.append(prefix, unreadDot, label);
      button.classList.toggle("is-child-space-link", Boolean(space.parentId && visibleIds.has(space.parentId)));
      button.dataset.spaceId = space.id;
      button.addEventListener("click", () => showWorkspaceThreads(space.id));
      return button;
    }));
    if (!activeSpaces.length) {
      const empty = document.createElement("small");
      empty.textContent = "尚未加入工作區";
      portalSpaceList.append(empty);
    }
    updateUnreadWorkspaceLabels();
    if (selectedSidebarSpaceId && !activeSpaces.some((space) => space.id === selectedSidebarSpaceId)) {
      selectedSidebarSpaceId = null;
    }
    renderSpaceOverview();
    if (!discussionPanel.hidden) {
      const selectedSpace = activeSpaces.find((space) => space.id === selectedThreadSpaceId) ?? null;
      updateDiscussionHeading(selectedSpace);
      updateWorkspaceThreadNavigation(selectedThreadSpaceId);
    }
    for (const button of document.querySelectorAll("[data-open-thread-form]")) {
      button.disabled = !activeSpaces.length;
      button.title = activeSpaces.length ? "新增討論" : "加入工作區後才能新增討論";
    }
  } catch (error) {
    setSystemMessage(spaceMessage, error.message, "error");
  }
}

function createStatusChip(status) {
  const chip = document.createElement("span");
  chip.className = `status-chip${status.active ? "" : " is-inactive"}`;
  chip.textContent = `${status.sortOrder}. ${status.name}`;

  if (signedInUser.role === "admin") {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.title = "編輯狀態名稱與排序";
    editButton.textContent = "編輯";
    editButton.addEventListener("click", () => {
      statusEditForm.elements.statusId.value = status.id;
      statusEditForm.elements.name.value = status.name;
      statusEditForm.elements.sortOrder.value = status.sortOrder;
      statusEditDialog.showModal();
    });
    chip.append(editButton);

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.title = status.active ? "停用狀態" : "啟用狀態";
    toggleButton.textContent = status.active ? "×" : "↻";
    toggleButton.addEventListener("click", async () => {
      const response = await fetch(`/api/thread-statuses/${encodeURIComponent(status.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !status.active }),
      });
      await readJsonResponse(response);
      await loadStatuses();
    });
    chip.append(toggleButton);

    if (!status.active) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "delete-status-button";
      deleteButton.title = "永久刪除此狀態";
      deleteButton.textContent = "刪除";
      deleteButton.addEventListener("click", async () => {
        if (!window.confirm(`確定永久刪除「${status.name}」？`)) return;
        try {
          const response = await fetch(`/api/thread-statuses/${encodeURIComponent(status.id)}`, {
            method: "DELETE",
          });
          await readJsonResponse(response);
          await loadStatuses();
          setSystemMessage(discussionMessage, `已刪除討論狀態「${status.name}」。`);
        } catch (error) {
          setSystemMessage(discussionMessage, error.message, "error");
        }
      });
      chip.append(deleteButton);
    }
  }

  return chip;
}

async function loadStatuses() {
  const response = await fetch("/api/thread-statuses", {
    headers: { Accept: "application/json" },
  });
  const payload = await readJsonResponse(response);
  availableStatuses = payload.statuses;
  statusList.replaceChildren(...availableStatuses.map(createStatusChip));
  const selectedStatusId = threadStatusFilter.value;
  threadStatusFilter.replaceChildren();
  const allStatuses = document.createElement("option");
  allStatuses.value = "";
  allStatuses.textContent = "全部狀態";
  threadStatusFilter.append(allStatuses);
  for (const status of availableStatuses.filter((item) => item.active)) {
    const option = document.createElement("option");
    option.value = status.id;
    option.textContent = status.name;
    threadStatusFilter.append(option);
  }
  if ([...threadStatusFilter.options].some((option) => option.value === selectedStatusId)) {
    threadStatusFilter.value = selectedStatusId;
  }
  threadStatusSelect.replaceChildren();
  const noStatus = document.createElement("option");
  noStatus.value = "";
  noStatus.textContent = "無狀態";
  threadStatusSelect.append(noStatus);
  for (const status of availableStatuses.filter((item) => item.active)) {
    const option = document.createElement("option");
    option.value = status.id;
    option.textContent = status.name;
    threadStatusSelect.append(option);
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result).split(",")[1]));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

const acceptedAttachmentTypes = ".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip";

function createFilePicker(input, container) {
  let files = [];
  const render = () => {
    container.replaceChildren(...files.map((file, index) => {
      const row = document.createElement("div");
      row.className = "selected-attachment";
      const label = document.createElement("span");
      label.textContent = `${file.name} · ${Math.ceil(file.size / 1024)} KB`;
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "attachment-remove-button secondary-button";
      removeButton.textContent = "移除";
      removeButton.addEventListener("click", () => {
        files.splice(index, 1);
        render();
      });
      row.append(label, removeButton);
      return row;
    }));
    container.hidden = files.length === 0;
  };
  input.addEventListener("change", () => {
    for (const file of input.files) {
      if (!files.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) files.push(file);
    }
    input.value = "";
    render();
  });
  render();
  return Object.freeze({
    get files() { return [...files]; },
    reset() { files = []; input.value = ""; render(); },
  });
}

function createFileControl(label = "附加檔案") {
  const wrapper = document.createElement("div");
  wrapper.className = "message-file-control";
  const field = document.createElement("label");
  field.textContent = label;
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = acceptedAttachmentTypes;
  field.append(input);
  const selectedList = document.createElement("div");
  selectedList.className = "selected-attachment-list";
  wrapper.append(field, selectedList);
  return { element: wrapper, picker: createFilePicker(input, selectedList) };
}

const threadCreationFilePicker = createFilePicker(
  threadForm.elements.attachments,
  threadForm.querySelector("[data-selected-attachments]"),
);

async function uploadAttachments(threadId, files, replyId = null) {
  for (const file of files) {
    const response = await fetch(`/api/threads/${encodeURIComponent(threadId)}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentBase64: await fileToBase64(file),
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        replyId,
      }),
    });
    await readJsonResponse(response);
  }
}

async function deleteAttachments(attachmentIds) {
  for (const attachmentId of attachmentIds) {
    const response = await fetch(`/api/attachments/${encodeURIComponent(attachmentId)}`, { method: "DELETE" });
    await readJsonResponse(response);
  }
}

function renderAttachmentList(container, attachments, pendingRemovalIds = null) {
  container.replaceChildren(...attachments.map((attachment) => {
    const row = document.createElement("div");
    row.className = "attachment-row";
    const identity = document.createElement("span");
    identity.className = "attachment-identity";
    const icon = document.createElement("i");
    icon.className = "bi bi-paperclip";
    icon.setAttribute("aria-hidden", "true");
    const link = document.createElement("a");
    link.href = `/api/attachments/${encodeURIComponent(attachment.id)}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = attachment.fileName;
    const size = document.createElement("small");
    size.textContent = `${Math.ceil(attachment.fileSize / 1024)} KB`;
    identity.append(icon, link, size);
    row.append(identity);
    if (pendingRemovalIds) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "attachment-remove-button secondary-button";
      const updateRemovalState = () => {
        const pending = pendingRemovalIds.has(attachment.id);
        row.classList.toggle("is-pending-removal", pending);
        removeButton.textContent = pending ? "復原" : "移除";
      };
      removeButton.addEventListener("click", () => {
        if (pendingRemovalIds.has(attachment.id)) pendingRemovalIds.delete(attachment.id);
        else pendingRemovalIds.add(attachment.id);
        updateRemovalState();
      });
      updateRemovalState();
      row.append(removeButton);
    }
    return row;
  }));
  container.hidden = attachments.length === 0;
}

function createStatusSelect(selectedStatusId) {
  const select = document.createElement("select");
  select.name = "statusId";
  const noStatus = document.createElement("option");
  noStatus.value = "";
  noStatus.textContent = "無狀態";
  select.append(noStatus);
  for (const status of availableStatuses.filter((item) => item.active || item.id === selectedStatusId)) {
    const option = document.createElement("option");
    option.value = status.id;
    option.textContent = status.name;
    select.append(option);
  }
  select.value = selectedStatusId || "";
  return select;
}

const emojiPickerI18n = {
  categoriesLabel: "分類",
  emojiUnsupportedMessage: "此瀏覽器不支援彩色 Emoji。",
  favoritesLabel: "常用",
  loadingMessage: "載入中…",
  networkErrorMessage: "無法載入 Emoji。",
  regionLabel: "表情符號選擇器",
  searchDescription: "有搜尋結果時，可用上下方向鍵選取並按 Enter 套用。",
  searchLabel: "搜尋表情符號",
  searchResultsLabel: "搜尋結果",
  skinToneDescription: "展開後可用上下方向鍵選取並按 Enter 套用。",
  skinToneLabel: "選擇膚色，目前為 {skinTone}",
  skinTonesLabel: "膚色",
  skinTones: ["預設", "淺色", "中淺色", "中色", "中深色", "深色"],
  categories: {
    custom: "自訂",
    "smileys-emotion": "表情與情緒",
    "people-body": "人物與身體",
    "animals-nature": "動物與自然",
    "food-drink": "食物與飲料",
    "travel-places": "旅遊與地點",
    activities: "活動",
    objects: "物品",
    symbols: "符號",
    flags: "旗幟",
  },
};

function reactionMessageKey(messageType, messageId) {
  return `${messageType}:${messageId}`;
}

function summarizeReactionDocuments(documents) {
  const groups = new Map();
  for (const reaction of documents) {
    const group = groups.get(reaction.emoji) ?? {
      createdAt: reaction.createdAt?.toDate?.().toISOString?.() ?? reaction.createdAt ?? "",
      emoji: reaction.emoji,
      reactors: [],
    };
    group.reactors.push({ displayName: reaction.userDisplayName ?? "Unknown user", userId: reaction.userId });
    groups.set(reaction.emoji, group);
  }
  return [...groups.values()]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.emoji.localeCompare(right.emoji))
    .map(({ createdAt: _createdAt, emoji, reactors }) => ({
      count: reactors.length,
      emoji,
      reactedByCurrentUser: reactors.some((reactor) => reactor.userId === signedInUser?.id),
      reactors,
    }));
}

function updateReactionContainers(messageType, messageId, reactions) {
  const key = reactionMessageKey(messageType, messageId);
  for (const container of document.querySelectorAll(`[data-reaction-message-key="${CSS.escape(key)}"]`)) {
    renderReactionList(container, reactions);
  }
}

async function setReaction({ emoji, messageId, messageType, reacted, threadId }) {
  const response = await fetch(`/api/threads/${encodeURIComponent(threadId)}/reactions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emoji, messageId, messageType, reacted }),
  });
  const payload = await readJsonResponse(response);
  updateReactionContainers(messageType, messageId, payload.reactions);
  return payload.reactions;
}

function createAddReactionIcon() {
  const namespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(namespace, "svg");
  icon.setAttribute("class", "reaction-add-icon");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "1.7");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");

  for (const pathData of [
    "M15.2 3.9A8.5 8.5 0 1 0 19 10.4",
    "M7.6 14.4c1.6 1.8 4.8 1.8 6.4 0",
    "M18.5 1.5v6",
    "M15.5 4.5h6",
  ]) {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", pathData);
    icon.append(path);
  }

  for (const centerX of [8, 13]) {
    const eye = document.createElementNS(namespace, "circle");
    eye.setAttribute("cx", String(centerX));
    eye.setAttribute("cy", "10.3");
    eye.setAttribute("r", "0.65");
    eye.setAttribute("fill", "currentColor");
    eye.setAttribute("stroke", "none");
    icon.append(eye);
  }

  return icon;
}

function configureMessageIconAction(button, { accessibleLabel, tooltip }) {
  button.classList.add("message-icon-action");
  button.setAttribute("aria-label", accessibleLabel);
  button.dataset.tooltip = tooltip;
  return button;
}

function createAddReactionButton(target, compact = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = compact
    ? "reaction-add-button is-compact btn btn-quiet"
    : "reaction-action-button btn btn-quiet";
  configureMessageIconAction(button, { accessibleLabel: "新增表情符號", tooltip: "新增表情符號" });
  button.append(createAddReactionIcon());
  button.addEventListener("click", () => openEmojiPicker(button, target));
  return button;
}

function renderReactionList(container, reactions = []) {
  container.replaceChildren();
  container.hidden = reactions.length === 0;
  for (const reaction of reactions) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `reaction-chip${reaction.reactedByCurrentUser ? " is-selected" : ""}`;
    const reactorNames = reaction.reactors.map((reactor) => reactor.displayName).join("、");
    chip.setAttribute(
      "aria-label",
      `${reactorNames} 對此訊息標示 ${reaction.emoji}；點擊${reaction.reactedByCurrentUser ? "取消" : "加入"}`,
    );
    const emoji = document.createElement("span");
    emoji.className = "reaction-emoji";
    emoji.textContent = reaction.emoji;
    const count = document.createElement("span");
    count.className = "reaction-count";
    count.textContent = String(reaction.count);
    const tooltip = document.createElement("span");
    tooltip.className = "reaction-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.textContent = reactorNames;
    chip.append(emoji, count, tooltip);
    chip.addEventListener("click", async () => {
      chip.disabled = true;
      try {
        await setReaction({
          emoji: reaction.emoji,
          messageId: container.dataset.messageId,
          messageType: container.dataset.messageType,
          reacted: !reaction.reactedByCurrentUser,
          threadId: container.dataset.threadId,
        });
      } catch (error) {
        setSystemMessage(discussionMessage, error.message, "error");
        chip.disabled = false;
      }
    });
    container.append(chip);
  }
  if (reactions.length) {
    container.append(createAddReactionButton({
      messageId: container.dataset.messageId,
      messageType: container.dataset.messageType,
      threadId: container.dataset.threadId,
    }, true));
  }
}

function createReactionList(threadId, messageType, messageId, reactions = []) {
  const container = document.createElement("div");
  container.className = "reaction-list";
  container.dataset.messageId = messageId;
  container.dataset.messageType = messageType;
  container.dataset.reactionMessageKey = reactionMessageKey(messageType, messageId);
  container.dataset.threadId = threadId;
  renderReactionList(container, reactions);
  return container;
}

function closeEmojiPicker({ restoreFocus = true } = {}) {
  emojiPickerHost?.remove();
  emojiPickerHost = null;
  emojiPickerTarget = null;
  const trigger = emojiPickerTrigger;
  emojiPickerTrigger = null;
  trigger?.setAttribute("aria-expanded", "false");
  if (restoreFocus) trigger?.focus();
}

function positionEmojiPicker() {
  if (!emojiPickerHost || !emojiPickerTrigger) return;
  const margin = 8;
  const triggerRect = emojiPickerTrigger.getBoundingClientRect();
  const hostRect = emojiPickerHost.getBoundingClientRect();
  const left = Math.min(
    window.innerWidth - hostRect.width - margin,
    Math.max(margin, triggerRect.right - hostRect.width),
  );
  const below = triggerRect.bottom + margin;
  const top = below + hostRect.height <= window.innerHeight - margin
    ? below
    : Math.max(margin, triggerRect.top - hostRect.height - margin);
  emojiPickerHost.style.left = `${left}px`;
  emojiPickerHost.style.top = `${top}px`;
}

function applySlackInspiredEmojiPickerStyles(picker) {
  const style = document.createElement("style");
  style.textContent = `
    .picker {
      font-family: var(--bs-body-font-family, system-ui, sans-serif);
    }

    .pad-top {
      display: none;
    }

    .nav {
      order: 1;
      min-height: 43px;
      padding: 3px 8px 0;
      background: #fff;
    }

    .nav-button {
      min-width: 32px;
      border-radius: 6px;
    }

    .nav-emoji {
      filter: grayscale(0.15);
    }

    .indicator-wrapper {
      order: 2;
      margin: 0 8px;
      border-bottom-color: #ddd;
    }

    .search-row {
      order: 3;
      padding: 10px 13px 8px;
      background: #fff;
    }

    input.search {
      min-height: 38px;
      padding: 7px 11px;
      box-shadow: inset 0 0 0 1px transparent;
      transition: border-color 120ms ease, box-shadow 120ms ease;
    }

    input.search:focus {
      border-color: #1264a3;
      box-shadow: 0 0 0 1px #1264a3;
      outline: 0;
    }

    .skintone-button-wrapper {
      margin-inline-start: 6px;
      border-radius: 6px;
    }

    .message {
      order: 4;
    }

    .tabpanel {
      order: 5;
      padding: 0 7px 6px;
      scrollbar-color: #868686 transparent;
      scrollbar-width: thin;
    }

    .category {
      position: sticky;
      z-index: 1;
      top: 0;
      padding: 8px 7px 5px;
      background: #fff;
      font-size: 0.82rem;
      font-weight: 700;
    }

    .emoji {
      border-radius: 6px;
    }

    .favorites {
      order: 6;
      min-height: 48px;
      padding: 3px 8px;
      background: #fafafa;
      scrollbar-width: thin;
    }
  `;
  picker.shadowRoot?.append(style);
}

async function openEmojiPicker(trigger, target) {
  if (emojiPickerTrigger === trigger) {
    closeEmojiPicker();
    return;
  }
  closeEmojiPicker({ restoreFocus: false });
  emojiPickerTrigger = trigger;
  emojiPickerTarget = target;
  trigger.setAttribute("aria-expanded", "true");
  try {
    const { default: Picker } = await import("/vendor/emoji-picker/picker.js");
    if (emojiPickerTrigger !== trigger) return;
    const host = document.createElement("div");
    host.className = "emoji-picker-popover";
    host.setAttribute("role", "dialog");
    host.setAttribute("aria-label", "選擇表情符號");
    const picker = new Picker({
      dataSource: "/vendor/emoji-data.json",
      i18n: emojiPickerI18n,
      locale: "zh-Hant",
    });
    applySlackInspiredEmojiPickerStyles(picker);
    picker.addEventListener("emoji-click", async (event) => {
      const selectedEmoji = event.detail.unicode ?? event.detail.emoji?.emoji;
      const selectedTarget = emojiPickerTarget;
      closeEmojiPicker();
      if (!selectedEmoji || !selectedTarget) return;
      try {
        await setReaction({ ...selectedTarget, emoji: selectedEmoji, reacted: true });
      } catch (error) {
        setSystemMessage(discussionMessage, error.message, "error");
      }
    });
    host.append(picker);
    document.body.append(host);
    emojiPickerHost = host;
    positionEmojiPicker();
    window.requestAnimationFrame(positionEmojiPicker);
  } catch (error) {
    closeEmojiPicker();
    setSystemMessage(discussionMessage, `無法載入表情符號選擇器：${error.message}`, "error");
  }
}

async function ensureFirebaseRealtimeContext() {
  if (runtimeConfig?.authProvider !== "firebase") return null;
  if (firebaseRealtimeContext) return firebaseRealtimeContext;
  const [{ initializeApp }, authModule, firestoreModule] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js"),
  ]);
  const app = initializeApp(runtimeConfig.firebase);
  const auth = authModule.getAuth(app);
  await authModule.setPersistence(auth, authModule.inMemoryPersistence);
  const tokenResponse = await fetch("/api/auth/firebase-client-token", { method: "POST" });
  const { token } = await readJsonResponse(tokenResponse);
  await authModule.signInWithCustomToken(auth, token);
  firebaseRealtimeContext = {
    auth,
    db: firestoreModule.getFirestore(app),
    modules: { ...authModule, ...firestoreModule },
  };
  return firebaseRealtimeContext;
}

function stopReactionRealtime() {
  reactionRealtimeGeneration += 1;
  for (const unsubscribe of reactionListenerUnsubscribers) unsubscribe();
  reactionListenerUnsubscribers = [];
  realtimeReactionDocuments.clear();
}

function applyRealtimeReactionChanges(snapshot) {
  const affectedMessages = new Set();
  for (const change of snapshot.docChanges()) {
    const previous = realtimeReactionDocuments.get(change.doc.ref.path);
    if (previous) affectedMessages.add(reactionMessageKey(previous.messageType, previous.messageId));
    if (change.type === "removed") {
      realtimeReactionDocuments.delete(change.doc.ref.path);
    } else {
      const reaction = change.doc.data();
      realtimeReactionDocuments.set(change.doc.ref.path, reaction);
      affectedMessages.add(reactionMessageKey(reaction.messageType, reaction.messageId));
    }
  }
  for (const key of affectedMessages) {
    const [messageType, messageId] = key.split(":");
    const documents = [...realtimeReactionDocuments.values()]
      .filter((reaction) => reaction.messageType === messageType && reaction.messageId === messageId);
    updateReactionContainers(messageType, messageId, summarizeReactionDocuments(documents));
  }
}

async function startReactionRealtime(threads) {
  stopReactionRealtime();
  const generation = reactionRealtimeGeneration;
  if (!threads.length) return;
  if (!runtimeConfig) await loadRuntimeConfig();
  const context = await ensureFirebaseRealtimeContext();
  if (!context || generation !== reactionRealtimeGeneration) return;
  const threadsBySpace = new Map();
  for (const thread of threads) {
    const ids = threadsBySpace.get(thread.spaceId) ?? [];
    ids.push(thread.id);
    threadsBySpace.set(thread.spaceId, ids);
  }
  for (const [spaceId, threadIds] of threadsBySpace) {
    for (let index = 0; index < threadIds.length; index += 30) {
      const ids = threadIds.slice(index, index + 30);
      const source = context.modules.collection(context.db, "spaces", spaceId, "messageReactions");
      const reactionQuery = context.modules.query(source, context.modules.where("threadId", "in", ids));
      reactionListenerUnsubscribers.push(context.modules.onSnapshot(
        reactionQuery,
        applyRealtimeReactionChanges,
        (error) => setSystemMessage(discussionMessage, `Reaction 即時同步已中斷：${error.message}`, "error"),
      ));
    }
  }
}

function createReplyComposer(thread, { parentReplyId = null, onCancel, onComplete }) {
  const form = document.createElement("form");
  form.className = `message-composer${parentReplyId ? " nested-reply-composer" : ""}`;
  const textarea = document.createElement("textarea");
  textarea.name = "content";
  textarea.rows = 4;
  textarea.required = true;
  textarea.placeholder = parentReplyId ? "回覆這則訊息" : "新增回覆";
  const fileControl = createFileControl();
  const actions = document.createElement("div");
  actions.className = "message-form-actions";
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "secondary-button";
  cancelButton.textContent = "取消";
  cancelButton.addEventListener("click", onCancel);
  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.textContent = "回覆";
  actions.append(cancelButton, submitButton);
  form.append(textarea, fileControl.element, actions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    try {
      const response = await fetch(`/api/threads/${encodeURIComponent(thread.id)}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: textarea.value, parentReplyId }),
      });
      const payload = await readJsonResponse(response);
      await uploadAttachments(thread.id, fileControl.picker.files, payload.reply.id);
      textarea.value = "";
      fileControl.picker.reset();
      await onComplete();
    } catch (error) {
      setSystemMessage(discussionMessage, error.message, "error");
    } finally {
      submitButton.disabled = false;
    }
  });
  return { element: form, focus: () => textarea.focus() };
}

function renderReplyTree(thread, replies, attachments, container, onRefresh) {
  const childrenByParent = new Map();
  const knownReplyIds = new Set(replies.map((reply) => reply.id));
  for (const reply of replies) {
    const parentId = knownReplyIds.has(reply.parentReplyId) ? reply.parentReplyId : null;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(reply);
    childrenByParent.set(parentId, siblings);
  }

  const createReplyItem = (reply, ancestry = new Set()) => {
    const item = document.createElement("li");
    item.className = "reply-item";
    const message = document.createElement("div");
    message.className = "reply-message";
    message.dataset.messageKey = unreadMessageKey("reply", reply.id);
    const authorMeta = createAuthorMetadata(reply);
    const replyIsUnread = unreadMessageKeys.has(unreadMessageKey("reply", reply.id));
    observeUnreadMessage(message, "reply", reply.id, thread.id);
    const content = document.createElement("p");
    content.className = "reply-content";
    content.textContent = reply.content;
    const replyAttachments = attachments.filter((attachment) => attachment.replyId === reply.id);
    const attachmentList = document.createElement("div");
    attachmentList.className = "attachment-list reply-attachment-list";
    renderAttachmentList(attachmentList, replyAttachments);
    const reactionList = createReactionList(thread.id, "reply", reply.id, reply.reactions);
    const actions = document.createElement("div");
    actions.className = "reply-message-actions";
    actions.append(createAddReactionButton({ messageId: reply.id, messageType: "reply", threadId: thread.id }));
    const replyButton = document.createElement("button");
    replyButton.type = "button";
    replyButton.className = "reply-inline-action btn btn-quiet";
    configureMessageIconAction(replyButton, { accessibleLabel: "回覆這則訊息", tooltip: "回覆" });
    const replyIcon = document.createElement("i");
    replyIcon.className = "bi bi-chat-left-text";
    replyIcon.setAttribute("aria-hidden", "true");
    replyButton.append(replyIcon);
    actions.append(replyButton);
    const canEditReply = signedInUser.id === reply.authorId;
    if (canEditReply) {
      const separator = document.createElement("span");
      separator.className = "reply-action-separator";
      separator.textContent = "|";
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "reply-inline-action";
      editButton.textContent = "編輯";
      actions.append(separator, editButton);
      editButton.addEventListener("click", () => {
        if (item.querySelector(":scope > .message-edit-form")) return;
        message.hidden = true;
        const pendingRemovalIds = new Set();
        const form = document.createElement("form");
        form.className = "message-edit-form";
        const textarea = document.createElement("textarea");
        textarea.name = "content";
        textarea.rows = 4;
        textarea.required = true;
        textarea.value = reply.content;
        const existingAttachments = document.createElement("div");
        existingAttachments.className = "attachment-list editable-attachment-list";
        renderAttachmentList(existingAttachments, replyAttachments, pendingRemovalIds);
        const fileControl = createFileControl("新增附加檔案");
        const formActions = document.createElement("div");
        formActions.className = "message-form-actions";
        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "secondary-button";
        cancelButton.textContent = "取消";
        cancelButton.addEventListener("click", () => {
          form.remove();
          message.hidden = false;
        });
        const saveButton = document.createElement("button");
        saveButton.type = "submit";
        saveButton.textContent = "儲存變更";
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "delete-thread-button";
        deleteButton.textContent = "刪除回覆";
        deleteButton.addEventListener("click", async () => {
          if (!window.confirm("確定刪除此回覆嗎？刪除後不會顯示在畫面上，但資料仍會保留。")) return;
          deleteButton.disabled = true;
          try {
            const response = await fetch(`/api/threads/${encodeURIComponent(thread.id)}/replies/${encodeURIComponent(reply.id)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ deleted: true }),
            });
            await readJsonResponse(response);
            await onRefresh();
            setSystemMessage(discussionMessage, "回覆已刪除。資料仍會保留。");
          } catch (error) {
            setSystemMessage(discussionMessage, error.message, "error");
            deleteButton.disabled = false;
          }
        });
        formActions.append(deleteButton, cancelButton, saveButton);
        form.append(textarea, existingAttachments, fileControl.element, formActions);
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          saveButton.disabled = true;
          try {
            const response = await fetch(`/api/threads/${encodeURIComponent(thread.id)}/replies/${encodeURIComponent(reply.id)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: textarea.value }),
            });
            await readJsonResponse(response);
            await deleteAttachments(pendingRemovalIds);
            await uploadAttachments(thread.id, fileControl.picker.files, reply.id);
            await onRefresh();
          } catch (error) {
            setSystemMessage(discussionMessage, error.message, "error");
            saveButton.disabled = false;
          }
        });
        item.insertBefore(form, message.nextSibling);
        textarea.focus();
      });
    }
    const unreadMenu = document.createElement("details");
    unreadMenu.className = "reply-action-menu";
    const unreadMenuToggle = document.createElement("summary");
    unreadMenuToggle.className = "reply-menu-toggle btn btn-quiet";
    unreadMenuToggle.setAttribute("role", "button");
    unreadMenuToggle.setAttribute("aria-haspopup", "menu");
    unreadMenuToggle.setAttribute("aria-label", "更多回覆操作");
    unreadMenuToggle.title = "更多操作";
    const unreadMenuIcon = document.createElement("i");
    unreadMenuIcon.className = "bi bi-three-dots";
    unreadMenuIcon.setAttribute("aria-hidden", "true");
    unreadMenuToggle.append(unreadMenuIcon);
    const unreadMenuList = document.createElement("div");
    unreadMenuList.className = "reply-menu-list";
    unreadMenuList.setAttribute("role", "menu");
    const unreadButton = document.createElement("button");
    unreadButton.type = "button";
    unreadButton.className = "reply-menu-item btn btn-quiet";
    unreadButton.setAttribute("role", "menuitem");
    unreadButton.textContent = "設定未讀取";
    unreadButton.addEventListener("click", async () => {
      unreadMenu.removeAttribute("open");
      unreadButton.disabled = true;
      try {
        await setMessageUnread("reply", reply.id, thread.id);
      } catch (error) {
        setSystemMessage(discussionMessage, error.message, "error");
      } finally {
        unreadButton.disabled = false;
      }
    });
    unreadMenuList.append(unreadButton);
    unreadMenu.append(unreadMenuToggle, unreadMenuList);
    unreadMenu.addEventListener("toggle", () => unreadMenuToggle.setAttribute("aria-expanded", String(unreadMenu.open)));
    actions.append(unreadMenu);
    if (replyIsUnread) actions.append(createUnreadDot());
    message.append(authorMeta, content, attachmentList, reactionList, actions);
    const composerHost = document.createElement("div");
    composerHost.className = "nested-composer-host";
    replyButton.addEventListener("click", () => {
      composerHost.replaceChildren();
      const composer = createReplyComposer(thread, {
        parentReplyId: reply.id,
        onCancel: () => composerHost.replaceChildren(),
        onComplete: onRefresh,
      });
      composerHost.append(composer.element);
      composer.focus();
    });
    item.append(message);
    const childReplies = (childrenByParent.get(reply.id) ?? []).filter((child) => !ancestry.has(child.id));
    if (childReplies.length) {
      const childList = document.createElement("ul");
      childList.className = "reply-children";
      const nextAncestry = new Set(ancestry).add(reply.id);
      childList.append(...childReplies.map((child) => createReplyItem(child, nextAncestry)));
      item.append(childList);
    }
    item.append(composerHost);
    return item;
  };

  container.replaceChildren(...(childrenByParent.get(null) ?? []).map((reply) => createReplyItem(reply)));
  container.hidden = replies.length === 0;
}

function createThreadCard(thread) {
  const card = document.createElement("article");
  card.className = `thread-card${thread.pinned ? " is-pinned" : ""}${thread.archived ? " is-archived" : ""}`;
  card.dataset.messageKey = unreadMessageKey("thread", thread.id);
  const display = document.createElement("div");
  display.className = "thread-display";
  const header = document.createElement("div");
  header.className = "thread-card-header";
  const titleGroup = document.createElement("div");
  titleGroup.className = "thread-title-group";
  const titleLine = document.createElement("div");
  titleLine.className = "thread-title-line";
  const title = document.createElement("h3");
  title.textContent = thread.title;
  const threadIsUnread = unreadMessageKeys.has(unreadMessageKey("thread", thread.id));
  titleLine.append(title, createAuthorMetadata(thread));
  const status = availableStatuses.find((item) => item.id === thread.statusId);
  const meta = document.createElement("span");
  meta.className = "thread-meta";
  meta.textContent = [
    status?.name ?? "無狀態",
    ...(thread.bookmarked ? ["已加入書籤"] : []),
    ...(thread.pinned ? ["置頂"] : []),
  ].join(" · ");
  titleGroup.append(titleLine, meta);

  const headerActions = document.createElement("div");
  headerActions.className = "thread-header-actions";
  headerActions.setAttribute("role", "toolbar");
  headerActions.setAttribute("aria-label", `${thread.title} 的討論操作`);
  const replyAction = document.createElement("button");
  replyAction.type = "button";
  replyAction.className = "thread-header-button btn btn-quiet";
  configureMessageIconAction(replyAction, { accessibleLabel: `回覆「${thread.title}」`, tooltip: "回覆" });
  const replyIcon = document.createElement("i");
  replyIcon.className = "bi bi-chat-left-text";
  replyIcon.setAttribute("aria-hidden", "true");
  replyAction.append(replyIcon);

  const reactionAction = createAddReactionButton({ messageId: thread.id, messageType: "thread", threadId: thread.id });

  const actionSeparator = document.createElement("span");
  actionSeparator.className = "thread-action-separator";
  actionSeparator.setAttribute("aria-hidden", "true");
  const actionMenu = document.createElement("details");
  actionMenu.className = "thread-action-menu";
  const actionMenuToggle = document.createElement("summary");
  actionMenuToggle.className = "thread-menu-toggle btn btn-quiet";
  actionMenuToggle.setAttribute("role", "button");
  actionMenuToggle.setAttribute("aria-haspopup", "menu");
  actionMenuToggle.setAttribute("aria-expanded", "false");
  actionMenuToggle.setAttribute("aria-label", `開啟「${thread.title}」的更多操作`);
  actionMenuToggle.setAttribute("title", "更多操作");
  const moreIcon = document.createElement("i");
  moreIcon.className = "bi bi-three-dots";
  moreIcon.setAttribute("aria-hidden", "true");
  actionMenuToggle.append(moreIcon);
  const actionMenuList = document.createElement("div");
  actionMenuList.className = "thread-menu-list";
  actionMenuList.setAttribute("role", "menu");
  const addMenuItem = (label, iconClass, action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "thread-menu-item btn btn-quiet";
    button.setAttribute("role", "menuitem");
    const icon = document.createElement("i");
    icon.className = `bi ${iconClass}`;
    icon.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = label;
    button.append(icon, text);
    button.addEventListener("click", async () => {
      actionMenu.removeAttribute("open");
      button.disabled = true;
      try { await action(); } catch (error) { setSystemMessage(discussionMessage, error.message, "error"); } finally { button.disabled = false; }
    });
    actionMenuList.append(button);
  };

  let threadAttachments = [];
  let detailsReady;
  if (signedInUser.role === "admin" || signedInUser.id === thread.authorId) addMenuItem("編輯", "bi-pencil", () => openThreadEditor());
  addMenuItem("設定未讀取", "bi-envelope", () => setMessageUnread("thread", thread.id, thread.id));
  const toggleBookmark = async () => {
    const response = await fetch(`/api/threads/${encodeURIComponent(thread.id)}/bookmark`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookmarked: !thread.bookmarked }),
    });
    await readJsonResponse(response);
    setSystemMessage(discussionMessage, thread.bookmarked ? "已移除個人書籤。" : "已加入個人書籤。");
    await loadThreads();
  };
  if (thread.bookmarked) {
    addMenuItem("移除書籤", "bi-bookmark-fill", toggleBookmark);
  } else {
    addMenuItem("加入書籤", "bi-bookmark", toggleBookmark);
  }
  if (signedInUser.role === "admin") {
    for (const [label, field, iconClass] of [
      [thread.pinned ? "取消置頂" : "置頂", "pinned", thread.pinned ? "bi-pin-angle-fill" : "bi-pin-angle"],
      [thread.archived ? "取消封存" : "封存", "archived", "bi-archive"],
    ]) addMenuItem(label, iconClass, async () => {
      const response = await fetch(`/api/threads/${encodeURIComponent(thread.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: !thread[field] }),
      });
      await readJsonResponse(response);
      await loadThreads();
    });
  }
  actionMenu.append(actionMenuToggle, actionMenuList);
  actionMenu.addEventListener("toggle", () => actionMenuToggle.setAttribute("aria-expanded", String(actionMenu.open)));
  headerActions.append(reactionAction, replyAction, actionSeparator, actionMenu);
  if (threadIsUnread) headerActions.append(createUnreadDot());
  header.append(titleGroup, headerActions);
  const body = document.createElement("p");
  body.className = "thread-body";
  body.textContent = thread.content;
  const attachmentList = document.createElement("div");
  attachmentList.className = "attachment-list thread-attachment-list";
  const reactionList = createReactionList(thread.id, "thread", thread.id, thread.reactions);
  const replyList = document.createElement("ul");
  replyList.className = "reply-list";
  const topComposer = createReplyComposer(thread, {
    onCancel: () => { topComposer.element.hidden = true; },
    onComplete: async () => { topComposer.element.hidden = true; await refreshDetails(); },
  });
  topComposer.element.hidden = true;
  replyAction.addEventListener("click", () => {
    topComposer.element.hidden = false;
    topComposer.focus();
  });
  display.append(header, body, attachmentList, reactionList, replyList, topComposer.element);
  card.append(display);
  observeUnreadMessage(card, "thread", thread.id, thread.id);

  async function refreshDetails() {
    const [detailsResponse, attachmentsResponse] = await Promise.all([
      fetch(`/api/threads/${encodeURIComponent(thread.id)}`),
      fetch(`/api/threads/${encodeURIComponent(thread.id)}/attachments`),
    ]);
    const detailsPayload = await readJsonResponse(detailsResponse);
    const attachmentsPayload = await readJsonResponse(attachmentsResponse);
    threadAttachments = attachmentsPayload.attachments.filter((attachment) => !attachment.replyId);
    renderAttachmentList(attachmentList, threadAttachments);
    renderReactionList(reactionList, detailsPayload.thread.reactions);
    renderReplyTree(thread, detailsPayload.replies, attachmentsPayload.attachments, replyList, refreshDetails);
  }

  async function openThreadEditor() {
    if (card.querySelector(":scope > .thread-inline-editor")) return;
    await detailsReady;
    display.hidden = true;
    const pendingRemovalIds = new Set();
    const form = document.createElement("form");
    form.className = "message-edit-form thread-inline-editor";
    const heading = document.createElement("h3");
    heading.textContent = "編輯討論";
    const titleField = document.createElement("label");
    titleField.textContent = "標題";
    const titleInput = document.createElement("input");
    titleInput.name = "title";
    titleInput.required = true;
    titleInput.maxLength = 120;
    titleInput.value = thread.title;
    titleField.append(titleInput);
    const statusField = document.createElement("label");
    statusField.textContent = "狀態";
    statusField.append(createStatusSelect(thread.statusId));
    const contentField = document.createElement("label");
    contentField.textContent = "內容";
    const contentInput = document.createElement("textarea");
    contentInput.name = "content";
    contentInput.rows = 6;
    contentInput.required = true;
    contentInput.value = thread.content;
    contentField.append(contentInput);
    const existingAttachments = document.createElement("div");
    existingAttachments.className = "attachment-list editable-attachment-list";
    renderAttachmentList(existingAttachments, threadAttachments, pendingRemovalIds);
    const fileControl = createFileControl("新增附加檔案");
    const formActions = document.createElement("div");
    formActions.className = "message-form-actions";
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "secondary-button";
    cancelButton.textContent = "取消";
    cancelButton.addEventListener("click", () => { form.remove(); display.hidden = false; });
    const saveButton = document.createElement("button");
    saveButton.type = "submit";
    saveButton.textContent = "儲存變更";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-thread-button";
    deleteButton.textContent = "刪除討論";
    deleteButton.addEventListener("click", async () => {
      if (!window.confirm("確定刪除此討論嗎？刪除後不會顯示在畫面上，但資料仍會保留。")) return;
      deleteButton.disabled = true;
      try {
        const response = await fetch(`/api/threads/${encodeURIComponent(thread.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deleted: true }),
        });
        await readJsonResponse(response);
        await loadDashboard();
        await loadThreads();
        setSystemMessage(discussionMessage, "討論已刪除。資料仍會保留。");
      } catch (error) {
        setSystemMessage(discussionMessage, error.message, "error");
        deleteButton.disabled = false;
      }
    });
    formActions.append(deleteButton, cancelButton, saveButton);
    form.append(heading, titleField, statusField, contentField, existingAttachments, fileControl.element, formActions);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      saveButton.disabled = true;
      try {
        const formData = new FormData(form);
        const response = await fetch(`/api/threads/${encodeURIComponent(thread.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: formData.get("content"), statusId: formData.get("statusId") || null, title: formData.get("title") }),
        });
        await readJsonResponse(response);
        await deleteAttachments(pendingRemovalIds);
        await uploadAttachments(thread.id, fileControl.picker.files);
        await loadDashboard();
        await loadThreads();
        setSystemMessage(discussionMessage, "討論資料已更新。");
      } catch (error) {
        setSystemMessage(discussionMessage, error.message, "error");
        saveButton.disabled = false;
      }
    });
    card.append(form);
    titleInput.focus();
  }

  detailsReady = refreshDetails();
  detailsReady.catch((error) => { setSystemMessage(discussionMessage, error.message, "error"); });
  return card;
}

function setThreadSource(sourceUrl = null, emptyMessage = "目前沒有符合條件的討論串。") {
  threadSourceUrl = sourceUrl;
  threadEmptyMessage = emptyMessage;
}

async function loadThreads() {
  discussionMessage.textContent = "";
  const selectedSpaceId = threadSpaceFilter.value;
  const selectedStatusId = threadStatusFilter.value;
  try {
    const url = threadSourceUrl ?? (selectedSpaceId ? `/api/threads?spaceId=${encodeURIComponent(selectedSpaceId)}` : "/api/threads");
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    const payload = await readJsonResponse(response);
    const threads = selectedStatusId
      ? payload.threads.filter((thread) => thread.statusId === selectedStatusId)
      : payload.threads;
    threadList.replaceChildren(...threads.map(createThreadCard));
    void startReactionRealtime(threads).catch((error) => {
      setSystemMessage(discussionMessage, `Reaction 即時同步無法啟動：${error.message}`, "error");
    });
    if (!threads.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = threadEmptyMessage;
      threadList.append(empty);
    }
  } catch (error) {
    stopReactionRealtime();
    setSystemMessage(discussionMessage, error.message, "error");
  }
}

async function loadDiscussion() {
  await loadStatuses();
  await loadDashboard();
  await loadThreads();
}

function showUser(user) {
  resetPortalData();
  signedInUser = user;
  portalAvatar.textContent = userInitials(user.displayName);
  portalUserName.textContent = user.displayName;
  portalUserRole.textContent = user.role;
  signedOutView.hidden = true;
  authCard.hidden = true;
  portalShell.hidden = false;
  document.body.classList.add("portal-active");
  portalAdminNav.hidden = user.role !== "admin";
  userAdmin.hidden = user.role !== "admin";
  createRootSpaceButton.hidden = user.role !== "admin";
  statusForm.hidden = user.role !== "admin";
  updateDiscussionHeading();
  showPortalView("discussions");
  updateWorkspaceThreadNavigation();

  const initialize = async () => {
    if (user.role === "admin") await loadUsers();
    await loadSpaces();
    await loadUnreadSummary();
    await loadDiscussion();
  };
  initialize().catch((error) => {
    setSystemMessage(discussionMessage, error.message, "error");
  });
}

function showLogin() {
  resetPortalData();
  signedOutView.hidden = false;
  loginForm.hidden = false;
  forgotPasswordForm.hidden = true;
  forgotPasswordMessage.textContent = "";
  authCard.hidden = false;
  portalShell.hidden = true;
  document.body.classList.remove("portal-active");
  userAdmin.hidden = true;
  signedInUser = null;
  for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
}

async function readJsonResponse(response) {
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "要求失敗，請稍後再試。");
  }

  return payload;
}

async function loadRuntimeConfig() {
  const response = await fetch("/api/config", { headers: { Accept: "application/json" } });
  runtimeConfig = await readJsonResponse(response);
  if (runtimeConfig.authProvider !== "firebase") {
    loginForm.elements.email.value = "admin@koino.local";
    loginForm.elements.password.value = "PocAdmin123!";
  }
}

loadRuntimeConfig().catch((error) => {
  setSystemMessage(loginMessage, error.message, "error");
});

async function restoreSession() {
  const response = await fetch("/api/auth/me", {
    headers: { Accept: "application/json" },
  });

  if (response.ok) {
    const payload = await response.json();
    showUser(payload.user);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "";
  const formData = new FormData(loginForm);

  try {
    if (!runtimeConfig) {
      await loadRuntimeConfig();
    }
    let endpoint = "/api/auth/login";
    let requestBody = {
      email: formData.get("email"),
      password: formData.get("password"),
    };
    if (runtimeConfig.authProvider === "firebase") {
      const firebaseResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(runtimeConfig.firebase.apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...requestBody, returnSecureToken: true }),
        },
      );
      const firebasePayload = await firebaseResponse.json();
      if (!firebaseResponse.ok) {
        throw new Error("Firebase Email 或密碼不正確。");
      }
      endpoint = "/api/auth/firebase-session";
      requestBody = { idToken: firebasePayload.idToken };
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
    const payload = await readJsonResponse(response);
    loginForm.reset();
    showUser(payload.user);
  } catch (error) {
    setSystemMessage(loginMessage, error.message, "error");
  }
});

forgotPasswordButton.addEventListener("click", () => {
  forgotPasswordForm.elements.email.value = loginForm.elements.email.value;
  forgotPasswordMessage.textContent = "";
  loginForm.hidden = true;
  forgotPasswordForm.hidden = false;
  forgotPasswordForm.elements.email.focus();
});

cancelForgotPassword.addEventListener("click", () => {
  forgotPasswordForm.hidden = true;
  loginForm.hidden = false;
  loginForm.elements.email.focus();
});

forgotPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  forgotPasswordMessage.textContent = "";
  const email = new FormData(forgotPasswordForm).get("email");

  try {
    if (!runtimeConfig) await loadRuntimeConfig();
    if (runtimeConfig.authProvider !== "firebase") {
      throw new Error("本機模式無法寄送重設信，請聯絡系統管理員。");
    }
    await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(runtimeConfig.firebase.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, requestType: "PASSWORD_RESET" }),
      },
    );
    setSystemMessage(forgotPasswordMessage, "若此 Email 已註冊，密碼重設信將寄至信箱。");
  } catch (error) {
    setSystemMessage(forgotPasswordMessage, error.message, "error");
  }
});

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  showLogin();
}

portalLogoutButton.addEventListener("click", logout);

statusForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(statusForm);
  try {
    const response = await fetch("/api/thread-statuses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        sortOrder: Number.parseInt(formData.get("sortOrder"), 10),
      }),
    });
    await readJsonResponse(response);
    statusForm.reset();
    await loadStatuses();
  } catch (error) {
    setSystemMessage(discussionMessage, error.message, "error");
  }
});

statusEditForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(statusEditForm);
  try {
    const response = await fetch(`/api/thread-statuses/${encodeURIComponent(formData.get("statusId"))}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        sortOrder: Number.parseInt(formData.get("sortOrder"), 10),
      }),
    });
    await readJsonResponse(response);
    statusEditDialog.close();
    await loadStatuses();
    await loadThreads();
    setSystemMessage(discussionMessage, "討論狀態已更新。");
  } catch (error) {
    setSystemMessage(discussionMessage, error.message, "error");
  }
});

spaceEditForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(spaceEditForm);
  const submitButton = spaceEditForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setSystemMessage(spaceEditMessage, "");
  try {
    const spaceId = formData.get("spaceId");
    const creating = !spaceId;
    const response = await fetch(creating ? "/api/spaces" : `/api/spaces/${encodeURIComponent(spaceId)}`, {
      method: creating ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creating
        ? {
          accessMode: formData.get("accessMode"),
          description: formData.get("description"),
          name: formData.get("name"),
          parentId: formData.get("parentId") || null,
          sortOrder: Number.parseInt(formData.get("sortOrder"), 10),
        }
        : {
          archived: formData.get("archived") === "true",
          description: formData.get("description"),
          name: formData.get("name"),
          sortOrder: Number.parseInt(formData.get("sortOrder"), 10),
        }),
    });
    await readJsonResponse(response);
    spaceEditDialog.close();
    await loadSpaces();
    if (!discussionPanel.hidden) await loadThreads();
    setSystemMessage(spaceMessage, creating ? "工作區已建立。" : "工作區已更新。");
  } catch (error) {
    setSystemMessage(spaceEditMessage, error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
});

createRootSpaceButton.addEventListener("click", () => openSpaceDialog());

threadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(threadForm);
  const submitButton = threadForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const response = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: formData.get("content"),
        spaceId: formData.get("spaceId"),
        statusId: formData.get("statusId") || null,
        title: formData.get("title"),
      }),
    });
    const payload = await readJsonResponse(response);
    await uploadAttachments(payload.thread.id, threadCreationFilePicker.files);
    threadForm.reset();
    threadCreationFilePicker.reset();
    threadForm.hidden = true;
    await loadDashboard();
    await loadThreads();
    setSystemMessage(discussionMessage, "討論已建立。");
  } catch (error) {
    setSystemMessage(discussionMessage, error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
});

for (const button of document.querySelectorAll("[data-close-dialog]")) {
  button.addEventListener("click", () => button.closest("dialog").close());
}

portalProfileButton.addEventListener("click", () => {
  profileForm.reset();
  profileForm.elements.displayName.value = signedInUser.displayName;
  profileMessage.textContent = "";
  profileDialog.showModal();
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  profileMessage.textContent = "";
  const formData = new FormData(profileForm);
  const password = formData.get("password");
  const passwordConfirmation = formData.get("passwordConfirmation");

  if (password !== passwordConfirmation) {
    setSystemMessage(profileMessage, "兩次輸入的新密碼不一致。", "error");
    return;
  }

  const submitButton = profileForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  try {
    const response = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        displayName: formData.get("displayName"),
        ...(password ? { password } : {}),
      }),
    });
    const payload = await readJsonResponse(response);
    signedInUser = payload.user;
    portalAvatar.textContent = userInitials(payload.user.displayName);
    portalUserName.textContent = payload.user.displayName;
    profileForm.elements.password.value = "";
    profileForm.elements.passwordConfirmation.value = "";
    setSystemMessage(profileMessage, "個人資料已更新。");
    if (signedInUser.role === "admin") await loadUsers();
  } catch (error) {
    setSystemMessage(profileMessage, error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
});

threadSpaceFilter.addEventListener("change", () => showWorkspaceThreads(threadSpaceFilter.value || null));
threadStatusFilter.addEventListener("change", () => loadThreads());
dashboardSpaceFilter.addEventListener("change", () => loadDashboard());
portalAllSpaces.addEventListener("click", () => showWorkspaceThreads());

for (const button of document.querySelectorAll("[data-portal-target]")) {
  button.addEventListener("click", async () => {
    const viewName = button.dataset.portalTarget;
    if (viewName === "spaces") {
      showSpaceOverview();
      return;
    }
    showPortalView(viewName);
    if (viewName === "home") await loadDashboard();
    if (viewName === "discussions") {
      await showWorkspaceThreads();
    }
  });
}

for (const button of document.querySelectorAll("[data-open-thread-form]")) {
  button.addEventListener("click", async () => {
    if (discussionPanel.hidden) await showWorkspaceThreads(dashboardSpaceFilter.value || null);
    if (threadSpaceFilter.value && [...threadSpaceSelect.options].some((option) => option.value === threadSpaceFilter.value)) {
      threadSpaceSelect.value = threadSpaceFilter.value;
    }
    threadForm.hidden = false;
    threadForm.elements.title.focus();
    threadForm.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

document.querySelector("[data-cancel-thread-form]").addEventListener("click", () => {
  threadForm.reset();
  threadCreationFilePicker.reset();
  threadForm.hidden = true;
});

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = new FormData(searchForm).get("query");
  selectedThreadSpaceId = null;
  showPortalView("discussions");
  threadSpaceFilter.value = "";
  updateWorkspaceThreadNavigation(null, false);
  discussionTitle.textContent = "搜尋結果";
  setThreadSource(`/api/search?q=${encodeURIComponent(query)}`);
  await loadThreads();
});

async function showBookmarks() {
  selectedThreadSpaceId = null;
  showPortalView("discussions");
  threadSpaceFilter.value = "";
  updateWorkspaceThreadNavigation(null, false);
  portalBookmarks.classList.add("is-active");
  discussionTitle.textContent = "我的書籤";
  setThreadSource("/api/bookmarks", "目前沒有已加入書籤的討論串。");
  await loadThreads();
}

portalBookmarks.addEventListener("click", showBookmarks);

restoreSession();

