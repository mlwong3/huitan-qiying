# 繪畫耆才 · 運維指南（部署教學 · 優化 · 待辦）

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

## 2. 可優化的地方（2026-06-29 更新）

> 已完成項目（密碼環境變數、速率限制、CORS、Firebase Storage 線稿持久化、WebP 背景、
> 快取標頭、冒煙測試、預算警報）已從本清單移除；詳見 `CHANGELOG.md` [3.6.0] 與 §3 待辦。
> 以下為**仍可優化**的項目。

### 2.1 安全（進一步）
- 掌櫃仍是**單一共享密碼**（env）：可升級為真正帳戶登入（Firebase Auth）或簽發 session/JWT，
  並對上傳／刪除加 CSRF 與審計記錄。
- 加入基本 `helmet` 安全標頭（CSP、X-Frame-Options 等）。

### 2.2 持久化（下一步）
- 房間狀態仍存伺服器記憶體（共繪屬短期設計，可接受）；個人作品仍只在瀏覽器 localStorage。
  - 如需跨裝置／永久作品庫：以 **Firestore** 保存房間與個人作品 metadata，圖檔續用 Firebase Storage。
- 線稿可加**縮圖**（上傳時生成細圖）以加快掌櫃與選紙頁載入。

### 2.3 效能
- 前端多個 classic `<script>`：可合併＋版本化檔名（hash）配長快取，減少請求數。
- Cloud Run 可視展示需要加 `min-instances 1` 消除冷啟動（會有少量常駐費用）。
- 圖庫圖片可加 `loading="lazy"` 與固定長寬比，減少版面跳動。

### 2.4 可維護性與品質
- 大型 `public/script.js`（~1500 行）可按模組（painter / scanController / feedbackLayer /
  board / app）實際拆檔。
- 加 **ESLint / Prettier** 統一風格；測試擴展到 Socket.IO 共繪事件與單鍵掃描流程。
- 加 **Cloud Build trigger** 令 push `main` 自動部署（CI/CD）。

### 2.5 無障礙與展示
- `輸出觸覺圖` 目前產生高對比 PNG/SVG；可再加 **STL（光雕浮雕）** 真正可 3D 列印。
- 單鍵掃描可加**可調掃描速度**、提示音量、視覺高亮對比設定。
- 入口頁可補回 Figma 的裝飾印章（共融／樂齡／詩閒）細節與像素級間距對齊（待 Figma 解鎖）。

### 2.6 介面對齊（Figma）
- 三個入口頁已按 Figma PNG 重構（標題、主頁範圍標籤、雙欄卡片、線稿庫主題卡）。
- 待 Figma MCP 解除 Starter 上限或取得設計變數後，再做**像素級**字級／間距／顏色對齊。

---

## 3. 待辦事項（TODO）

### 已完成（v3.6.0，2026-06-28）
- [x] 提交並部署最新版本（rev 00007）。
- [x] 改掉公開站預設密碼（改用 `ADMIN_PASSWORD` 環境變數，線上為非預設值）。
- [x] **線稿持久化至 Firebase Storage**（bucket `huitan-qiying-linearts`，公開讀取）。
- [x] 速率限制、CORS 白名單、WebP 背景（−95%）、快取標頭、冒煙測試（`npm test`）。
- [x] 設定 GCP 預算警報（每月 $10，90% 通知）。

### Figma 介面（仍待）
- [ ] **精準對齊 Figma 設計** `Mhy55NUKBCVIJdt4EpN4xt`：Figma MCP 已連接，但 **Starter 方案 MCP 呼叫上限**令 `get_metadata` / `get_screenshot` 第一次呼叫即被拒。
  - 需要其一：① 升級 Figma 方案解除 MCP 上限；② 由 Figma 匯出各 frame 為 PNG/規格並分享。
- [ ] 對齊後確認三個入口頁文字、間距、卡片透明度；檢查 768/375px 響應式。

### 功能驗證（仍待）
- [ ] 端對端測試：單鍵掃描放置圖元、方向鍵移動、共繪同步、觸覺圖 PNG/SVG 輸出。
- [ ] 共繪即時游標／在場狀態（先前規劃的 Phase 4，未完成）。

### 基建（仍待）
- [ ] 作品庫永久化（如需）：接 Firestore 保存房間／個人作品。
- [ ] （可選）Cloud Build：push `main` 自動部署。
- [ ] 大型 `public/script.js` 模組拆檔 + ESLint。

### 線上環境變數（目前設定）
| 變數 | 值 / 用途 |
| --- | --- |
| `STORAGE_BUCKET` | `huitan-qiying-linearts`（設定後啟用 Firebase Storage；不設則用本機磁碟） |
| `ADMIN_PASSWORD` | 掌櫃密碼（線上為非預設；改值：`gcloud run deploy ... --set-env-vars ADMIN_PASSWORD=新值`） |
| `ALLOWED_ORIGINS` | CORS 白名單（逗號分隔；目前為線上網址） |
- [ ] 加基本自動化測試與 lint。

---

_最後更新：2026-06-28。如指令有變動，以本檔 §1 為準。_
