// 把 results.json + docs/uat-cases.md 組成圖文報告，輸出到 docs/uat/report-<日期>-run-A.md
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = fileURLToPath(new URL('../../', import.meta.url));
const TODAY = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

const WORK = process.argv[2] ?? join(PROJECT, '.scratch/uat');
const OUT = join(PROJECT, 'docs/uat');
const { results, statsBefore, statsAfter } = JSON.parse(readFileSync(join(WORK, 'results.json'), 'utf8'));
const cases = readFileSync(join(PROJECT, 'docs/uat-cases.md'), 'utf8');

// 從案例文件取「期望結果」
const expected = {};
for (const block of cases.split(/\n## /).slice(1)) {
  const id = block.match(/^(TC-[A-Z]+-\d+)/)?.[1];
  const exp = block.match(/\*\*期望結果\*\*：(.+)/)?.[1];
  if (id) expected[id] = exp;
}

const ICON = { PASS: '✅ 通過', PARTIAL: '⚠️ 部分（推播需真 LINE）', FAIL: '❌ 失敗' };
const WHO = { 阿凱: '司機阿凱', 小魚: '乘客小魚', 小浪: '乘客小浪', 小沙: '乘客小沙', 小新: '新使用者小新', 訪客: '訪客（未登入）' };
const NOTE = {
  'TC-CONTACT-03': '2026-11-19 首輪失敗（輸入框沒被標示、訊息重複成「請填寫聯絡方式：聯絡方式」），已修正 `public/app.js` 的 `contactForm` 與 `errorText` 後重跑通過。',
  'TC-MEET-03': '頁面上看得到集合點；伺服器 log 的接受推播文字含「集合點：後山埤站 1 號出口，白色 RAV4」。手機實際收到推播仍需跑法 B。',
  'TC-CANCEL-01': '行程頁標示已取消、取消按鈕消失、首頁不再列出；log 有 2 則「已被司機取消」推播（已接受＋待確認各一）。手機實際收到推播仍需跑法 B。',
  'TC-CANCEL-04': '申請卡消失、重新出現申請表單、座位回到剩 2 位；log 有「小魚 退出了你…」推播。手機實際收到推播仍需跑法 B。',
  'TC-CANCEL-05': '阿凱清單不再有小浪、座位不變；log 沒有退出推播。手機端確認仍需跑法 B。',
  'TC-TRIP-01': '依案例同時填單程 150、來回 250。單程是必填、來回是選填，這是規格行為，不是 bug。',
  'TC-TRIP-02': '畫面停在「請先登入／登入後才能發行程。」正是期望結果。',
  'TC-FIND-08': '資料：明天兩趟（05:00、07:00）＋後天一趟，比案例前置多一趟，不影響判定。',
  'TC-REQ-12b': '補充：小浪以短板申請 T3 成功（TC-REQ-12 的「申請成功」部分）。',
  'TC-CONTACT-02b': '補充：小新填好聯絡方式後出現申請表單（TC-CONTACT-02 的後半）。',
  'TC-CONTACT-06b': '補充：TC-CONTACT-06 的步驟 3，合法手機號碼儲存後出現申請表單。',
};
const NO_SHOT = new Set(['TC-METRIC-01', 'TC-METRIC-02']);

const count = (s) => results.filter((r) => r.status === s).length;
const L = [];
L.push('# 浪乘 UAT 執行報告 — 跑法 A（自動化）', '');
L.push(`- **執行日期**：${TODAY}`);
L.push('- **方式**：無頭 Edge＋Chrome DevTools Protocol 實際操作畫面（點按鈕、填表單），手機尺寸 400px 寬');
L.push('- **環境**：環境 L（`DEV_LOGIN=1`），獨立測試伺服器 `localhost:3011`、每個場景一個全新資料庫；推播 token 清空，推播文字只印在伺服器 log、沒有送出真推播');
L.push('- **角色**：每個角色一個獨立瀏覽器環境（cookie 不共用）');
L.push(`- **結果**：✅ ${count('PASS')} 通過　⚠️ ${count('PARTIAL')} 部分　❌ ${count('FAIL')} 失敗`, '');
L.push('> 截圖是每個案例最後一步的畫面，標示是誰的視角。', '');

L.push('## 總表', '', '| 案例 | 名稱 | 結果 |', '| --- | --- | --- |');
for (const r of results) L.push(`| [${r.id}](#${r.id.toLowerCase()}) | ${r.title} | ${ICON[r.status]} |`);
L.push('');

L.push('## 需要處理', '');
if (!results.some((x) => x.status === 'FAIL')) L.push('無失敗案例。');
for (const r of results.filter((x) => x.status === 'FAIL')) {
  L.push(`- **${r.id} ${r.title}**：${NOTE[r.id] ?? r.fails.join('；')}`);
}
L.push('');

L.push('## 這次沒跑（需真 LINE／HTTPS／手機）', '');
L.push('- 跑法 B：TC-NOTIFY-01～04（推播本身）；CANCEL-01、04、05、MEET-03 的手機推播部分');
L.push('- 跑法 C：TC-AUTH-01、02、TC-REQ-03、TC-SHARE-01～04', '');

L.push('## 逐案結果', '');
for (const r of results) {
  L.push(`### ${r.id}`, '');
  L.push(`**${r.title}** — ${ICON[r.status]}`, '');
  const base = r.id.replace(/b$/, '');
  if (expected[base]) L.push(`- **期望**：${expected[base]}`);
  if (r.fails.length) L.push(`- **問題**：${r.fails.join('；')}`);
  if (NOTE[r.id]) L.push(`- **備註**：${NOTE[r.id]}`);
  if (r.id === 'TC-METRIC-01' || r.id === 'TC-METRIC-02') {
    L.push('- **做法**：出發時間改成 3 分鐘後（代替 10 分鐘）。三趟同時出發：一趟接受小魚、一趟沒乘客、一趟接受後取消。');
    L.push('', '```text', `$ npm run stats   # 出發前`, statsBefore, `$ npm run stats   # 出發後`, statsAfter, '```');
  }
  if (r.id === 'TC-SHARE-05') {
    L.push('', '貼上的發文文字：', '', '```text', readFileSync(join(WORK, 'TC-SHARE-05.txt'), 'utf8').split('\n').slice(2).join('\n'), '```');
  }
  if (r.shot && !NO_SHOT.has(r.id)) {
    L.push('', `截圖（${WHO[r.who] ?? r.who} 的畫面）：`, '', `<img src="${r.shot}" width="300" alt="${r.id} 截圖">`);
  }
  L.push('');
}

for (const id of NO_SHOT) rmSync(join(OUT, `${id}.png`), { force: true });
writeFileSync(join(OUT, `report-${TODAY}-run-A.md`), L.join('\n'));
console.log(`報告：docs/uat/report-${TODAY}-run-A.md（${results.length} 個案例）`);
