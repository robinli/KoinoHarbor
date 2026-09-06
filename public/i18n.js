const STORAGE_KEY = "koino.locale";
const SUPPORTED = new Set(["zh-TW", "en"]);

const ENGLISH = Object.freeze({
  "登入": "Sign in",
  "密碼": "Password",
  "忘記密碼？": "Forgot password?",
  "輸入帳號 Email，我們會寄送密碼重設連結。": "Enter your account email and we will send a password reset link.",
  "返回登入": "Back to sign in",
  "寄送重設信": "Send reset email",
  "主要導覽選單": "Main navigation",
  "前往後台管理": "Open administration",
  "後台管理": "Administration",
  "登入者": "Signed in",
  "登入者 ·": "Signed in ·",
  "全部工作區": "All workspaces",
  "已授權工作區": "Authorized workspaces",
  "加入工作區": "Join workspace",
  "我的書籤": "My bookmarks",
  "登出": "Sign out",
  "工作首頁": "Work overview",
  "彙整您有權限查看的工作區最新討論。": "See the latest discussions from workspaces you can access.",
  "工作區": "Workspace",
  "新增討論": "New discussion",
  "最新討論": "Latest discussions",
  "查看全部": "View all",
  "討論狀態": "Discussion status",
  "工作區管理": "Workspace management",
  "顯示": "Show",
  "使用中": "Active",
  "已刪除": "Deleted",
  "新增頂層工作區": "New top-level workspace",
  "全部討論": "All discussions",
  "標題": "Title",
  "狀態": "Status",
  "內容": "Content",
  "附加檔案": "Attachments",
  "取消": "Cancel",
  "建立討論": "Create discussion",
  "搜尋": "Search",
  "網站設定": "Site settings",
  "網站標題": "Site title",
  "儲存": "Save",
  "使用者與群組": "Users and groups",
  "使用者": "User",
  "顯示名稱": "Display name",
  "初始密碼": "Initial password",
  "群組": "Group",
  "新增使用者": "Add user",
  "新密碼": "New password",
  "操作": "Actions",
  "新狀態名稱": "New status name",
  "排序": "Order",
  "新增狀態": "Add status",
  "工作區與成員": "Workspaces and members",
  "建立、封存工作區，並管理每個工作區的成員。": "Create and archive workspaces and manage their members.",
  "編輯討論狀態": "Edit discussion status",
  "狀態名稱": "Status name",
  "儲存變更": "Save changes",
  "編輯個人資料": "Edit profile",
  "個人名稱": "Display name",
  "確認新密碼": "Confirm new password",
  "編輯工作區": "Edit workspace",
  "名稱": "Name",
  "存取模式": "Access mode",
  "繼承父層成員": "Inherit parent members",
  "限制為此工作區成員": "Restricted to workspace members",
  "允許加入的群組": "Groups allowed to join",
  "群組與成員資格沿用父工作區。": "Groups and membership are inherited from the parent workspace.",
  "說明": "Description",
  "啟用": "Active",
  "封存": "Archived",
  "刪除": "Delete",
  "關閉": "Close",
  "關閉訊息": "Close message",
  "全部狀態": "All statuses",
  "無狀態": "No status",
  "開啟討論": "Open discussion",
  "尚未提供說明。": "No description provided.",
  "加入": "Join",
  "退出": "Leave",
  "還原": "Restore",
  "編輯": "Edit",
  "新增子工作區": "New child workspace",
  "成員管理": "Member management",
  "新增回覆": "Add reply",
  "回覆這則訊息": "Reply to this message",
  "回覆": "Reply",
  "更多操作": "More actions",
  "加入書籤": "Bookmark",
  "移除書籤": "Remove bookmark",
  "已加入書籤": "Bookmarked",
  "設定未讀取": "Mark unread",
  "未讀取": "Unread",
  "置頂": "Pin",
  "取消置頂": "Unpin",
  "取消封存": "Unarchive",
  "載入中…": "Loading…",
  "未知群組": "Unknown group",
  "留空則不變更": "Leave blank to keep unchanged",
  "移除": "Remove",
  "復原": "Undo",
  "✓ 已加入": "✓ Joined",
  "✓ 已加入（繼承）": "✓ Joined (inherited)",
  "此工作區由父層成員資格繼承，無需另外加入。": "Access is inherited from the parent workspace; no separate join is needed.",
  "群組與成員資格：繼承父工作區": "Groups and membership: inherited from parent workspace",
  "建立工作區": "Create workspace",
  "有未讀訊息": "Has unread messages",
  "尚未加入工作區": "No workspaces joined",
  "加入工作區後才能新增討論": "Join a workspace before creating a discussion",
  "編輯狀態名稱與排序": "Edit status name and order",
  "停用狀態": "Disable status",
  "啟用狀態": "Enable status",
  "永久刪除此狀態": "Permanently delete this status",
  "新增附加檔案": "Add attachments",
  "新增表情符號": "Add reaction",
  "選擇表情符號": "Choose an emoji",
  "更多回覆操作": "More reply actions",
  "編輯討論": "Edit discussion",
  "回覆已刪除。資料仍會保留。": "Reply deleted. Its data is retained.",
  "討論已刪除。資料仍會保留。": "Discussion deleted. Its data is retained.",
  "確定刪除此回覆嗎？刪除後不會顯示在畫面上，但資料仍會保留。": "Delete this reply? It will be hidden, but its data will be retained.",
  "確定刪除此討論嗎？刪除後不會顯示在畫面上，但資料仍會保留。": "Delete this discussion? It will be hidden, but its data will be retained.",
  "本機模式無法寄送重設信，請聯絡系統管理員。": "Password reset email is unavailable in local mode. Contact an administrator.",
  "若此 Email 已註冊，密碼重設信將寄至信箱。": "If this email is registered, a password reset message will be sent.",
  "Firebase Email 或密碼不正確。": "The Firebase email or password is incorrect.",
  "目前沒有可顯示的討論。": "No discussions to display.",
  "目前沒有可加入的工作區。": "No workspaces are available to join.",
  "目前沒有可顯示的工作區。": "No workspaces to display.",
  "目前沒有已刪除的工作區。": "No deleted workspaces.",
  "目前沒有符合條件的討論串。": "No matching discussions.",
  "目前沒有已加入書籤的討論串。": "No bookmarked discussions.",
  "目前沒有討論資料。": "No discussion data.",
  "搜尋結果": "Search results",
  "分類": "Categories",
  "此瀏覽器不支援彩色 Emoji。": "This browser does not support color emoji.",
  "常用": "Favorites",
  "無法載入 Emoji。": "Unable to load emoji.",
  "表情符號選擇器": "Emoji picker",
  "有搜尋結果時，可用上下方向鍵選取並按 Enter 套用。": "When results are available, use the arrow keys and press Enter to select.",
  "搜尋表情符號": "Search emoji",
  "展開後可用上下方向鍵選取並按 Enter 套用。": "After expanding, use the arrow keys and press Enter to select.",
  "選擇膚色，目前為 {skinTone}": "Choose a skin tone. Current: {skinTone}",
  "膚色": "Skin tones",
  "預設": "Default",
  "淺色": "Light",
  "中淺色": "Medium-light",
  "中色": "Medium",
  "中深色": "Medium-dark",
  "深色": "Dark",
  "自訂": "Custom",
  "表情與情緒": "Smileys and emotion",
  "人物與身體": "People and body",
  "動物與自然": "Animals and nature",
  "食物與飲料": "Food and drink",
  "旅遊與地點": "Travel and places",
  "活動": "Activities",
  "物品": "Objects",
  "符號": "Symbols",
  "旗幟": "Flags",
  "個人資料已更新。": "Profile updated.",
  "網站標題已更新。": "Site title updated.",
  "工作區已建立。": "Workspace created.",
  "工作區已更新。": "Workspace updated.",
  "討論已建立。": "Discussion created.",
  "討論狀態已更新。": "Discussion status updated.",
  "討論資料已更新。": "Discussion updated.",
  "已加入個人書籤。": "Added to bookmarks.",
  "已移除個人書籤。": "Removed from bookmarks.",
  "兩次輸入的新密碼不一致。": "The new passwords do not match.",
  "請至少選擇一個允許加入的群組。": "Select at least one group allowed to join.",
  "要求失敗，請稍後再試。": "The request failed. Please try again later.",
  "翻譯中": "Translating",
  "翻譯失敗": "Translation failed",
  "語言": "Language",
  "不變更請留空": "Leave blank to keep unchanged",
  "再次輸入新密碼": "Enter the new password again",
  "例如：處理中": "For example: In progress",
  "搜尋標題、內容或回覆": "Search titles, content, or replies",
  "{email} 的顯示名稱": "{email} display name",
  "{email} 的新密碼": "{email} new password",
  "{email} 的角色": "{email} role",
  "已更新 {email} 的名稱。": "Updated the name for {email}.",
  "已更新 {email} 的名稱與密碼。": "Updated the name and password for {email}.",
  "已新增 {email}。": "Added {email}.",
  "已退出「{name}」。": "Left “{name}”.",
  "已加入「{name}」。": "Joined “{name}”.",
  "退出後也會失去：{names}": "You will also lose access to: {names}",
  "確定退出「{name}」？{suffix}": "Leave “{name}”?{suffix}",
  "確定刪除「{name}」？\n{impact}": "Delete “{name}”?\n{impact}",
  "刪除後使用者將無法存取此子工作區，但內容與成員資料會保留。": "Users will lose access to this child workspace, but its content and membership data will be retained.",
  "刪除後使用者將無法存取此工作區；若尚有使用中的子工作區，系統會拒絕操作。": "Users will lose access to this workspace. Deletion is rejected while active child workspaces remain.",
  "已刪除「{name}」，可於「已刪除」清單還原。": "Deleted “{name}”. It can be restored from the Deleted list.",
  "已還原「{name}」。": "Restored “{name}”.",
  "排序:{order} {description}": "Order: {order} {description}",
  "允許群組：{roles}": "Allowed groups: {roles}",
  "{name} 新增成員": "Add a member to {name}",
  "在「{name}」下新增子工作區": "Create a child workspace under “{name}”",
  "確定永久刪除「{name}」？": "Permanently delete “{name}”?",
  "已刪除討論狀態「{name}」。": "Deleted discussion status “{name}”.",
  "{title} 的討論操作": "Discussion actions for {title}",
  "回覆「{title}」": "Reply to “{title}”",
  "開啟「{title}」的更多操作": "Open more actions for “{title}”",
  "無法載入表情符號選擇器：{message}": "Unable to load the emoji picker: {message}",
  "Reaction 即時同步已中斷：{message}": "Real-time reaction sync was interrupted: {message}",
  "Reaction 即時同步無法啟動：{message}": "Unable to start real-time reaction sync: {message}",
  "{names} 對此訊息標示 {emoji}；點擊{action}": "{names} reacted with {emoji}; click to {action}",
  "取消此表情": "remove this reaction",
  "加入此表情": "add this reaction",
});

