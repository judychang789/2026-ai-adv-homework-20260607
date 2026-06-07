# E2E 金流測試 Skill — 暮寵日和 PawPaw Shop

## 測試目標

驗證暮寵日和寵物用品電商（http://localhost:3001）的綠界 ECPay 金流完整購物流程，涵蓋正常付款成功與常見異常情境。

## 工具

**Playwright MCP** — 透過 MCP 工具操作瀏覽器，執行所有步驟時使用 `mcp__playwright__*` 系列工具：

| 工具 | 用途 |
|---|---|
| `browser_navigate` | 前往指定 URL |
| `browser_click` | 點擊元素 |
| `browser_type` | 填入文字 |
| `browser_select_option` | 選擇下拉選項 |
| `browser_wait_for` | 等待元素或網路閒置 |
| `browser_take_screenshot` | 擷取畫面（作為步驟證據） |
| `browser_get_visible_text` | 讀取頁面文字內容 |

---

## 前置條件

1. 伺服器已啟動：`npm start`（port 3001）
2. `.env` 已設定有效的 ECPay 測試環境參數：
   - `ECPAY_MERCHANT_ID`、`ECPAY_HASH_KEY`、`ECPAY_HASH_IV`
   - `ECPAY_IS_SANDBOX=true`（確認為測試模式）
   - `BASE_URL=http://localhost:3001`
3. 資料庫已有種子商品（首次啟動自動建立）
4. 已知測試帳號（從 `src/database.js` seed 查看）

### 綠界測試信用卡

| 欄位 | 值 |
|---|---|
| 卡號 | 4311-9522-2222-2222 |
| 有效月年 | 任意未來日期（例如 12/26） |
| CVV | 222 |

---

## 測試步驟

### 正常流程：購物 → 付款成功

**Step 1 — 進入首頁**

```
browser_navigate: http://localhost:3001
browser_take_screenshot
```

預期：頁面標題含「暮寵日和」，首頁 Banner 正常顯示。

---

**Step 2 — 瀏覽商品列表並加入購物車**

```
browser_navigate: http://localhost:3001/products
browser_take_screenshot
```

點擊任一商品卡片右下角「+」按鈕：

```
browser_click: selector=".bg-white.rounded-2xl button[title='加入購物車']" (第一個)
browser_wait_for: networkidle
```

預期：購物車 badge 數字更新為 1。

---

**Step 3 — 前往購物車確認商品**

```
browser_navigate: http://localhost:3001/cart
browser_take_screenshot
```

預期：
- 商品列表正確顯示（名稱、數量、單價）
- 訂單摘要顯示小計、運費、總計
- 「前往結帳」按鈕可見

---

**Step 4 — 登入會員帳號**

若購物車頁出現「請先登入」提示，或點擊結帳跳轉至登入頁：

```
browser_navigate: http://localhost:3001/login
browser_type: selector="#email", text="<測試帳號 email>"
browser_type: selector="#password", text="<測試帳號密碼>"
browser_click: selector="button[type='submit']"
browser_wait_for: networkidle
browser_take_screenshot
```

預期：跳回首頁或購物車，header 顯示使用者名稱。

---

**Step 5 — 進入結帳頁填寫收件資訊**

```
browser_navigate: http://localhost:3001/cart
browser_click: selector="button" (文字含「前往結帳」)
browser_wait_for: url=/checkout/
browser_take_screenshot
```

填寫收件人資訊（Step 2 表單）：

```
browser_type: selector="input[placeholder*='姓名']", text="測試收件人"
browser_type: selector="input[placeholder*='電話']", text="0912345678"
browser_type: selector="input[placeholder*='Email']", text="test@example.com"
browser_type: selector="input[placeholder*='縣市']", text="台北市"
browser_type: selector="input[placeholder*='鄉鎮市區']", text="信義區"
browser_type: selector="input[placeholder*='地址']", text="信義路五段7號"
```

---

**Step 6 — 選擇付款方式（信用卡）**

```
browser_click: selector="付款方式選項：信用卡"
browser_take_screenshot
```

預期：信用卡選項呈現選取樣式（粉紅框線）。

信用卡欄位填入：

```
browser_type: selector="input[placeholder*='卡號']", text="4311952222222222"
browser_type: selector="input[placeholder*='持卡人']", text="TEST USER"
browser_type: selector="input[placeholder*='到期']", text="12/26"
browser_type: selector="input[placeholder*='CVV']", text="222"
```

---

**Step 7 — 送出訂單，跳轉綠界付款頁**

