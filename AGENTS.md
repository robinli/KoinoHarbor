# Project policies

## Local test server cleanup

- 每次測試或本機 UI 驗證結束後，必須停止所有由該次測試啟動、占用 TCP 8080 的伺服器與 watch 程序。
- 結束工作前，必須確認 TCP 8080 已無任何監聽程序；不可只送出中斷訊號而未驗證結果。
- 不得將 `npm start`、`npm run dev`、`node --watch` 或其他測試用背景程序留在執行狀態。
