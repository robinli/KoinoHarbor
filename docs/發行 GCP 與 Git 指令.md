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
git add .
git commit -m "這次的備註"

# 推送目前分支
git push

# 建立正式 PR
gh pr create --base main --head codex-local --title "這次的備註" --body "這次的備註"

---

# 同步至本機
git checkout main
git pull origin main


# 在 codex-local 分支上，將 main 分支的內容合併進來
git checkout codex-local
git merge main


# 將合併後的 codex-local 推送至遠端
git push


