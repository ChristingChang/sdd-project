# 0001：MVP 使用零第三方套件的 Node.js

Status: Accepted

## 背景

第一版要快速上線驗證需求，規模是單一路線、單人開發。`AGENTS.md` 規定新增套件要先取得同意。

## 決定

只用 Node.js 22 內建功能：`node:http`、`node:sqlite`、`node:test`；前端用原生 JavaScript，不經建置步驟。

## 取捨

- 好處：沒有依賴要維護，clone 後不用安裝就能跑。
- `node:sqlite` 在 Node 22 仍是實驗性功能，升級 Node 時要重跑測試。
- 只能單一行程部署：`src/service.js` 靠同步執行避免座位超賣，資料也在單一 SQLite 檔案。
- 前端功能明顯變多時，應重新評估是否引入框架。
