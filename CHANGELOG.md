# Changelog · 繪畫耆才

本檔記錄專案實作後的修改。格式參考 [Keep a Changelog](https://keepachangelog.com/)。
（Engineering Notes 內的 v1.0–v3.1 設計版本歷史見 README / 工程文件第 17 節。）

---

## [3.10.1] — 2026-07-07 · 圖示大小改用百分比＋搖桿上下控制

### Changed
- **單鍵創作「選大小」步驟改為百分比連續調校**：唔再用細／中／大三張卡，改為用
  搖桿（或方向鍵）嘅**上（放大）／下（縮細）**即時調校圖示寬度百分比（6%–60%，
  預設 18%，每格 6%／微調 2%），畫面大字顯示「目前大小：X%」並即時預覽。
  同「選位置」用方向鍵嘅操作一致，更啱搖桿使用者；ESP32 韌體照送 ArrowUp/Down
  即可，**無需改硬件**。放置時圖示寬度＝所選百分比。

### Verification
- 瀏覽器實測：選大小步驟上×N／下×N 即時改變讀數同預覽寬度（18→30→24→…）；
  確認大小→選位置→放置，放置寬度＝所選百分比（例：36%）；修正 confirmCurrent
  對無卡片步驟（size/position）嘅確認 guard。`node --check`、`npm test`（5 綠）通過。

---

## [3.10.0] — 2026-07-07 · 修復畫紙封存/保存、色環顏色、單鍵大小步驟、真圖示、平板面板

### Fixed
- **用畫紙時無法封存作品／保存圖片**（跨網域污染 canvas）：Firebase 線稿本來
  用 `storage.googleapis.com` 直連 URL，畫落 canvas 後 `toDataURL()` 會因為
  cross-origin 冇 CORS header 而拋 SecurityError，令「封存作品」同「保存圖片」
  一遇上畫紙就靜靜失敗。改為所有線稿一律經 Node 同源代理（`storage.js` 回傳
  `/linearts/<name>`，`server.js` 新增串流路由），canvas 永遠唔會被污染；
  `board-bg` 亦加 `crossOrigin="anonymous"` 作額外保險。

### Added
- **圖示大小步驟**：單鍵創作流程由「圖元→顏色→位置」擴充為
  **「圖元→顏色→大小→位置」**，大小有細／中／大三檔（scale 0.6／1／1.7），
  預覽同放置尺寸即時對應。
- **顏色盤改為 12 色相色環**（紅橙黃黃綠綠青綠青天藍藍靛紫桃紅）＋白色＋黑色
  ＋自選顏色，取代原本 9 色＋自選。

### Changed
- **單鍵圖元用真圖示**：選圖元步驟唔再用「圓圈＋一個字」，改為顯示真正嘅圖示
  形狀（花／葉／雲／屋／人／樹等），使用者一睇就知係咩形狀。
- **平板單鍵面板縮細**：選項由 96px 高縮到 58–62px、面板加 `max-height` 內捲，
  唔再搶走畫布高度。
- **側欄改為固定底欄 + 可捲中段**：「文房＋顏色」放喺可捲中段，「防手震／單鍵
  創作」開關同「封存作品／返回觀賞」永遠固定喺底可見——即使 15 格色環令內容
  變高，主操作同模式開關都唔會被推出畫面。

### Verification
- 瀏覽器實測（桌面／平板 1024×768／手機 375）：載入畫紙後封存作品成功存入
  `myWorks`（有效 PNG）、保存圖片無 toDataURL 錯誤；`toDataURL` 直接測試確認
  canvas 未被污染。單鍵流程圖元→顏色→大小（紅花細/中/大）→位置→即放，
  放置寬度＝18×scale。選圖元顯示真圖示。色環 15 格齊。平板面板 3–5 欄緊湊、
  封存作品同開關固定可見。手機堆疊佈局無 nested 捲。
- `node --check`、`npm test`（5 綠）通過。

---

## [3.9.2] — 2026-07-07 · 簡化單鍵創作嘅選位置步驟

### Changed
- **選位置步驟精簡**：移除畫面上嘅上/左/位置/右/下按鈕同座標文字（X/Y 數值），
  淨係保留提示文字（「用方向鍵移動圖示，Enter／空白鍵確認位置」），
  唔再搶走畫布嘅顯示空間。方向鍵移動、點擊畫面確認嘅底層邏輯完全冇變
  （`assistiveInput` 全域鍵盤／點擊監聽本身就獨立於呢啲畫面按鈕）。
- **取消「確認放置」呢一步**：確認位置之後即刻放置圖元，唔使再撳多一次
  確認掣——「選圖元→選顏色→選位置」三步就完成一次放置（原本要四步）。

### Verification
- 瀏覽器實測（桌面／手機）：選位置畫面確認冇按鈕、冇座標；方向鍵仍然可以
  移動預覽圖示；確認位置後直接放落畫布、回到「選圖元」開始下一輪，
  `#elements-layer` 確認有新增元素。
- `node --check`（script.js）、`npm test`（5 項全綠）通過。

---

## [3.9.1] — 2026-07-07 · 單鍵創作新增 5 個相片式圖示

### Added
- **5 個新圖元**：雲朵、小花、屋仔、人仔、大樹——來自使用者提供嘅相片式線稿
  （`Photo/` 資料夾），經 `scripts/process_icons.js` 一次性處理：亮度
  二值化轉透明背景黑線 PNG、裁走浮水印、縮到 256×256、存喺
  `public/assets/icons/`。原本 5 個手畫圖元（花朵、葉子、圓形、線條、印章）
  完全保留，「選圖元」步驟而家一共 10 個選項。
- **相片圖示都可以自由換色**：SVG `feColorMatrix` 將圖示入面所有唔透明
  像素（黑線）染成揀選嘅顏色，效果同手畫 SVG 圖示一致。因為喺「純圖片
  context」（SVG 被當做 `<img src>`／canvas 圖片用）入面引用外部檔案會被
  瀏覽器擋，改為 app 啟動時經 `preloadRasterIcons()` 攞一次 PNG bytes、
  轉做 base64 快取，再夾入去每次生成嘅 SVG（自成一體，唔使再發 request）。

### Verification
- 瀏覽器實測：「選圖元」步驟 10 個選項全部顯示（原有 5 個 + 新 5 個）；
  揀「屋仔」＋「綠色」預覽正確顯示綠色屋仔圖示；確認位置後成功放落畫布；
  「保存圖片」冇報錯（`drawBoardSnapshot` 合成含相片圖示都正常）。
- 手機寬度（375px）「選圖元」清單一樣正常顯示、可捲動。
- `node --check`（script.js）、`npm test`（5 項全綠）通過。

---

## [3.9.0] — 2026-07-07 · 畫板介面重新設計、取消提筆、粗幼調節

### Added
- **粗幼滑桿**：文房面板新增畫筆粗幼滑桿（4–28px），即時調節 `painter.lineWidth`，
  影響毛筆／擦膠嘅筆觸粗細。
- **保存圖片**／**換線稿**：畫布下方新增浮動工具列，「保存圖片」直接落載目前
  畫布為 PNG（重用既有嘅 `drawBoardSnapshot` 合成邏輯）；「換線稿」返回獨畫／
  共繪入口重揀畫紙（與側欄「返回觀賞」共用同一個 `leaveBoard()`）。

### Changed
- **畫板介面重新設計**：側欄改為「文房」／「顏色」（原「印泥盒」，現改名）
  兩張卡片式面板，配合暖木框＋白色虛線畫布嘅新版面。頂部標題欄、右下角
  貓仔寵物完全保留。
- **取消提筆步驟**：移除「提筆」按鈕——開板／封存作品後即可直接落筆，
  唔使再撳掣先可以畫。
- **單頁顯示＋響應式**：桌面／平板橫向下，畫板會撐滿視窗高度、冇多餘空白
  亦冇捲動；手機／直向平板保留「畫布置頂、工具捲落去」嘅設計，換取長者
  友善嘅 56px 觸控目標唔會縮水。

- **我的作品可以繼續畫**：撳「我的作品」入面任何一張完成作品，會將佢重新
  載入去畫板（作為背景），可以繼續加筆再封存（原本呢張卡完全冇反應）。
- **封存邏輯改為完整合成**：`finishDrawing()` 而家用返 `drawBoardSnapshot()`
  合成線稿／舊作品背景＋筆觸＋已放置圖元，唔再淨係擷取筆觸本身——確保
  「攞返舊作品繼續畫」之後再封存，新縮圖會包含晒新舊內容。

### Removed
- **輸出觸覺圖**：移除「輸出觸覺圖」按鈕及其彈出視窗，連同只供呢個功能
  使用嘅 `exportTactile`／`buildTactileOutput`／`thresholdCanvas`／
  `describeWork`／`hasCanvasMarks` 等程式碼與相關 CSS 一併清理。

### Verification
- 瀏覽器實測（桌面／平板／手機三種寬度）：畫板即開即畫、粗幼滑桿即時生效、
  保存圖片／換線稿／封存作品／返回觀賞全部正常，冇殘留嘅觸覺圖按鈕或彈窗。
- 「我的作品→繼續畫」全流程實測：畫紅方塊→封存→撳返個作品→背景正確顯示
  紅方塊→加畫藍方塊→再封存→像素取樣確認新縮圖同時包含紅、藍兩個方塊。
- `node --check`（script.js）、`npm test`（5 項全綠）通過。

---

## [3.8.0] — 2026-07-03 · 共繪房間歷史、入口簡化與樣式統一

### Added
- **共繪房間歷史（我的共繪）** — 曾開啟或加入嘅房間會存入本機清單，附房號、
  日期，並提供「返回」（一鍵重新加入）及「取消」（刪除房間）。
- **取消房間** — 新增 `close_room` socket 事件：任何知道 4 位房號嘅人皆可
  取消（與現有「知道房號即可加入」信任模型一致）。取消時，正身處該房間
  嘅其他使用者會即時收到通知並被帶返共繪入口。
- 舊房間失效自動清理：重新加入一個已被取消／伺服器重啟後消失嘅房間時，
  會提示「找不到此房間號碼」，並自動移除呢筆本機殘留紀錄。

### Changed
- **獨畫入口簡化**：「＋ 選擇畫紙」改名做「＋ 空白畫紙」，並移除底下多餘
  嘅「開始獨畫」按鈕（原本只係重複觸發同一動作）；揀邊張紙就直接開畫。
- **共繪入口樣式統一**：「開一間共繪房間」同「輸入房間碼」兩張卡此前用緊
  唔同款式（後者為 Figma 對齊前遺留嘅實心宣紙＋粗木框樣式），現統一為
  半透明無邊框款式；一併清理 4 組已無使用嘅舊版 CSS 規則。

### Verification
- 瀏覽器實測：建立房間→存入歷史→離開→返回重新加入→取消→伺服器確認
  刪除（重新加入顯示「找不到此房間號碼」且本機紀錄自動清走）全流程通過；
  兩張共繪入口卡 `getComputedStyle` 確認背景與邊框數值完全一致。
- `node --check`（script.js／server.js）、`npm test`（5 項全綠）通過。

---

## [3.7.0] — 2026-07-03 · 畫板一屏化、復原功能與長者觸控優化

### Added
- **復原（undo）** — 畫板工具盤新增「復原」掣，本地最多記錄 20 步筆畫快照；
  單人模式下每筆開始及「清空」均可復原，並有粵語語音回饋（已復原一筆／
  冇得再復原喇）。共繪（多人）模式因分散式復原複雜度過高，掣自動隱藏。

### Changed
- **桌面畫板一屏化**：工具盤（毛筆／禪繞／擦膠／鏡子／復原／清空、防手震／
  單鍵創作、封存作品／輸出觸覺圖、返回）重排為緊湊兩欄格局，1280×720
  視窗下全部控制項目無需捲動即可見。
- **手機版畫板**：畫布改為 45vh（最少 300px）加大可畫面積；封存作品／返回
  改為底部 sticky 固定列，捲動時仍常駐畫面。
- **導覽分頁觸控目標**：手機（≤480px）分頁高度由 48px 提升至 56px，符合
  長者觸控標準；活躍分頁加朱紅底線＋粗體＋純白底，與非活躍分頁區分更明顯。
- **入口頁摺疊線**：加大「我的作品」／「我的共繪」等區塊間距，720px 視窗
  下標題不再被摺疊線切半。
- 掌櫃「線稿庫」移除示範用假線稿卡（花鳥／山水／節日），該區塊為 Figma
  對齊時遺留的靜態占位內容，非真實功能。

### Verification
- 瀏覽器 DOM 量度（非目測）：1280×720 編輯狀態下 `.stationery-tray`
  scrollHeight 與 clientHeight 相等（628px），全部按鈕含「← 返回」可見
  無需內部捲動；375×812 無橫向溢出，sticky 操作列生效；復原功能實測
  畫線→復原→畫布像素歸零、掣自動變灰。
- `node --check public/script.js`、`node --check server.js` 通過；
  `npm test` 5 項全綠。

---

## [3.6.0] — 2026-06-28 · 持久化儲存、安全與效能優化

### Added
- **Firebase Storage 線稿持久化** `storage.js`：以 firebase-admin（Application Default
  Credentials）讀寫 GCS bucket；設定 `STORAGE_BUCKET` 即啟用，否則回退本機磁碟（方便開發）。
  上傳的線稿不再因重新部署而消失。`/api/linearts` 改回傳 `{ name, url }`。
- **速率限制**（`express-rate-limit`）：一般 API 每分鐘 120 次，掌櫃／上傳每分鐘 20 次。
- **CORS 收緊**：Socket.IO／Express 來源改為 `ALLOWED_ORIGINS` 白名單（未設時才放寬，方便本機）。
- **WebP 背景圖**：`figma-new-chinese-bg.webp`（2.36 MB → 119 KB，細 95%），CSS 以
  `image-set` 優先載入 WebP、PNG 後備。
- **快取標頭**：`/assets` 7 天 immutable、其餘靜態 1 小時。
- **冒煙測試** `test/smoke.test.js`（`npm test`，node:test）：API 形狀、掌櫃驗證、
  路徑穿越防護、上傳→列出→刪除往返，5 項全綠。

### Changed
- 掌櫃密碼改由 `ADMIN_PASSWORD` 環境變數提供（線上已設非預設值，不再公開使用 `8888`）。
- Multer 改用記憶體儲存，交由 `storage` 層寫入 bucket 或磁碟。

### Deployment
- 建立公開讀取 GCS bucket `huitan-qiying-linearts`（asia-east1），授予 Cloud Run 執行
  服務帳戶寫入權限；部署設定 `STORAGE_BUCKET / ADMIN_PASSWORD / ALLOWED_ORIGINS`。

### Known / Roadmap
- 房間狀態仍存記憶體（共繪設計為短期）；如需永久作品庫可再接 Firestore。
- 精準對齊 Figma 設計受 Figma Starter 方案 MCP 呼叫上限所限，待方案升級或匯出資產。

---

## [3.5.0] — 2026-06-28 · 共融創作及身心健康平台

### Added
- **單鍵掃描 + 圖元創作模式**：文具盤新增「單鍵創作」開關。使用者可用空白鍵、Enter 或點擊畫面，依序選擇圖元、顏色，再用方向鍵／日後 joystick 控制位置及確認放置。
- **Joystick 位置控制預備**：選好圖元及顏色後，位置步驟改為方向鍵控制畫布上的圖示預覽；空白鍵／Enter 確認位置。`window.huitanAssistiveInput.move/confirm/back` 已預留給 ESP32 joystick + button 串接。
- **圖元語意資料**：花朵、葉子、圓形、線條、印章圖元會保存顏色、類型、名稱及來源，支援共繪同步與作品描述。
- **統一回饋層**：`feedbackLayer` 集中處理語音回饋與顏色音效；選圖元、選顏色、選位置及放置完成均有提示。
- **觸覺圖輸出原型**：新增「輸出觸覺圖」按鈕，可產生高對比黑白 PNG、SVG 包裝及簡短作品描述。
- **三個入口頁樣式重構**：獨畫入口、共繪入口、掌櫃入口改為可套用 Figma 背景圖的 portal 介面；文字、按鈕、輸入框、卡片均保留真實 HTML/CSS 元件。

### Changed
- 作品定位由「長者畫畫工具」調整為「為長者及不同能力人士而設的共融數位創作平台」，對應心理健康、身體健康、社交聯繫及無障礙護理四個支柱。
- Socket.IO `add_element` 支援單鍵圖元 metadata，房間內的掃描圖元可同步到其他使用者。
- `pointerSources.js` 簡化為觸控／滑鼠指標輸入；單鍵掃描改以 `next / confirm / back / command` 意圖處理，不再假裝成自由畫筆拖動。
- 入口頁 CSS 預留 `public/assets/figma-new-chinese-bg.png` 作為 Figma 新中式背景圖路徑；未提供圖片時使用內建新中式備援背景。
- 修正入口頁背景層級與尺寸：背景圖改為直接套用在三個入口頁，首屏高度鋪滿，避免負 z-index 及高不透明度遮罩令圖片不可見。
- 按 Figma 背景逐項微調三個入口頁：文字位置移到左側窗格右方；主標題取消厚白框並直接置於背景上；卡片透明度降低至宣紙半透明；入口頁按鈕、房號輸入框及掌櫃密碼框加大，適合長者及比賽展示。

### Removed
- 從核心 UI 取消頭部操控及視線操控按鈕、鏡頭預覽、dwell 游標及外部追蹤依賴。核心無障礙方案改為能力匹配：自由繪畫、防手震、單鍵掃描、語音／音效回饋、觸覺圖輸出及家庭共繪。

### Verification
- 本地 `http://localhost:3100` 通過語法及瀏覽器互動測試：三個入口頁載入、空白宣紙、單鍵掃描放置圖元、方向鍵把預覽由 50%/50% 移至 56%/56% 並同步放置、觸覺圖 PNG/SVG 預覽、作品描述及 390px 手機寬度無橫向溢出；控制台無 error/warn。
- Figma MCP 工具因 Starter plan 呼叫上限未能讀取 `Mhy55NUKBCVIJdt4EpN4xt`，故尚未實際抽取 Figma 背景圖；需稍後補放 `public/assets/figma-new-chinese-bg.png`。
- 2026-06-28 入口頁微調後完成 `node --check public/script.js` 及 `node --check server.js`；內建瀏覽器拒絕再次訪問 `localhost:3100`，故未作第二輪瀏覽器截圖驗證。

### Deployment
- 嘗試重新部署 Google Cloud Run 前，環境未提供 `gcloud` 指令；其後需要雲端權限的指令因系統用量限制被拒絕。未能在本輪自動重新上載至 `https://huitan-qiying-705615272136.asia-east1.run.app`。

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
