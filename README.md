# 繪壇耆英 · Huitan Qiying

> 為長者而設的即時協作數位畫室 — A real-time collaborative digital painting platform designed specifically for elderly users, in a New Chinese Style (新中式) aesthetic.

繪壇耆英 將數位介面轉化成長者熟悉的實體隱喻 —— 窗框、文具、貓咪、宣紙、印章 —— 降低數位創作的認知門檻。系統建基於 Node.js / Express + Socket.IO，支援三種模式：獨畫、共繪、掌櫃。

## ✨ 特色

- **獨畫 (Single)** — 在空白宣紙或線稿上獨自繪畫，作品自動存入個人 localStorage 畫廊
- **共繪 (Multi)** — 四位數字房間碼即時多人協作（Socket.IO）
- **掌櫃 (Admin)** — 密碼保護的線稿管理後台（上傳 / 刪除）
- **八大設計語言** — 窗景畫布、實體文具工具列、印泥盒選色、窗台貓咪語音助手、翻頁式導航、宣紙動態背景、書寫回饋、時光膠囊封存儀式
- **長者友善** — 22px 基礎字體、56px 觸控目標、高對比傳統中國色、粵語 (zh-HK) 語音控制與朗讀（語速 0.9）

## 🛠 技術

| 層 | 技術 |
| --- | --- |
| 後端 | Node.js · Express 4.18 · Socket.IO 4.7 · Multer |
| 前端 | 原生 HTML5 / CSS3 / JavaScript |
| 字體 | Google Noto Serif SC |
| 語音 | Web Speech API（辨識 + 合成） |
| 儲存 | 伺服器記憶體（房間）+ localStorage（個人作品） |

## 🚀 本地運行

```bash
npm install
npm start
```

開啟 http://localhost:3000 。掌櫃預設密碼 `8888`（可用環境變數 `ADMIN_PASSWORD` 覆寫）。

> 建議使用 Chrome / Edge（Windows）或 Safari 14.1+（macOS / iPad）以獲得完整語音體驗。

## 📄 文件

完整工程設計見隨附的 Engineering Notes（v3.1）。維護指引見 [`CLAUDE.md`](CLAUDE.md)。

## ⚠️ 安全

此為原型：管理密碼為硬編碼、明文傳輸，未啟用 HTTPS。生產環境請依 Engineering Notes §14 加固。

---

License: Proprietary — All rights reserved.
