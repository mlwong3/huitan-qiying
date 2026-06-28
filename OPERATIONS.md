# 繪壇耆英 · 運維指南（部署教學 · 優化 · 待辦）

本檔提供：① 如何把新程式碼更新到 GitHub 與 Google Cloud Run；② 可優化的地方；③ 待辦事項。
（功能版本歷史見 [`CHANGELOG.md`](CHANGELOG.md)；維護結構見 [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md)。）

- **線上服務**：<https://huitan-qiying-705615272136.asia-east1.run.app>
- **GitHub**：<https://github.com/mlwong3/huitan-qiying>
- **GCP 專案**：`fluent-firefly-467617-i7` ｜ **區域**：`asia-east1` ｜ **服務名**：`huitan-qiying`

---

## 1. 更新程式碼到 Google Cloud（部署教學）

### 1.0 一次性環境（本機已裝好）
- `git`：已安裝。
- `gh`（GitHub CLI）：`~/.local/bin/gh`，已登入帳戶 `mlwong3`。
- `gcloud`（Google Cloud SDK）：`~/google-cloud-sdk/bin/gcloud`。
- 方便起見，每個新終端機先設定 PATH：
  ```bash
  export PATH="$HOME/.local/bin:$HOME/google-cloud-sdk/bin:$PATH"
  ```

### 1.1 改完程式碼 → 推上 GitHub
```bash
cd ~/Claude/Projects/huitan-qiying
git add -A
git commit -m "你的修改說明"
git push origin main
```
> 若 push 出現 `could not read Username`，執行一次 `gh auth setup-git` 即可。

### 1.2 登入 Google Cloud（token 會過期，部署前先確認）
```bash
gcloud auth print-access-token >/dev/null 2>&1 && echo OK || gcloud auth login
```
- 如顯示要登入：執行 `gcloud auth login`，依畫面開啟連結、用 `mlwong3@stfa-yyc.edu.hk` 授權、貼回驗證碼。
- 確認專案：
  ```bash
  gcloud config set project fluent-firefly-467617-i7
  ```

### 1.3 部署到 Cloud Run（由原始碼建置，毋須本機 Docker）
```bash
cd ~/Claude/Projects/huitan-qiying
gcloud run deploy huitan-qiying \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated \
  --session-affinity \
  --max-instances 1 \
  --timeout 3600
```
- `--session-affinity` + `--max-instances 1`：因房間狀態存記憶體，需單一 instance 才能保證共繪同步。
- 約 2–4 分鐘。完成後會印出 `Service URL`。

### 1.4 部署後驗證
```bash
URL=https://huitan-qiying-705615272136.asia-east1.run.app
curl -s -o /dev/null -w "%{http_code}\n" $URL        # 期望 200
curl -s $URL/api/linearts                            # 期望 JSON 陣列
```
亦可開瀏覽器確認三個入口頁、單鍵創作、輸出觸覺圖。

### 1.5 設定管理密碼（建議，避免公開用預設 8888）
```bash
gcloud run deploy huitan-qiying --source . --region asia-east1 \
  --allow-unauthenticated --session-affinity --max-instances 1 --timeout 3600 \
  --set-env-vars ADMIN_PASSWORD=你的強密碼
```

### 1.6 回滾（出事時）
```bash
gcloud run revisions list --service huitan-qiying --region asia-east1
gcloud run services update-traffic huitan-qiying --region asia-east1 \
  --to-revisions <舊版 revision 名>=100
```

### 1.7 常見問題
| 症狀 | 處理 |
| --- | --- |
| `gcloud: command not found` | 先 `export PATH="$HOME/google-cloud-sdk/bin:$PATH"` |
| 部署被拒 / 要登入 | `gcloud auth login` 重新授權 |
| push 要求帳密 | `gh auth setup-git` |
| 改完無變化 | 確認已 `git push` 並重新 `gcloud run deploy`（Cloud Run 唔會自動跟 GitHub）|

> 進階：可設定 Cloud Build trigger 令 push 到 `main` 自動部署（見待辦 §3）。

---

## 2. 可優化的地方

### 2.1 安全（最優先）
- **管理密碼硬編碼 `8888` 且明文傳輸**：改用 `ADMIN_PASSWORD` 環境變數（§1.5），再進一步用 session/JWT 或 Firebase Auth。
- 所有 API 無 rate limiting；CORS 為全開放 → 收緊。

### 2.2 持久化
- 房間狀態只存伺服器記憶體、上傳線稿存容器磁碟 → **重啟／重新部署即失**。
  - 線稿改存 **Firebase Storage / Cloud Storage**；房間與作品改用 **Firestore**。

### 2.3 效能
- `public/assets/figma-new-chinese-bg.png` 約 **2.4 MB**，每個入口頁載入。
  - 壓縮並轉 **WebP/AVIF**、提供較細的行動版、加長 cache 標頭。
- 前端為多個 classic `<script>`：可加版本化檔名 + 長 cache。
- Cloud Run 加 `min-instances 1` 可消除冷啟動（但會有少量常駐費用）。

### 2.4 可維護性與品質
- **零自動化測試** → 至少加數個 smoke test（API、Socket 事件、單鍵流程）。
- 大型 `public/script.js` 可按模組（painter / assistive / feedback / board / app）拆檔。
- 加 ESLint / Prettier 一致風格。

### 2.5 無障礙與展示
- `輸出觸覺圖` 目前產生高對比 PNG/SVG；可再加 STL（光雕浮雕）真正可 3D 列印。
- 單鍵掃描可加可調速度、聲音提示音量、視覺高亮對比設定。

### 2.6 費用控管
- 於 GCP 設 **預算警報**（例如每月 HK$10）以防意外收費。

---

## 3. 待辦事項（TODO）

### 即時
- [ ] **提交目前未 commit 的 [3.5.0] 改動**（單鍵創作、觸覺圖、Figma 入口頁、`figma-new-chinese-bg.png`）並推上 GitHub。
- [ ] 重新部署 Cloud Run，使線上版本同步到 [3.5.0]。
- [ ] 改掉公開站的預設管理密碼 `8888`（§1.5）。

### Figma 介面
- [ ] **精準對齊 Figma 設計** `Mhy55NUKBCVIJdt4EpN4xt`：目前介面已用匯出的背景圖實作入口頁，但本機環境**沒有 Figma 讀取工具**，無法自動抽取最新版面數值。
  - 需要其一：① 由 Figma 匯出各 frame 為 PNG/規格並分享；② 提供 Figma 存取（Dev Mode / MCP）。
- [ ] 確認三個入口頁文字、間距、卡片透明度與 Figma 一致；檢查 768/375px 響應式。

### 功能驗證
- [ ] 端對端測試：單鍵掃描放置圖元、方向鍵移動、共繪同步、觸覺圖 PNG/SVG 輸出。
- [ ] 共繪即時游標／在場狀態（先前規劃的 Phase 4，未完成）。

### 基建
- [ ] 線稿 + 作品持久化（Firebase Storage / Firestore）。
- [ ] 設定 GCP 預算警報。
- [ ] （可選）Cloud Build：push `main` 自動部署。
- [ ] 加基本自動化測試與 lint。

---

_最後更新：2026-06-28。如指令有變動，以本檔 §1 為準。_
