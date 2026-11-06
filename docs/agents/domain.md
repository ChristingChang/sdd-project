# Domain docs

## 版面：single-context

- 領域語言：repo 根目錄的 `CONTEXT.md`
- 架構決策：`docs/adr/`（ADR 編號遞增，例如 `0001-<slug>.md`）

尚未建立；第一次需要時由 domain-modeling 技能建立。

## 協作模式：shared

單人 repo。技能寫出的所有檔案都要 commit，沒有排除任何路徑（`.git/info/exclude` 未使用）。
若日後有不用這些技能的隊友加入，重跑 setup-skills 改為 private。

## 註解語言：繁體中文

程式註解一律使用繁體中文。這是團隊共識（跟著程式碼走），所以寫在已 commit 的 `AGENTS.md`，任何模式都一樣。

## 原則

只有工具會讀的文件沒有人幫忙發現它過期。隊友也該知道的事實，要升格寫進 `AGENTS.md` 或 ADR，不要只留在技能專用的檔案裡。
