# POC 驗收報告

## 驗收資訊

- 日期：2026-08-12
- 執行環境：Windows、Node.js 24
- 驗收模式：本機 Development Provider 與線上 Firebase Provider
- 線上版本：Cloud Run `koino-harbor-poc-00006-bqb`
- 自動測試：33 項全數通過
- npm 安全稽核：0 項已知漏洞

## 驗收結果

| 項目 | 結果 | 證據 |
|---|---|---|
| 本機啟動與健康檢查 | 通過 | `GET /api/health` 測試及瀏覽器顯示服務正常。 |
| 登入、登出與 Session | 通過 | Development 與 Firebase Token 交換測試通過。 |
| Admin／Member／Guest | 通過 | 角色授權、非 Admin 拒絕與停用帳號測試通過。 |
| Space 與成員管理 | 通過 | 建立、修改、封存、加入及移除成員測試通過。 |
| 討論狀態 | 通過 | 新增、排序、改名、停用測試通過。 |
| Thread 與 Reply | 通過 | 建立、修改、回覆、置頂及封存測試通過。 |
| 附件 | 通過 | 類型／容量驗證、上傳、Metadata、授權下載與瀏覽器操作通過。 |
| 個人書籤 | 通過 | 加入、權限範圍過濾與瀏覽器查詢通過。 |
| 簡易搜尋 | 通過 | 標題、內容、回覆及可存取 Space 範圍測試通過。 |
| 後端授權 | 通過 | 未登入、非 Admin 與未加入 Space 的 Guest 拒絕測試通過。 |
| Firebase Security Rules | 通過 | `firestore.rules` 與 `storage.rules` 已編譯並部署至實際 POC 專案。 |
| 瀏覽器主流程 | 通過 | 實際完成登入、建立 Space／狀態／討論、回覆、書籤、附件及搜尋。 |
| 入口網站 | 通過 | 工作首頁、跨 Space 最新討論、公司資訊、狀態統計、篩選與全域新增討論通過。 |
| Admin 管理區 | 通過 | 使用者、狀態、Space 與成員管理入口及非 Admin 隱藏驗證通過。 |
| Guest 完整隔離 | 通過 | 未受邀 Guest 的入口清單為空、管理入口隱藏，未受邀 Space API、Firestore 與 Storage 均拒絕存取。 |
| 帳號切換清理 | 通過 | Admin 登出後切換 Guest，前端立即清空 Space、討論、公告與統計，未保留前一身分資料。 |
| Cloud Run 發行 | 通過 | 修訂 `koino-harbor-poc-00006-bqb` 承接 100% 流量，512 MiB、Concurrency 20、最多 2 個執行個體，驗收期間無 Error 日誌。 |

## 後續觀察項目

- POC 採最小執行個體 0，持續觀察冷啟動體感與實際月費。
- 搜尋目前適合 20 人以下的小資料量，資料量增加後再評估專用搜尋服務。

