// 繪壇耆英 · ESP32 + ELB070681 搖桿 → 藍牙鍵盤
//
// 將 ELB070681 遊戲手掣模組（PS2 式雙軸搖桿 + SW + K1-K4 按鈕）接駁到普通 ESP32
// （CP2102 版，無原生 USB），扮成一部藍牙 (BLE) 鍵盤，直接命中網站 public/script.js
// 現有嘅方向鍵 fallback（只喺撳咗「單鍵創作」、scanController.active 時先回應）：
//   ArrowUp/Down/Left/Right → 移動 6%；Shift+方向鍵 → 移動 2%（微調）
//   Space / Enter           → 確認目前選項
//   Escape / Backspace      → 返回上一步
// 網站程式碼一行都唔使改。
//
// 接線（見 hardware/README.md 完整接線表）：
//   VCC → 3.3V（唔好接 5V）      GND → GND
//   VRx → GPIO34 (ADC1_CH6)      VRy → GPIO35 (ADC1_CH7)
//   SW  → GPIO32（確認）          K1  → GPIO33（返回）
//   K2  → GPIO25（切換微調模式）  K3/K4 → 暫不接
//
// 需要嘅 Arduino Library（Library Manager 安裝）：
//   1. "ESP32 BLE Keyboard" — 作者 T-vK
//   2. "NimBLE-Arduino"     — 作者 h2zero（配合下面 USE_NIMBLE 提供更慳資源、更穩定嘅 BLE 堆疊）

#define USE_NIMBLE
#include <BleKeyboard.h>

// ---------- 接線腳位 ----------
const int PIN_VRX = 34;
const int PIN_VRY = 35;
const int PIN_SW  = 32;  // 搖桿按下 → 確認
const int PIN_K1  = 33;  // 額外按鈕 1 → 返回
const int PIN_K2  = 25;  // 額外按鈕 2 → 切換微調模式

// ---------- 搖桿判讀參數（長者友善：夠慢、夠穩，避免手震誤觸）----------
const int ADC_CENTER      = 2048;  // 12-bit ADC 中心值
const int DEADZONE        = 300;   // 置中容許誤差（~15%），之內當作未郁動
const int MOVE_THRESHOLD  = 1200;  // 偏差要超過呢個值（~60% 行程）先當「已撥動」
const unsigned long FIRST_REPEAT_DELAY = 600;  // 第一步之後，隔幾耐先開始自動連發
const unsigned long REPEAT_INTERVAL    = 380;  // 自動連發嘅間隔

// ---------- 按鈕防彈跳/冷卻參數 ----------
const unsigned long BTN_DEBOUNCE_MS = 80;
const unsigned long BTN_COOLDOWN_MS = 450;

BleKeyboard bleKeyboard("繪壇耆英 Joystick", "Huitan Qiying", 100);

bool fineMode = false;           // K2 切換：開啟後方向鍵連同 Shift 一齊送出
unsigned long lastMoveFireAt = 0;
bool axisWasHeld = false;        // 用嚟分辨「啱啱撥動」vs「持續撥住」，控制連發時序

unsigned long lastSwAt = 0, lastK1At = 0, lastK2At = 0;

void setup() {
  Serial.begin(115200);

  pinMode(PIN_SW, INPUT_PULLUP);
  pinMode(PIN_K1, INPUT_PULLUP);
  pinMode(PIN_K2, INPUT_PULLUP);
  // VRx/VRy 係純類比輸入，唔使 pinMode。

  bleKeyboard.begin();
  Serial.println("繪壇耆英 Joystick — BLE 廣播中，請喺電腦/平板藍牙設定連接。");
}

void loop() {
  if (!bleKeyboard.isConnected()) {
    delay(50);
    return;
  }

  handleAxis();
  handleButtons();
}

// 讀搖桿 X/Y，判斷方向並以「先即發、再等長延遲、之後穩定連發」節奏送出方向鍵。
void handleAxis() {
  int x = analogRead(PIN_VRX) - ADC_CENTER;
  int y = analogRead(PIN_VRY) - ADC_CENTER;
  unsigned long now = millis();

  bool held = (abs(x) > MOVE_THRESHOLD) || (abs(y) > MOVE_THRESHOLD);

  if (!held) {
    axisWasHeld = false;
    return;
  }

  // 中心死區之外但未到方向門檻：忽略，避免手震引發嘅小幅偏移誤觸。
  if (abs(x) < DEADZONE && abs(y) < DEADZONE) return;

  unsigned long waitNeeded = axisWasHeld ? REPEAT_INTERVAL : 0;
  if (!axisWasHeld) {
    // 啱啱由未撥動變成撥動：即時觸發一步，然後要等長延遲先開始連發。
    fireArrow(x, y);
    axisWasHeld = true;
    lastMoveFireAt = now;
    return;
  }

  unsigned long delayForNextRepeat =
      (now - lastMoveFireAt < FIRST_REPEAT_DELAY && lastMoveFireAt != 0)
          ? FIRST_REPEAT_DELAY
          : REPEAT_INTERVAL;

  if (now - lastMoveFireAt >= delayForNextRepeat) {
    fireArrow(x, y);
    lastMoveFireAt = now;
  }
}

// 送出一次方向鍵（按強度較大嘅單一軸決定方向，避免斜向誤判）。
// fineMode 開啟時，連同 Shift 一齊送出，令網站以 2% 步幅移動（微調）。
void fireArrow(int x, int y) {
  uint8_t key;
  if (abs(x) > abs(y)) {
    key = (x > 0) ? KEY_RIGHT_ARROW : KEY_LEFT_ARROW;
  } else {
    key = (y > 0) ? KEY_DOWN_ARROW : KEY_UP_ARROW;
  }

  if (fineMode) {
    bleKeyboard.press(KEY_LEFT_SHIFT);
    delay(10);                 // 俾 host（尤其 iOS）啲時間確認 Shift 已按下
    bleKeyboard.press(key);
    delay(30);
    bleKeyboard.release(key);
    bleKeyboard.release(KEY_LEFT_SHIFT);
  } else {
    bleKeyboard.press(key);
    delay(30);
    bleKeyboard.release(key);
  }
}

// SW → 確認（Enter）；K1 → 返回（Escape）；K2 → 切換微調模式（無鍵盤動作，純本機狀態）。
void handleButtons() {
  unsigned long now = millis();

  if (digitalRead(PIN_SW) == LOW && now - lastSwAt > (BTN_DEBOUNCE_MS + BTN_COOLDOWN_MS)) {
    bleKeyboard.write(KEY_RETURN);
    lastSwAt = now;
  }

  if (digitalRead(PIN_K1) == LOW && now - lastK1At > (BTN_DEBOUNCE_MS + BTN_COOLDOWN_MS)) {
    bleKeyboard.write(KEY_ESC);
    lastK1At = now;
  }

  if (digitalRead(PIN_K2) == LOW && now - lastK2At > (BTN_DEBOUNCE_MS + BTN_COOLDOWN_MS)) {
    fineMode = !fineMode;
    Serial.println(fineMode ? "微調模式：開" : "微調模式：關");
    lastK2At = now;
  }
}
