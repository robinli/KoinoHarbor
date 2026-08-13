本機測試

npm.cmd run dev

http://localhost:8080

---

發行 GCP

gcloud.cmd run deploy koino-harbor-poc --source . --region=asia-east1 --project=koino-harbor-poc-20260812 --quiet

---

Git Push 與 建立 PR 的語法

# 確認目前分支
git branch --show-current

# 加入並提交變更
git add public src
git commit -m "這次的備註"

# 推送目前分支
git push -u origin agent/workspace-thread-navigation

# 建立正式 PR
gh pr create --base main --head agent/workspace-thread-navigation --title "這次的備註" --body "這次的內容"