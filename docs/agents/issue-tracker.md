# Issue tracker

Issues 放在 GitHub Issues：`ChristingChang/sdd-project`，一律用 `gh` CLI 操作。

> 前置：需要已登入的 `gh`（`gh auth status` 檢查）。
> `gh` 不可用時，停下來告訴使用者，不要改寫成本地檔案。

## 建立 issue

```bash
gh issue create --title "<標題>" --body-file <內文檔路徑> [--label "<label>"]
```

內文先寫到 scratchpad 的暫存檔，再用 `--body-file` 傳入（避免 shell 跳脫問題）。

## 列出未關閉的 issue

```bash
gh issue list --state open --limit 100
```

讀單張：`gh issue view <編號>`

## 阻擋關係

在被阻擋那張 issue 內文最上方寫一行：

```
Blocked by #<編號>
```

多個就各寫一行。被阻擋的票在擋路的票關閉前不可開工。

## Issue 內文放哪

內文就存在 GitHub issue 本身；repo 裡不另存副本。
