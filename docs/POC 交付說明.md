# POC 交付說明

## 交付內容

- Node.js Web Application 與管理介面
- Development 與 Firebase Authentication Provider
- 本機及 Firestore／Cloud Storage 資料層
- Firestore／Storage Security Rules 與索引
- Dockerfile 與 Cloud Run 相容的 `PORT` 設定
- 自動測試、資料模型、API、驗收報告及專案日誌
- 登入後入口網站、跨 Space 工作首頁與獨立 Admin 管理區

## 本機執行

```powershell
Copy-Item .env.example .env
npm.cmd install
npm.cmd test
npm.cmd run dev
```

開啟 `http://localhost:8080`，預設測試帳號請參考根目錄 `README.md`。

## Firebase 模式

1. 使用 Firebase／Google Cloud 專案 `koino-harbor-poc-20260812`。
2. Email／Password Authentication、Firestore 與 Storage 已啟用。
3. 建立 `users` 文件，文件 ID 必須與 Firebase Auth UID 相同，並設定 `active: true` 與合法角色。
4. 將 `.env` 的 `AUTH_PROVIDER` 設為 `firebase`，填入 Firebase Web 設定。
5. 本機使用 `GOOGLE_APPLICATION_CREDENTIALS`；Cloud Run 使用 Service Account 與 Application Default Credentials。
6. 部署 `firestore.rules`、`storage.rules` 及 `firestore.indexes.json`。
7. Cloud Run 服務位於 `asia-east1`，最小執行個體 0、最多 2 個、512 MiB 記憶體。

## 已知取捨

- 第一版搜尋會讀取可存取範圍內的討論及回覆，適合 20 人以下的小資料量；資料量增加後改用 Meilisearch、Typesense 或 Algolia。
- 本機 Development Provider 的資料重啟後會重建，不是正式持久化模式。
- 附件採 20 MB 上限；允許圖片、PDF、Office 文件及 ZIP，不支援影片。
- 除 Admin 外，Member 與 Guest 均採 Explicit Membership，避免跨 Space 預設讀取。

## MVP 建議

先讓 3～5 名內部使用者試用兩週，觀察 Space 分類、狀態命名、附件容量及搜尋命中情況，再決定是否加入 Email 通知、已讀狀態與專用搜尋引擎。

## 線上入口

https://koino-harbor-poc-122853126985.asia-east1.run.app

