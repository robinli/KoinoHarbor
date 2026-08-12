# POC 資料模型與 API

## 資料模型

| 集合 | 主要欄位 | 說明 |
|---|---|---|
| `users` | email、displayName、role、active、稽核欄位 | 使用者與全域角色。 |
| `spaces` | name、type、description、archived、稽核欄位 | 部門或專案討論空間。 |
| `spaces/{spaceId}/members` | userId、role、稽核欄位 | 除 Admin 外，Member 與 Guest 都必須具備的 Space 明確成員關聯。 |
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
| GET／POST | `/api/spaces` | Space 查詢與建立。 |
| PATCH | `/api/spaces/{id}` | Space 修改與封存。 |
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