```
browser_click: selector="button" (文字含「確認付款」或「送出訂單」)
browser_wait_for: networkidle
browser_take_screenshot
```

預期：
- 頁面跳轉至綠界付款頁（URL 含 `payment.ecpay.com.tw` 或 `payment-stage.ecpay.com.tw`）
- 頁面顯示訂單金額與商店名稱「暮寵日和」

---

**Step 8 — 使用測試信用卡完成付款（綠界測試環境）**

在綠界付款頁選擇信用卡並填入測試卡資訊：

```
browser_click: selector="信用卡付款選項"
browser_type: selector="卡號輸入框", text="4311952222222222"
browser_type: selector="有效月", text="12"
browser_type: selector="有效年", text="26"
browser_type: selector="CVV", text="222"
browser_click: selector="確認付款按鈕"
browser_wait_for: networkidle, timeout=30000
browser_take_screenshot
```

預期：付款處理中畫面，隨後自動跳轉回本站。

---

**Step 9 — 確認跳回付款完成頁**

```
browser_wait_for: url=/order-confirm/|/payment-complete/
browser_take_screenshot
browser_get_visible_text
```

預期：
- URL 回到 `http://localhost:3001/order-confirm/<id>` 或付款完成頁
- 頁面顯示「付款成功」或綠色完成狀態
- 顯示訂單編號

---

**Step 10 — 確認訂單建立成功**

```
browser_navigate: http://localhost:3001/orders
browser_take_screenshot
browser_get_visible_text
```

預期：訂單列表出現本次訂單，狀態為「已付款」或「處理中」。

選擇性驗證後台：

```
browser_navigate: http://localhost:3001/admin/orders
browser_take_screenshot
```

預期：後台訂單列表含對應訂單編號，金額與商品正確。

---

## 異常情境測試

### A — 欄位驗證錯誤（結帳頁空白送出）

```
browser_navigate: http://localhost:3001/checkout/<有效訂單id>
browser_click: selector="確認付款按鈕" (不填寫任何欄位)
browser_take_screenshot
```

預期：表單顯示驗證錯誤提示（紅色邊框或錯誤訊息），不跳轉至綠界。

---

### B — 付款失敗（使用綠界測試失敗卡號）

綠界測試失敗卡號：`4311-9522-2222-2222`（某些 CVV 組合會觸發失敗，參考綠界測試文件）

```
# 完成到 Step 7 後，在綠界頁填入失敗卡資訊
browser_type: selector="CVV", text="999"  # 觸發失敗的 CVV
browser_click: selector="確認付款按鈕"
browser_wait_for: networkidle
browser_take_screenshot
```

預期：
- 綠界頁顯示付款失敗訊息
- 跳回本站後顯示付款失敗狀態
- 訂單狀態為「待付款」，未標記為成功

---

## 回報格式

每個步驟完成後在對話中回報：

```
## E2E 金流測試結果

**整體結果：** PASS | FAIL

### 正常流程
| 步驟 | 結果 | 備註 |
|---|---|---|
| Step 1 首頁 | ✅ | 截圖：homepage.png |
| Step 2 加入購物車 | ✅ | badge 更新為 1 |
| Step 3 購物車確認 | ✅ | 小計 NT$X，運費 NT$Y |
| Step 4 登入 | ✅ | |
| Step 5 填寫收件資訊 | ✅ | |
| Step 6 選擇付款方式 | ✅ | 信用卡已選取 |
| Step 7 跳轉綠界 | ✅ | URL: payment-stage.ecpay.com.tw |
| Step 8 綠界付款 | ✅ | |
| Step 9 付款完成頁 | ✅ | 訂單編號：XXXXXXXX |
| Step 10 訂單確認 | ✅ | 狀態：已付款 |

### 異常情境
| 情境 | 結果 | 備註 |
|---|---|---|
| A 欄位驗證 | ✅ | 顯示錯誤提示 |
| B 付款失敗 | ✅ | 狀態保持待付款 |

### 發現事項
- ⚠️ （任何值得注意的問題）
- 🔍 （邊界測試觀察）
```

---

## 參考資訊

- 綠界測試環境文件：https://developers.ecpay.com.tw/?p=2509
- 本站 ECPay 整合：`src/routes/orderRoutes.js`（`/ecpay-form`、`/ecpay-return`）
- 前端送出邏輯：`public/js/pages/order-confirm.js`（`submitEcpayForm()`）
- 設計稿：`docs/design/P6 訂單確認.png`、`docs/design/P7 付款完成.png`