let locale = initialLocale();
let observer = null;
let translating = false;
const originalText = new WeakMap();
const originalAttributes = new WeakMap();

function initialLocale() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (SUPPORTED.has(stored)) return stored;
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh-TW" : "en";
}

export function getLocale() {
  return locale;
}

export function t(source, parameters = {}) {
  const template = locale === "en" ? (ENGLISH[source] ?? source) : source;
  return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (match, name) => (
    Object.hasOwn(parameters, name) ? String(parameters[name]) : match
  ));
}

function translateTextNode(node) {
  if (node.parentElement?.closest("[data-user-content],[data-i18n-skip]")) return;
  if (!originalText.has(node)) originalText.set(node, node.nodeValue);
  const source = originalText.get(node);
  const trimmed = source.trim();
  if (!trimmed) return;
  const translated = t(trimmed);
  if (translated === trimmed && locale === "en") return;
  node.nodeValue = source.replace(trimmed, translated);
}

function translateElement(element) {
  if (element.matches("[data-user-content],[data-i18n-skip]") || element.closest("[data-user-content]")) return;
  const attributes = ["aria-label", "placeholder", "title"];
  const saved = originalAttributes.get(element) ?? {};
  for (const name of attributes) {
    if (element.hasAttribute(name) && !Object.hasOwn(saved, name)) saved[name] = element.getAttribute(name);
    if (Object.hasOwn(saved, name)) element.setAttribute(name, t(saved[name]));
  }
  originalAttributes.set(element, saved);
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) translateTextNode(child);
    else if (child.nodeType === Node.ELEMENT_NODE) translateElement(child);
  }
}

export function applyTranslations(root = document.body) {
  if (translating || !root) return;
  translating = true;
  try {
    if (root.nodeType === Node.TEXT_NODE) translateTextNode(root);
    else translateElement(root);
    document.documentElement.lang = locale === "en" ? "en" : "zh-Hant";
    for (const selector of document.querySelectorAll("[data-locale-select]")) selector.value = locale;
  } finally {
    translating = false;
  }
}

export function observeTranslations() {
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    if (translating) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) applyTranslations(node);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export function setLocale(value, { persist = true } = {}) {
  locale = SUPPORTED.has(value) ? value : "zh-TW";
  if (persist) localStorage.setItem(STORAGE_KEY, locale);
  applyTranslations();
}

export function localizedFetch(nativeFetch, input, init = {}) {
  const url = typeof input === "string" ? input : input.url;
  if (!url.startsWith("/api/")) return nativeFetch(input, init);
  const headers = new Headers(init.headers ?? (typeof input === "string" ? undefined : input.headers));
  headers.set("Accept-Language", locale);
  return nativeFetch(input, { ...init, headers });
}
