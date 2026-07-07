# 繪畫耆才 · Huihua Qicai

> 為長者及不同能力人士而設的共融數位創作平台 — An inclusive real-time creative and wellbeing platform for older adults and people with different abilities, in a New Chinese Style (新中式) aesthetic.

繪畫耆才 將數位介面轉化成長者熟悉的實體隱喻 —— 窗框、文具、貓咪、宣紙、印章 —— 降低數位創作的認知門檻。作品由「長者畫畫工具」升級為「共融創作及身心健康平台」，對應心理健康、身體健康、社交聯繫及無障礙護理四個支柱。系統建基於 Node.js / Express + Socket.IO，支援獨畫、共繪、單鍵圖元創作、觸覺圖輸出及掌櫃線稿管理。

## ✨ 特色

- **獨畫 (Single)** — 在空白宣紙或線稿上獨自繪畫，作品自動存入個人 localStorage 畫廊
- **共繪 (Multi)** — 四位數字房間碼即時多人協作（Socket.IO）
- **掌櫃 (Admin)** — 密碼保護的線稿管理後台（上傳 / 刪除）
- **八大設計語言** — 窗景畫布、實體文具工具列、印泥盒選色、窗台貓咪語音助手、翻頁式導航、宣紙動態背景、書寫回饋、時光膠囊封存儀式
- **長者友善** — 22px 基礎字體、56px 觸控目標、高對比傳統中國色、粵語 (zh-HK) 語音控制與朗讀（語速 0.9）
- **身心健康定位** — 創作紓緩情緒、手部活動維持身體參與、共繪房間促進家庭／照顧者互動、單鍵與觸覺輸出支援不同能力人士

## ♿ 共融創作工具

降低手震、精準拖動及視覺理解門檻的共融輸入與回饋系統：

- **防手震（One Euro Filter）** — Casiez 2012 自適應低通濾波：慢速強平滑壓手震、快速放開保持跟手。文具盤可一鍵開／關。
- **單鍵掃描 + 圖元創作** — 使用者只需按空白鍵、Enter 或點擊畫面，即可依序選擇圖元、顏色，再用 joystick／方向鍵控制位置並放置作品元素。
- **統一輔助輸入管理** — 觸控／滑鼠負責自由繪畫；單鍵掃描轉換為 `next / confirm / back / command` 意圖，避免重度肢障使用者需要精準拖動。
- **Joystick 位置控制預備** — 選好圖元及顏色後，可用方向鍵暫代 ESP32 joystick 控制圖示位置，再按空白鍵或 Enter 放置；日後 ESP32 可接入同一組 `move / confirm / back` 指令。
- **顏色聲音化及語音回饋** — 選擇圖元、顏色、位置及完成放置時均有粵語朗讀；紅、藍、綠、黑、金有不同音高提示。
- **觸覺圖輸出原型** — 一鍵輸出高對比黑白 PNG 及 SVG 包裝，並產生簡短作品描述，方便日後製作發泡紙或 3D 觸覺浮雕。

## 🧭 能力匹配設計

| 使用者需要 | 對應功能 |
| --- | --- |
| 手部能力較好 | 自由繪畫、共繪 |
| 手震長者 | 防手震繪畫 |
| 重度肢障人士 | 單鍵掃描 + 圖元創作 |
| 視障人士 | 語音回饋、顏色聲音化、觸覺圖輸出 |
| 家庭／照顧者 | Socket.IO 共繪房間 |

> 頭部操控及視線追蹤已從核心介面移除；核心方案改為穩定、低成本、較易在比賽現場展示的能力匹配流程。

## 🛠 技術

| 層 | 技術 |
| --- | --- |
| 後端 | Node.js · Express 4.18 · Socket.IO 4.7 · Multer |
| 前端 | 原生 HTML5 / CSS3 / JavaScript |
| 字體 | Google Noto Serif SC |
| 語音 | Web Speech API（辨識 + 合成） |
| 儲存 | 伺服器記憶體（房間）+ localStorage（個人作品） |

## 🕹 展示操作

1. 進入「獨畫」或「共繪」並揀一張紙。
2. 按「單鍵創作」。
3. 等候高亮自動掃描，按空白鍵、Enter 或點擊畫面確認圖元及顏色。
4. 用鍵盤方向鍵移動圖示位置；按住 Shift 可微調。
5. 按空白鍵或 Enter 確認位置，再確認放置。
6. 按「輸出觸覺圖」產生高對比黑白圖及作品描述。

## 🎨 Figma 入口頁背景與樣式

三個入口頁（獨畫、共繪、掌櫃）已改為獨立入口介面，文字、按鈕、輸入框及卡片均為真實 HTML/CSS 元件；繪圖畫板內部介面不套用入口頁 portal 樣式。背景 CSS 會讀取：

```text
public/assets/figma-new-chinese-bg.png
```

入口頁微調重點：

- 文字位置移到左側窗格右方，避免遮擋窗框並保留右側山水及案頭。
- 主標題直接疊在新中式背景上，使用淡色文字陰影提升可讀性。
- 操作卡片改為半透明宣紙面板，降低不透明度，讓背景圖仍清晰可見。
- 入口頁按鈕、密碼框及房號輸入框加大，方便長者及現場展示操作。

## 🚀 本地運行

```bash
npm install
npm start
```

開啟 http://localhost:3000 。掌櫃預設密碼 `8888`（可用環境變數 `ADMIN_PASSWORD` 覆寫）。

> 建議使用 Chrome / Edge（Windows）或 Safari 14.1+（macOS / iPad）以獲得完整語音體驗。

## ☁️ Google Cloud Run 部署

現有公開服務：
<https://huitan-qiying-705615272136.asia-east1.run.app>

部署指令：

```bash
gcloud run deploy huitan-qiying \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated \
  --session-affinity \
  --max-instances 1 \
  --timeout 3600
```

部署後建議檢查：

```bash
curl -I https://huitan-qiying-705615272136.asia-east1.run.app/
curl https://huitan-qiying-705615272136.asia-east1.run.app/api/linearts
```

## 📄 文件

完整工程設計見隨附的 Engineering Notes（v3.1）。維護指引見 [`CLAUDE.md`](CLAUDE.md)。

## ⚠️ 安全

此為原型：管理密碼為硬編碼、明文傳輸，未啟用 HTTPS。生產環境請依 Engineering Notes §14 加固。

---

License: Proprietary — All rights reserved.
