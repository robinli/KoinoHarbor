# POC 資料模型與 API

## 資料模型

| 集合 | 主要欄位 | 說明 |
|---|---|---|
| `users` | email、displayName、role、active、稽核欄位 | 使用者與固定單一群組；`role` 為 `admin`、`member` 或 `guest`。 |
| `spaces` | name、parentId、sortOrder、accessMode、allowedRoles、description、archived、deletedAt、deletedBy、稽核欄位 | 最多兩階；頂層固定 `restricted`，繼承子層的 `allowedRoles` 固定為空陣列。 |
| `spaces/{spaceId}/members` | userId、稽核欄位 | 只用於頂層與 restricted 子工作區；繼承子層不建立直接加入關係。 |
| `spaces/{spaceId}/messageReactions` | threadId、messageType、messageId、emoji、userId、userDisplayName、createdAt | 討論與回覆的 Emoji Reaction；瀏覽器只讀，寫入一律經 API。 |
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
| POST | `/api/auth/firebase-client-token` | 正式環境以現有 Session 取得 Firestore 只讀即時監聽所需的短期 custom token。 |
| POST | `/api/auth/logout` | 登出並清除 Session。 |
| GET | `/api/auth/me` | 取得目前使用者。 |
| GET／PATCH | `/api/users`、`/api/users/{id}` | Admin 使用者管理。 |
| GET／POST | `/api/spaces` | 查詢有內容權限的工作區或建立工作區；建立必須提供 `allowedRoles`。 |
| GET | `/api/admin/spaces?state=active\|deleted\|all` | Admin 依狀態查詢工作區管理資料，不代表取得內容權限。 |
| GET | `/api/spaces/joinable` | 查詢目前使用者符合群組資格且尚未取得存取權的工作區。 |
| PATCH | `/api/spaces/{id}` | 工作區名稱、排序、說明與封存修改；階層與存取模式不可變更。 |
| DELETE | `/api/spaces/{id}` | Admin 軟刪除工作區；有未刪除子工作區時拒絕。 |
| POST | `/api/spaces/{id}/restore` | Admin 還原軟刪除的工作區；子工作區要求父層已還原。 |
| PUT／DELETE | `/api/spaces/{id}/membership` | 使用者自行加入或退出工作區。 |
| GET／POST／DELETE | `/api/spaces/{id}/members` | Admin 指派或移除符合群組資格的直接成員。 |
| GET／POST／PATCH | `/api/thread-statuses` | 討論狀態管理。 |
| GET／POST／PATCH | `/api/threads` | 討論串查詢、建立與修改。 |
| POST／PATCH | `/api/threads/{id}/replies` | 回覆建立與修改。 |
| PUT | `/api/threads/{id}/reactions` | 以 `messageType`、`messageId`、`emoji`、`reacted` 冪等新增或取消 Reaction。 |
| PUT | `/api/threads/{id}/bookmark` | 加入或取消個人書籤。 |
| GET | `/api/bookmarks` | 個人書籤清單。 |
| GET | `/api/search?q=...` | 搜尋標題、內容與回覆。 |
| GET／POST | `/api/threads/{id}/attachments` | 附件清單與上傳。 |
| GET | `/api/attachments/{id}` | 經授權下載附件。 |

## 儲存模式

- `AUTH_PROVIDER=development`：使用本機記憶體資料及 `data/uploads`，啟動時可載入示範資料。
- `AUTH_PROVIDER=firebase`：使用 Firebase Authentication、Cloud Firestore 與 Cloud Storage；後端以 Application Default Credentials 連線。

正式 Firebase 環境會以 Firestore `onSnapshot` 只讀監聽目前畫面上的 Reaction；development 模式由操作者立即更新畫面，其他瀏覽器須重新載入資料。Reaction 不會產生未讀或通知，也不會更新討論排序時間。

## 工作區遷移

部署新版規則前，請在具有 Firebase Application Default Credentials 的環境執行 `npm run migrate:space-hierarchy -- --dry-run` 確認筆數，再執行 `npm run migrate:space-hierarchy`。遷移會保留工作區 ID 與所有關聯資料，將舊工作區設為 restricted 頂層、排序 `0`，並移除舊 `type` 欄位。

群組授權切換須準備 JSON 設定檔，格式為 `{ "spaceId": ["admin", "member"] }`，且必須完整列出所有工作區。維護時段先執行 `npm run migrate:workspace-groups -- --config <path> --dry-run`，確認將移除的不合格成員後，再移除 `--dry-run` 套用。遷移會設定 `allowedRoles`、刪除不合格加入關係，並移除舊 membership `role` 欄位。

純繼承與軟刪除欄位切換先執行 `npm run migrate:workspace-access -- --dry-run`，確認將移除的繼承子層直接加入紀錄，再移除 `--dry-run` 套用。此遷移可重複執行。

