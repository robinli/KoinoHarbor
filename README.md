# Koino Harbor

企業內部溝通平台 POC，使用 Node.js、Google Cloud Run、Firebase Authentication、Cloud Firestore 與 Cloud Storage。

線上 POC：https://koino-harbor-poc-122853126985.asia-east1.run.app

## 系統需求

- Node.js 22 以上
- npm

## 本機啟動

1. 複製 `.env.example` 為 `.env`，再填入環境設定。
2. 執行 `npm run dev`。
3. 開啟 `http://localhost:8080`。

Windows PowerShell 若限制執行 `npm.ps1`，可改用：

```powershell
npm.cmd run dev
```

## 驗證

```powershell
npm.cmd run verify
```

健康檢查端點為 `GET /api/health`。

## 本機 POC 帳號

尚未建立 Firebase 專案時，系統使用 `development` authentication provider。預設帳號定義於 `.env.example`，僅限本機測試；正式環境會拒絕啟動此模式。

```text
admin@koino.local  / PocAdmin123!
member@koino.local / PocMember123!
guest@koino.local  / PocGuest123!
```

## 專案結構

```text
public/       Web 前端靜態資源
src/          Node.js 應用程式與設定
test/         自動化測試
docs/         技術報告、POC 工作清單與專案日誌
```

## 目前可用功能

- 登入後工作入口首頁與跨 Space 最新討論
- 公司資訊、討論狀態統計與 Space 篩選
- 全域新增討論與 Space 預選
- 討論標題、內容、狀態、回覆、附件、書籤與搜尋
- Admin 使用者角色、討論狀態、Space 與成員管理
- Admin、Member、Guest 的 Explicit Membership 權限隔離

Development Provider 使用記憶體與本機附件目錄，重新啟動後會重建示範資料；將 `AUTH_PROVIDER` 設為 `firebase` 後會改用 Firebase Authentication、Cloud Firestore 與 Cloud Storage。

詳細資料模型、API、入口網站操作、驗收結果及交付方式位於 `docs` 資料夾。

