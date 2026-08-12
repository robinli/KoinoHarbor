# POC 開發工作項目

## 狀態說明

| 狀態 | 說明 |
|---|---|
| 未開始 | 尚未進行 |
| 進行中 | 已開始執行但尚未完成 |
| 已完成 | 已完成並通過必要驗證 |
| 暫緩 | POC 階段暫不執行，留待後續階段處理 |
| 受阻 | 因相依項目或外部因素暫時無法繼續 |

> 更新原則：開始工作時將狀態改為「進行中」；完成實作及必要驗證後改為「已完成」。

## 工作清單

> POC 編號為固定追蹤識別碼，實際執行順序依下列階段排列。

### 第一階段：基礎架構與身分驗證

| 編號 | 工作項目 | 工作內容 | 狀態 |
|---:|---|---|---|
| POC-01 | 專案與環境建置 | 建立 Node.js Web Application、環境變數、本機啟動流程與自動化測試骨架。 | 已完成 |
| POC-02 | Cloud Run 部署驗證 | 建立 Firebase／Google Cloud POC 專案與服務設定，建立容器映像並部署至 Cloud Run，設定 HTTPS、Region、Service Account、最小執行個體為 0，驗證冷啟動與日誌。 | 已完成 |
| POC-03 | 使用者登入 | 實作 Email／Password 登入與登出、Firebase Token 驗證，以及 Admin、Member、Guest 測試帳號。 | 已完成 |
| POC-04 | 使用者與角色管理 | 建立 Users 資料集合、三種角色、帳號啟用／停用與後端角色授權機制。 | 已完成 |

### 第二階段：核心功能

| 編號 | 工作項目 | 工作內容 | 狀態 |
|---:|---|---|---|
| POC-05 | Space 管理 | 建立 Department／Project 類型 Space、SpaceMembers 關聯，以及成員新增與移除功能。 | 已完成 |
| POC-08 | 討論狀態管理 | 建立 ThreadStatus 資料集合，支援 Admin 新增、改名、排序、停用及 Thread 狀態變更。 | 已完成 |
| POC-07 | 討論串功能 | 實作 Thread 與 Reply 的建立、讀取及修改，以及狀態、置頂、封存和 Space 存取限制。 | 已完成 |
| POC-09 | 附件上傳與下載 | 上傳圖片及文件至 Firebase Storage、儲存 Metadata、限制檔案類型與容量，並依 Space Membership 控制存取。 | 已完成 |
| POC-10 | 個人書籤 | 建立 UserBookmarks 資料集合，支援加入、取消及顯示目前使用者的收藏清單。 | 已完成 |
| POC-11 | POC 搜尋 | 實作 Thread 標題與內容的簡易關鍵字搜尋，限制結果範圍並記錄未來導入專用搜尋引擎的條件。 | 已完成 |

### 第三階段：安全、驗收與交付

| 編號 | 工作項目 | 工作內容 | 狀態 |
|---:|---|---|---|
| POC-12 | 安全與資料規則 | 建立 Firestore／Storage Security Rules，於後端驗證身分、角色與 Space Membership，並加入資料稽核欄位。 | 已完成 |
| POC-13 | 測試資料與驗收 | 建立示範資料與測試帳號，執行登入、CRUD、基本授權及附件測試；雲端環境驗證由 POC-02 完成。 | 已完成 |
| POC-14 | POC 交付 | 整理可操作網站、原始碼、設定說明、資料結構、安全規則、測試結果、技術風險及 MVP 建議。 | 已完成 |

### 原暫緩項目

| 編號 | 工作項目 | 工作內容 | 狀態 |
|---:|---|---|---|
| POC-06 | Guest 權限隔離驗證 | 實作 Explicit Membership，確保 Guest 只能存取受邀 Project，並完成前端、API、Firestore 與 Storage 越權測試。 | 已完成 |

## POC 不包含項目

- 私訊及即時聊天室
- Emoji／Reaction
- @Mention
- Push Notification 及複雜 Email Notification
- 行動 App
- AI 摘要
- Elasticsearch、Meilisearch 或 Algolia
- 微服務及 Kubernetes

