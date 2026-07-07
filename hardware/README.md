# ESP32 + ELB070681 搖桿藍牙鍵盤

將 [ELB070681](https://tpai.ru/platy-i-moduli-dlya-arduino-proektov-programmatory/moduli-arduino-sovmestimye/klaviatury-dzhojstiki-moduli-pereklyuchatelej/modul-gejmpada-ywrobot-elb070681)
遊戲手掣模組（YWRobot，PS2 式雙軸搖桿 VRx/VRy/SW ＋ 4 粒獨立按鈕 K1–K4）接駁到
**普通 ESP32 開發板**（CP2102 USB-序列版，無原生 USB），扮成一部**藍牙 (BLE) 鍵盤**，
控制「單鍵創作」流程中圖示嘅擺放位置。

**網站程式碼一行都唔使改** —— `public/script.js` 已經有一套鍵盤 fallback（只喺撳咗
「單鍵創作」時回應），呢個韌體純粹送出同一組按鍵：

| 動作 | 送出嘅鍵 | 效果 |
|---|---|---|
| 撥動搖桿 | ArrowUp/Down/Left/Right | 移動圖示 6% |
| 開咗微調模式再撥動 | Shift + Arrow | 移動圖示 2%（微調） |
| 撳搖桿（SW） | Enter | 確認目前選項／放置 |
| 撳 K1 | Escape | 返回上一步 |
| 撳 K2 | （無按鍵，本機切換） | 開／關「微調模式」 |

---

## 接線表

| ELB070681 腳位 | 功能 | 接去 ESP32 GPIO | 備註 |
|---|---|---|---|
| VCC | 供電 | **3.3V**（唔好接 5V） | 保持類比輸出喺 ESP32 ADC 安全嘅 0–3.3V 範圍 |
| GND | 共地 | GND | |
| VRx | X 軸類比 | **GPIO34**（ADC1_CH6） | ADC1，BLE 運作時仍然可靠讀取 |
| VRy | Y 軸類比 | **GPIO35**（ADC1_CH7） | 同上 |
| SW | 搖桿按下 | **GPIO32**，`INPUT_PULLUP` | 確認（Enter） |
| K1 | 額外按鈕 1 | **GPIO33**，`INPUT_PULLUP` | 返回（Escape） |
| K2 | 額外按鈕 2 | **GPIO25**，`INPUT_PULLUP` | 切換微調模式 |
| K3 / K4 | 額外按鈕 3/4 | 暫不接（預留 GPIO26/27） | 日後可擴充 |

> ⚠️ **千祈唔好用 ADC2 腳位**（GPIO0/2/4/12-15/25-27 當中屬 ADC2 嘅）嚟做搖桿類比輸入——
> ADC2 同 BLE/WiFi 嘅 RF 前端共用電路，BLE 開始運作後會讀數唔準。GPIO34/35 屬 ADC1，
> 唔受影響，所以搖桿一定要接呢兩腳。
>
> ⚠️ GPIO1/3 係 CP2102 燒錄用嘅 UART TX/RX，千祈唔好接任何線落去。

---

## Arduino IDE 設定

1. **開發板**：Tools → Board → 選 "ESP32 Dev Module"（或你塊板嘅對應型號）。
2. **安裝 Library**（Sketch → Include Library → Manage Libraries）：
   - `ESP32 BLE Keyboard`（作者 **T-vK**）—— 淨係裝呢個就夠。
   - **唔使裝 `NimBLE-Arduino`**：呢個 library 未跟得切 NimBLE-Arduino 最新版嘅 API，
     裝咗會編譯錯誤（見下面「常見問題」）。Sketch 用返 library 內建、隨 ESP32 core
     附帶嘅經典 Bluedroid BLE 堆疊——慢少少、食多少少 flash/RAM，但穩陣、即刻編譯到。
3. 打開 `esp32_joystick_ble_keyboard/esp32_joystick_ble_keyboard.ino`，燒錄到板。
4. 打開 Serial Monitor（115200 baud），應該見到：
   ```
   繪畫耆才 Joystick — BLE 廣播中，請喺電腦/平板藍牙設定連接。
   ```

---

## 配對步驟

- **Windows / macOS / Android**：藍牙設定入面應該會見到「繪畫耆才 Joystick」，揀嚟配對，
  通常會自動連上。
- **iPad / iOS**：設定 → 藍牙 → 見到裝置後**要手動撳一下「連接」**——第一次配對唔會自動連上。
  配對後日後開機會自動重連（唔使每次都手動連），所以示範前建議提早配對好一次。
- 展示期間建議用 USB（電腦或火牛）供電，唔好淨係靠電池，減少「電量唔夠」呢個
  額外嘅示範失敗風險。

---

## 測試步驟

1. 配對成功後，開一個純文字編輯器（例如記事本），撥動搖桿確認打出方向鍵字元；
   撳 SW/K1 確認打出 Enter/Escape；撳住 K2 切換後再撥動，確認方向鍵連同 Shift
   一齊送出（文字編輯器入面 Shift+方向鍵通常會反白選字，可以用嚟目測驗證）。
2. 打開繪畫耆才網站 → 獨畫 → 揀畫紙 → 撳「單鍵創作」→ 撥動搖桿，確認畫面圖示
   跟住郁動；撳 SW 確認選項/放置；撳 K1 返回上一步；撳 K2 切換後再撥動，
   確認步幅變細（微調）。全程唔使開瀏覽器開發者工具——扮鍵盤同用真鍵盤操作一致。

---

## 常見問題

- **搖桿完全冇反應**：先確認 BLE 已配對連接（`bleKeyboard.isConnected()` 為 true 先會
  讀搖桿——韌體刻意咁做，慳電兼避免未連接時亂送鍵）。
- **手一放開搖桿都繼續郁**：檢查 VCC 係咪接咗 3.3V 而唔係 5V（電壓錯會令中心值飄移，
  超出死區）；亦可以喺 sketch 入面調大 `DEADZONE`。
- **撳一下掣變咗兩下確認/返回**：可以調大 `BTN_COOLDOWN_MS`（現時 450ms）。
- **編譯錯誤 `'NimBLEAdvertising' does not name a type`／`expected class-name before ',' token`**：
  代表你裝咗 `NimBLE-Arduino` 而且版本太新，同 `ESP32 BLE Keyboard` library 期望嘅
  舊版 NimBLE API 唔匹配。修法：喺 Arduino IDE 嘅 Library Manager 移除／唔裝
  `NimBLE-Arduino`，確認 sketch 頂部**冇** `#define USE_NIMBLE`（本 sketch 預設已經冇
  呢行），淨係用 `ESP32 BLE Keyboard` 呢個 library 就可以編譯到（走經典 Bluedroid 路徑）。
  如果你堅持想用 NimBLE 慳資源，需要透過 Library Manager 手動揀返一個較舊嘅
  NimBLE-Arduino 版本（約 1.4.x）先會同呢個 library 相容——一般示範用途唔建議咁做，
  夠用就好，唔使追求極致效能。
