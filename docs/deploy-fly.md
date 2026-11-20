# 部署到 Fly.io

設定檔：`fly.toml`、`Dockerfile`。機房在東京（`nrt`），資料庫放在 1GB 的 volume 上。

## 費用（2026-11-20 查詢東京 nrt 價格，以官方為準）

- 最小機器 shared-cpu-1x 256MB：東京 2.87 美元/月（24 小時開機；美國 Ashburn 是 2.19 美元，東京貴約 30%）。閒置自動關機時更少
- Volume：0.15 美元/GB/月（1GB）
- 流量：亞太區 0.04 美元/GB，小網站可忽略。共用 IPv4 免費，不需要另買專用 IPv4
- 快照：每月前 10GB 免費
- [計算機](https://fly.io/calculator/)估算（1 台 shared-cpu-1x 256MB、nrt、1GB volume）：**約 3.02 美元/月**
- 帳單低於 5 美元免收，這個配置在範圍內
- 註冊送 1 美元額度，不用綁信用卡。2026-11-20 第一次部署（建 app、volume、deploy）都沒有被要求綁卡；額度用完後是否要綁卡，以 Fly 的通知為準
- 價格查法：[定價頁](https://fly.io/pricing) 表格上方的機房下拉選單要切到 **Tokyo**，預設顯示的是美國 Ashburn
- 官方價格：https://fly.io/docs/about/pricing/

## 第一次部署

以下指令都在專案根目錄（有 `fly.toml` 的資料夾）執行。

1. **安裝 flyctl**（PowerShell）：

   ```powershell
   iwr https://fly.io/install.ps1 -useb | iex
   ```

   裝完重開終端機，跑 `fly version` 確認有裝好。

2. **登入**：`fly auth login`，會開瀏覽器註冊或登入。目前不用先綁信用卡；之後 Fly 要求時再到 Billing 頁面加上。

   安裝程式要建立 `fly` 捷徑時會跳出管理員權限視窗。拒絕的話 `fly` 指令不能用，改用 `& "$env:USERPROFILE\.fly\bin\flyctl.exe"`，後面參數一樣。

3. **建立 app**（不要用 `fly launch`，它會改寫 `fly.toml`）：

   ```bash
   fly apps create surfpool-langcheng
   ```

   名稱被用走時換一個，並把 `fly.toml` 裡的 `app` 和 `BASE_URL` 一起改掉。

4. **建立 volume**（名稱要和 `fly.toml` 的 `source` 一樣）：

   ```bash
   fly volumes create carpool_data --region nrt --size 1
   ```

   出現單一 volume 沒有備援的警告時回答 `y`。

5. **設定秘密**：把本機 `.env` 裡的三個 LINE 值填進去。秘密只存在 Fly，不寫進任何檔案：

   ```bash
   fly secrets set --stage LINE_LOGIN_CHANNEL_ID=xxx LINE_LOGIN_CHANNEL_SECRET=xxx LINE_MESSAGING_ACCESS_TOKEN=xxx
   ```

   `--stage` 是先存起來、下一次部署時才套用。第一次部署前還沒有機器，所以要加；之後更新秘密時拿掉 `--stage`，機器會直接重啟套用。`fly secrets list` 可以確認名稱有沒有設好（只顯示名稱，不顯示值）。

   **不要**設定 `DEV_LOGIN`。正式環境開了伺服器會拒絕啟動。

6. **部署**：

   ```bash
   fly deploy --ha=false
   ```

   `--ha=false` 讓 Fly 只開一台機器。資料庫是單一 SQLite 檔，volume 只能掛在一台機器上，開兩台會讓兩台各自有一份資料（見 `docs/adr/0001-zero-dependency-node.md`）。

7. **改 LINE 設定**：到 LINE Developers Console 的 LINE Login channel，把 Callback URL 加上
   `https://surfpool-langcheng.fly.dev/auth/line/callback`。本機的 `http://localhost:3001/...` 可以保留，本機測試還用得到。

8. **驗收**：手機打開 `https://surfpool-langcheng.fly.dev`，照 `docs/line-setup.md` 的「手動驗收」表跑一次。

## 之後更新

合併到 main 後，在本機切到 main、`git pull`，再跑：

```bash
fly deploy --ha=false
```

部署期間網站會中斷幾秒，資料不受影響。

## 常用指令

| 要做什麼 | 指令 |
|---|---|
| 看即時 log（推播失敗的訊息在這裡） | `fly logs` |
| 看機器狀態 | `fly status` |
| 每週成行趟數 | `fly ssh console -C "node --disable-warning=ExperimentalWarning src/stats.js"` |
| 看 volume 快照 | `fly volumes snapshots list <volume id>`（id 用 `fly volumes list` 查） |

機器閒置時會自動關機。`fly ssh console` 前若顯示沒有在跑的機器，先打開網站把它叫醒。

## 備份

Fly 每天自動幫 volume 拍快照，預設保留 5 天。建議每週再自己下載一份留在本機：

1. `fly ssh console` 進到機器裡，執行下面這行產生一份一致的副本（伺服器運作中也安全），然後 `exit`：

   ```bash
   node -e "new (require('node:sqlite').DatabaseSync)('/data/carpool.db').exec(\"VACUUM INTO '/data/backup.db'\")"
   ```

2. 回到本機，下載到 repo **外面**的資料夾：

   ```bash
   fly ssh sftp get /data/backup.db ../carpool-backup-2026-11-19.db
   ```

3. 刪掉機器上的副本，不然下次的 `VACUUM INTO` 會因檔案已存在而失敗：

   ```bash
   fly ssh console -C "rm /data/backup.db"
   ```

備份檔含用戶聯絡方式，不要放進 repo。
