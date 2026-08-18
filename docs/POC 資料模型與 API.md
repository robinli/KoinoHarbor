# POC 資料模型與 API

## 資料模型

| 集合 | 主要欄位 | 說明 |
|---|---|---|
| `users` | email、displayName、role、active、稽核欄位 | 使用者與全域角色。 |
| `spaces` | name、parentId、sortOrder、accessMode、description、archived、稽核欄位 | 最多兩階的工作區；`parentId` 為 `null` 表示頂層，子層可採繼承或限制存取；同層依 `sortOrder`、名稱排序。 |
| `spaces/{spaceId}/members` | userId、role、稽核欄位 | 直接成員；預設繼承的子工作區也接受父層直接成員。 |
| `threadStatuses` | name、sortOrder、active、稽核欄位 | 全公司共用討論狀態。 |
| `threads` | spaceId、title、content、authorId、statusId、pinned、archived、稽核欄位 | 討論串。 |
| `threads/{threadId}/replies` | authorId、content、稽核欄位 | 討論回覆。 |
| `attachments` | threadId、spaceId、fileName、storagePath、mimeType、fileSize、uploadedBy、稽核欄位 | 附件 Metadata。 |
| `users/{userId}/bookmarks` | userId、threadId、createdAt | 個人書籤。 |

稽核欄位包含 `createdAt`、`createdBy`、`updatedAt`、`updatedBy`。

## API

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/health` | 健康檢查。 |
| GET | `/api/config` | 前端所需的非機密執行設定。 |
| POST | `/api/auth/login` | 本機 POC Email／Password 登入。 |
| POST | `/api/auth/firebase-session` | 將 Firebase ID Token 交換成 HttpOnly Session Cookie。 |
| POST | `/api/auth/logout` | 登出並清除 Session。 |
| GET | `/api/auth/me` | 取得目前使用者。 |
| GET／PATCH | `/api/users`、`/api/users/{id}` | Admin 使用者管理。 |
| GET／POST | `/api/spaces` | 工作區查詢與建立；建立可傳入 `parentId`、`accessMode`、`sortOrder`。 |
| PATCH | `/api/spaces/{id}` | 工作區名稱、排序、說明與封存修改；階層與存取模式不可變更。 |
| GET／POST／DELETE | `/api/spaces/{id}/members` | Space 成員管理。 |
| GET／POST／PATCH | `/api/thread-statuses` | 討論狀態管理。 |
| GET／POST／PATCH | `/api/threads` | 討論串查詢、建立與修改。 |
| POST／PATCH | `/api/threads/{id}/replies` | 回覆建立與修改。 |
| PUT | `/api/threads/{id}/bookmark` | 加入或取消個人書籤。 |
| GET | `/api/bookmarks` | 個人書籤清單。 |
| GET | `/api/search?q=...` | 搜尋標題、內容與回覆。 |
| GET／POST | `/api/threads/{id}/attachments` | 附件清單與上傳。 |
| GET | `/api/attachments/{id}` | 經授權下載附件。 |

## 儲存模式

- `AUTH_PROVIDER=development`：使用本機記憶體資料及 `data/uploads`，啟動時可載入示範資料。
- `AUTH_PROVIDER=firebase`：使用 Firebase Authentication、Cloud Firestore 與 Cloud Storage；後端以 Application Default Credentials 連線。

## 工作區遷移

部署新版規則前，請在具有 Firebase Application Default Credentials 的環境執行 `npm run migrate:space-hierarchy -- --dry-run` 確認筆數，再執行 `npm run migrate:space-hierarchy`。遷移會保留工作區 ID 與所有關聯資料，將既有工作區設為頂層、預設為繼承存取及排序 `0`，並移除舊 `type` 欄位。

