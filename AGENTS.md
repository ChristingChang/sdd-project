# ＜浪乘SDDver＞ —— agent 工作規則

> 從 agent-skills-starter 模板開出來的專案。**把 ＜＞ 換成你的內容**，用不到的段落刪掉。
> Codex 讀這一份；Claude Code 讀 `CLAUDE.md`，它只有一行 `@AGENTS.md`，所以規則只寫在這裡。

## 這是什麼

台北到宜蘭的衝浪共乘平台：司機發行程、乘客篩選申請，取代在 FB 社團翻貼文配對。手機優先網頁，LINE 登入。

## 規格在哪

- 需求：GitHub Issue #1（`PR-*` 編號是凍結的，測試名稱以它開頭）
- 架構：`docs/adr/`；領域語言：`CONTEXT.md`；LINE 設定：`docs/line-setup.md`
- 兩份衝突、或規格沒寫的行為：**停下來問**，不要自己決定。

## 怎麼跑

```bash
cp .env.example .env   # 沒有第三方套件，不需要 npm install
npm start              # http://localhost:3001
npm test
npm run stats          # 每週成行趟數
```

說「完成」之前，必須跑過測試並貼出結果。

## 紅線

- 不准新增套件，除非先說明理由並得到同意。
- 秘密只放 `.env`，不准寫進任何其他檔案。
- 不准修改或刪除測試來讓測試通過。
- 聯絡方式不准出現在公開 API：未被接受者的回應含聯絡方式即違反（`PR-CONTACT-02` 測試會擋）。
- `DEV_LOGIN` 不准用於正式環境：`NODE_ENV=production` 或 HTTPS 網址時伺服器會拒絕啟動。
- FB 貼文的真實姓名不准進 repo：`surf_carpool_tracking.csv` 只留在 repo 外。

## 工具鏈

`.claude/skills/` 是這個專案的技能，Codex 透過 `.agents/skills` symlink 讀同一份。改技能前讀 `.claude/skills/README.md`，改完跑 `bash scripts/check.sh`。

## Agent skills

### Issue tracker

GitHub Issues（`gh` CLI）。見 `docs/agents/issue-tracker.md`。

### Domain docs

single-context，shared。見 `docs/agents/domain.md`。

### Comment language

程式註解一律使用繁體中文。
