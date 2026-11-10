# LINE 串接設定

沒有這些設定時，本機可用 `DEV_LOGIN=1` 假登入，推播內容會印在終端機。

1. 到 [LINE Developers Console](https://developers.line.biz/console/) 建立一個 Provider。
2. 在**同一個 Provider** 底下建立兩個 channel。不同 Provider 的用戶 ID 不同，推播會送不到人。
   - **LINE Login**：把 Channel ID、Channel secret 填進 `.env` 的 `LINE_LOGIN_CHANNEL_ID`、`LINE_LOGIN_CHANNEL_SECRET`。
   - **Messaging API**（官方帳號）：發行 Channel access token，填進 `LINE_MESSAGING_ACCESS_TOKEN`。
3. 在 LINE Login channel 設定 Callback URL：`<BASE_URL>/auth/line/callback`。
4. 在 LINE Login channel 的 Linked LINE Official Account 選擇第 2 步的官方帳號，登入時才會邀請用戶加好友。
5. **只在部署到正式環境時**：把 `BASE_URL` 改成對外的 HTTPS 網址，並刪掉 `DEV_LOGIN`。本機測試請保留 `DEV_LOGIN=1`，才能用無痕視窗假登入扮演另一個人。
6. LINE Login channel 建立後是 Developing 狀態，只有管理員和測試者能登入。測試時到 **Roles** 分頁邀請測試者；正式上線前按頁面上方的 **Publish**。

## 手動驗收

自動測試用假的 LINE 客戶端，只驗證我們送出的內容。以下項目只有接上真的 LINE 才驗得到：`.env` 的值、Callback URL、兩個 channel 是否同 Provider、好友關係。

推播失敗時操作仍然成功，只在終端機印 `推播失敗 …`，畫面上看不出來，所以改過 LINE 設定或 `.env` 後都要重跑一次。

準備兩個 LINE 帳號：A 當司機，B 當乘客。B 要先被加為測試者（見第 6 步），兩人分別用一般視窗和無痕視窗登入。

| # | 操作 | 預期結果 |
|---|---|---|
| 1 | A、B 各自用 LINE 登入 | 出現加官方帳號好友的畫面，加入後回到網站並顯示已登入 |
| 2 | A 填聯絡方式並發一趟行程 | 行程出現在列表 |
| 3 | B 填聯絡方式並申請這趟行程 | A 收到「B 申請了你 … 的行程」 |
| 4 | A 接受 | B 收到「已被接受，可以查看司機聯絡方式」，B 在行程頁看得到 A 的聯絡方式 |
| 5 | B 退出 | A 收到「B 退出了你 … 的行程，座位已釋出」 |
| 6 | B 再申請、A 再接受，然後 A 取消行程 | B 收到「已被司機取消」 |
| 7 | 另發一趟行程，B 申請、A 拒絕 | B 收到「未被接受」，B 看不到 A 的聯絡方式 |

沒收到推播時，看跑 `npm start` 的終端機：

- `推播失敗 LINE 推播失敗：401`：`LINE_MESSAGING_ACCESS_TOKEN` 錯誤或過期。
- `推播失敗 LINE 推播失敗：400`：LINE 不認得這個用戶 ID，最常見的原因是兩個 channel 不在同一個 Provider。
- `[推播未設定] …`：`LINE_MESSAGING_ACCESS_TOKEN` 沒填，推播只印在終端機。
- 沒有任何錯誤但收不到：確認收件人有加官方帳號好友、沒有封鎖。

推播裡的連結是 `BASE_URL`。在本機測試時是 `http://localhost:3001/...`，手機點不開是正常的。

## 注意

- 用戶必須加官方帳號好友才收得到推播。沒加好友時推播會失敗，但操作本身仍然成功（只記錄 log）。
- 官方帳號的免費訊息額度有上限，正式上線前請到 LINE 官方確認目前方案。
- 正式環境需要 HTTPS，且 `DB_PATH` 要放在重新部署後不會消失的磁碟上。
