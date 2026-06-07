# 暮寵日和 PawPaw Shop

## AI Agent 協作挑戰一

- **Design Skill**：frontend-design SKILL.md（路徑：.claude/skills/frontend-design/SKILL.md）
- **設計工具**：Pencil（pencil.dev）透過 MCP 與 Claude Code CLI 整合
- **設計稿位置**：docs/design/
- **切版頁面**：首頁、商品列表、購物車、結帳（綠界金流）、訂單確認、付款完成

暮寵日和 PawPaw Shop 是一個寵物用品電商示範專案，涵蓋前台商品瀏覽、會員註冊登入、雙模式購物車、會員下單、綠界 ECPay 付款，以及後台商品與訂單管理。專案採用單一 Node.js 應用提供 API 與 EJS 頁面，前端互動邏輯以 Vue 3 CDN 版本掛載在頁面容器上，適合用來示範「伺服器渲染頁面 + 輕量前端互動 + SQLite 持久化」的整合實作。

本專案的關鍵技術決策如下：

- 後端沒有分層 service/repository，業務邏輯刻意保留在 route 檔案內，方便直接理解流程與修改 SQL。
- 購物車採雙模式身份識別。登入會員用 JWT 綁定 `user_id`，訪客用 `X-Session-Id` 綁定 `session_id`。
- 訂單只允許登入會員建立，訪客購物車不會直接結帳。
- 訂單付款已串接綠界 ECPay AIO；付款完成後，前端回到本地頁面並主動呼叫綠界查詢 API 驗證交易結果。
- API 文件透過 route 檔案內的 OpenAPI JSDoc 生成，`npm run openapi` 會產出 `openapi.json`。

## 技術棧

| 類別 | 技術 |
| --- | --- |
| Runtime | Node.js |
| Web Framework | Express 4 |
| Database | SQLite + `better-sqlite3` |
| Auth | `jsonwebtoken`, `bcrypt` |
| View | EJS |
| Frontend | Vue 3 CDN 版 |
| Styling | Tailwind CSS v4 CLI |
| Testing | Vitest, Supertest |
| API Spec | swagger-jsdoc / OpenAPI 3.0.3 |

## 快速開始

1. 安裝依賴：

```bash
npm install
```

2. 建立環境變數：

```bash
cp .env.example .env
```

3. 啟動開發伺服器：

```bash
npm run dev:server
```

4. 另一個終端啟動 Tailwind 監看：

```bash
npm run dev:css
```

5. 若要用正式啟動流程驗證 CSS 編譯與啟動：

```bash
npm run start
```

6. 執行測試：

```bash
npm run test
```

7. 產出 OpenAPI：

```bash
npm run openapi
```

預設站點位於 `http://localhost:3001`。`server.js` 啟動時若缺少 `JWT_SECRET` 會直接終止，因此 `.env` 至少要提供這個變數。

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `npm run start` | 先編譯 Tailwind，再以 `node server.js` 啟動應用 |
| `npm run dev:server` | 直接啟動伺服器，不先建置 CSS |
| `npm run dev:css` | 監看 `public/css/input.css` 並輸出 `public/css/output.css` |
| `npm run css:build` | 產生壓縮後的 `public/css/output.css` |
| `npm run openapi` | 從 route JSDoc 產生 `openapi.json` |
| `npm run test` | 以 Vitest 依固定順序執行 API 測試 |

## 開發測試資料

本專案在開發與測試環境會自動建立管理員帳號與商品種子資料，方便功能驗證與助教測試。

- 管理員帳號由 `src/database.js` 的 seed 流程建立
- 若 `products` 為空，會自動建立 8 筆寵物用品商品資料

⚠️ 預設帳號資訊未公開於 README，請於本機 seed 設定或程式碼中查看  
⚠️ 請勿在正式環境使用任何預設帳號

測試環境下 `bcrypt` salt rounds 會降低以加快測試速度。

## 文件索引

| 文件 | 內容 |
| --- | --- |
| `docs/ARCHITECTURE.md` | 系統架構、目錄用途、啟動流程、路由與資料流 |
| `docs/DEVELOPMENT.md` | 開發規範、命名、模組系統、環境變數、擴充流程 |
| `docs/FEATURES.md` | 各功能模組的實際行為、參數、錯誤碼、完成狀態 |
| `docs/TESTING.md` | 測試結構、順序、輔助函式與新增測試方式 |
| `docs/CHANGELOG.md` | 文件與專案更新紀錄 |

## 專案結構摘要

```text
app.js                 Express 應用組裝
server.js              啟動入口
src/database.js        SQLite schema + seed
src/routes/            API 與頁面路由
src/middleware/        驗證、授權、session、錯誤處理
public/js/             前端共用工具與各頁 Vue 腳本
views/                 EJS layout / partial / page 模板
tests/                 Vitest + Supertest API 測試
docs/                  專案文件與開發計畫
```

## 開發注意事項

- 購物車 API 若同時帶 JWT 與 `X-Session-Id`，會優先使用 JWT；一旦 JWT 無效，不會退回 session 模式，而是直接回 `401`。
- 前端 `Auth.getAuthHeaders()` 無論是否登入都會送出 `X-Session-Id`，所以許多前台 API 可在訪客狀態下正常運作。
- 前端結帳頁顯示了運費與免運門檻，但後端訂單 `total_amount` 只計算商品小計，未寫入運費。
- `BASE_URL` 目前用於產生 ECPay 的 `ReturnURL` 與 `ClientBackURL`。
- 本機開發模式無法接收綠界 Server Notify，因此付款確認依賴主動查詢 `QueryTradeInfo`，不是依賴 callback 必定送達。
