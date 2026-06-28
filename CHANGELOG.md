# Changelog · 繪壇耆英

本檔記錄專案實作後的修改。格式參考 [Keep a Changelog](https://keepachangelog.com/)。
（Engineering Notes 內的 v1.0–v3.1 設計版本歷史見 README / 工程文件第 17 節。）

---

## [3.4.0] — 2026-06-28 · 視線追蹤（階段三）+ 頭部操控修正

### Fixed
- **頭部操控載入失敗**：MediaPipe `@mediapipe/tasks-vision` 版本 `0.10.22` 於 CDN
  不存在（404，`Failed to fetch dynamically imported module`）。改用確認可用的 `0.10.20`。

### Added
- **視線操控（階段三 · 實驗性）** `EyeSource`：WebGazer 3.3.0（CDN，本機運算）
  以視線位置驅動游標；gaze 較跳，故用較低 cutoff 與較大 dwell 半徑（45px）。
- 文具盤加「視線操控」開關；與「頭部操控」**互斥**（開一個自動關另一個，共用游標）。

### Changed
- 抽出共用 **`DwellEngine`**（平滑 + 游標 + dwell 選取 + 發出統一訊號），
  `HeadSource` 與 `EyeSource` 同享此「共融核心」，只各自負責輸入座標映射。

### Verified
- `EyeSource` 螢幕→畫布座標映射正確（(300,200)→(600,400)）；dwell 邏輯沿用已驗證的
  `DwellEngine`。頭／眼互斥切換、鏡頭失敗友善回退皆通過；三檔開關 UI 正常、無 console error。

### Privacy
- 頭部與視線追蹤全部瀏覽器**本機運算、影像不上傳**。

### Roadmap（未做）
- 階段四：跨輸入共融共繪（頭控長者 × 觸控孫兒同畫面）。光雕 STL 觸覺輸出。

---

## [3.3.0] — 2026-06-27 · 共融創作工具（階段一 + 階段二）

### Added
- **One Euro Filter 自適應平滑**（Casiez 2012）`public/oneEuroFilter.js`：
  `LowPass / OneEuroFilter / PointFilter`（純 JS，掛 window 全域）。慢速強平滑壓手震、
  快速放開保持跟手。預設 `minCutoff 0.8 / beta 0.02`。
- **統一指標抽象層** `public/pointerSources.js`：所有輸入正規化成同一條
  `{ x, y, action }` 訊號流。`TouchMouseSource` 包裝現有觸控／滑鼠。
- **「防手震」可見開關**（文具盤，`role="switch"`）：即時切換濾波，預設開啟。
- **頭部操控（階段二）** `HeadSource`：MediaPipe FaceLandmarker（CDN，本機運算）以鼻樑
  landmark 驅動游標，經同一 `PointFilter` 平滑；**dwell（停留 1 秒）切換落筆／提筆**，
  頭部移動即繪畫——避開精準點擊。畫布游標 + dwell 進度環 + 本機 webcam 預覽。

### Changed
- `painter` 改為只認 `feed({x,y,action})` 單一入口（script.js），不再直接綁 DOM 事件；
  新增輸入毋須改動繪畫核心（亦不影響 Socket.IO 共繪）。

### Verified
- 同一手震序列經真實事件流：濾波關 → 開，畫線抖動 std 22.4px → 7.2px（**−67.9%**）。
- `HeadSource` dwell 邏輯：靜止→落筆、移動→繪畫、再靜止→提筆（序列 down→move→up）。
- 鏡頭失敗時友善回退（還原開關 + 提示）。三檔開關 UI 與版面正常，無 console error。

### Privacy
- 頭部追蹤全部瀏覽器**本機運算、影像不上傳**。

### Roadmap（未做）
- 階段三：視線追蹤（WebGazer）、光雕 STL 匯出。階段四：跨輸入共融共繪。

---

## [3.2.0] — 2026-06-27 · 全面響應式版面

### Fixed
- **畫布在平板／手機被壓縮成 32px 闊的嚴重 bug**：`.board-layout` 原用
  `align-items: flex-start`，在直向堆疊版面下令畫布無法撐開闊度。改為
  `align-items: stretch`，畫布永遠填滿可用闊度。

### Changed
- 重新設計為三層響應式版面：
  - 💻 電腦（>1024px）：左側文具欄 (260px) + 右側大畫布，並排。
  - 📱 iPad／平板（≤860px）：大畫布置頂、工具列橫向排於下方。
  - 📲 手機（≤480px）：大畫布置頂、工具全闊度直向排（大按鈕，便於長者點按）。
- 頂部 logo 不再斷行（`white-space: nowrap`）；導覽列在窄螢幕自動收窄。
- 圖庫格線在窄螢幕回流為兩欄（`minmax` 由 190px 調整至 150/130px）。

### Verified
- 於 375 / 768 / 1280px 三種視窗實測截圖確認，無 console error。

---

## [3.1.1] — 2026-06-25 · 首次實作、修正與部署上線

### Added
- 依 **Engineering Notes v3.1** 規格由零實作全端應用：
  - 後端 `server.js`（195 行）：Express + Socket.IO + Multer，記憶體房間狀態、
    4 位數字房號、掌櫃密碼 `8888`、路徑穿越防護、UTF-8 中文檔名解碼。
  - 前端 `public/`：原生 SPA（5 個畫面）+ `script.js`（852 行）+
    `style.css`（529 行）。
  - 八大設計語言：窗景畫布、實體文具、印泥盒選色、窗台貓咪語音助手、
    翻頁式導航、宣紙動態背景、書寫回饋、時光膠囊封存儀式。
  - 三模式：獨畫 / 共繪 / 掌櫃；粵語 (zh-HK) 語音控制與朗讀。
- `Dockerfile` + `.dockerignore`：容器化部署設定（node:20-alpine）。
- `CLAUDE.md`、`README.md` 維護與說明文件。

### Fixed
- **`[hidden]` 失效 bug**：`.room-banner`（`display:inline-block`）等規則覆寫了
  HTML `hidden` 屬性，導致單人模式誤顯示「房間號碼」橫額。加入
  `[hidden] { display:none !important; }` 統一修正。
- 修正掌櫃登入時的函式名 typo（`renderAdminLlinearts` → `renderAdminLinearts`）。

### Deployed
- 推送至 GitHub（public）：<https://github.com/mlwong3/huitan-qiying>
- 部署至 **Google Cloud Run**（asia-east1）：
  <https://huitan-qiying-705615272136.asia-east1.run.app>
  旗標：`--allow-unauthenticated --session-affinity --max-instances 1 --timeout 3600`
- 實測：首頁 200、線稿 API、掌櫃密碼驗證、Socket.IO 端點、繪畫→封存→
  localStorage 儲存、開房（4 位房號）全部通過。

### Known issues / 待辦（見 README §安全 與工程文件 §14）
- 掌櫃密碼為硬編碼、明文傳輸（原型）。
- 上傳線稿存於容器磁碟，重新部署即清除（無持久化）。
- 房間狀態僅存記憶體，伺服器重啟即失。
