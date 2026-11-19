// 浪乘 UAT 跑法 A 自動化：無頭 Edge（或 Chrome）+ CDP（Node 內建 WebSocket），不安裝任何套件。
// 用法：npm run uat。獨立伺服器 port 3011、每個場景一個新 DB（放在 .scratch/uat），推播 token 清空 → 推播文字只印在伺服器 log。
// 截圖寫到 docs/uat/<案例編號>.png，最後呼叫 make-report.mjs 產生圖文報告。
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = fileURLToPath(new URL('../../', import.meta.url)).replaceAll('\\', '/');
const WORK = process.argv[2] ?? join(PROJECT, '.scratch/uat');
mkdirSync(WORK, { recursive: true });
const PORT = 3011;
const BASE = `http://localhost:${PORT}`;
// 預設用 Windows 內建的 Edge；其他環境用 BROWSER_PATH 指定 Chrome／Edge 執行檔
const EDGE = process.env.BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if (!existsSync(EDGE)) { console.error('找不到瀏覽器：' + EDGE + '，請用 BROWSER_PATH 指定'); process.exit(1); }
let lastPage = null;
const SHOTS = join(PROJECT, 'docs/uat');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const taiwanNow = () => new Date(Date.now() + 8 * 3600000);
const twDate = (offset = 0) => new Date(Date.now() + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
const hhmm = (d) => d.toISOString().slice(11, 16);
const D1 = twDate(1), D2 = twDate(2), D3 = twDate(3);

// ---------- 伺服器 ----------
let server = null;
let serverLog = [];
let dbPath = '';
async function startServer(name) {
  if (server) { server.kill(); await new Promise((r) => server.once('exit', r)); }
  dbPath = join(WORK, `${name}.db`).replaceAll('\\', '/');
  for (const ext of ['', '-wal', '-shm']) rmSync(dbPath + ext, { force: true });
  serverLog = [];
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/server.js'], {
    cwd: PROJECT,
    env: { ...process.env, PORT: String(PORT), BASE_URL: BASE, DB_PATH: dbPath, DEV_LOGIN: '1', LINE_MESSAGING_ACCESS_TOKEN: '' },
  });
  const onData = (d) => serverLog.push(...d.toString().split(/\r?\n/).filter(Boolean));
  server.stdout.on('data', onData);
  server.stderr.on('data', onData);
  for (let i = 0; i < 50 && !serverLog.some((l) => l.includes('衝浪共乘平台')); i++) await sleep(100);
  if (!serverLog.some((l) => l.includes('衝浪共乘平台'))) throw new Error('伺服器起不來：' + serverLog.join('\n'));
}

// ---------- CDP ----------
const edgeProfile = join(WORK, 'edge-profile-' + Date.now());
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${edgeProfile}`, '--no-first-run', '--no-default-browser-check', 'about:blank']);
// 異常結束時的保險：Edge 會另外起子程序，只殺啟動的 PID 關不乾淨，改用設定檔路徑找出這次的所有 Edge 程序
function killEdge() {
  try {
    if (process.platform === 'win32') {
      const dir = edgeProfile.replaceAll('/', '\\').replaceAll("'", "''");
      execFileSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${dir}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: 'ignore' });
    } else edge.kill('SIGKILL');
  } catch {}
}
process.on('exit', () => { try { server?.kill(); } catch {} killEdge(); });
process.on('uncaughtException', (e) => { console.error(e); process.exit(1); });
let wsUrl;
for (let i = 0; i < 100 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch('http://127.0.0.1:9333/json/version')).json()).webSocketDebuggerUrl; } catch { await sleep(200); }
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0;
const waiting = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && waiting.has(msg.id)) {
    const { resolve, reject } = waiting.get(msg.id);
    waiting.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  } else if (msg.method === 'Page.javascriptDialogOpening') {
    // confirm() 一律按確定
    cdp('Page.handleJavaScriptDialog', { accept: true }, msg.sessionId);
  }
});
function cdp(method, params = {}, sessionId) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
}

const LIB = `
const $$ = (s) => [...document.querySelectorAll(s)];
const view = () => document.getElementById('view');
const txt = () => view()?.innerText ?? '';
const byText = (t, sel = 'button,a,label,summary') => $$(sel).find((e) => e.textContent.trim().includes(t));
const click = (t, sel) => { const e = byText(t, sel); if (!e) throw new Error('找不到可點的「' + t + '」'); e.click(); return true; };
const setVal = (el, v) => { if (typeof el === 'string') el = document.querySelector(el); if (!el) throw new Error('找不到欄位'); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
`;

async function newPage(label) {
  const { browserContextId } = await cdp('Target.createBrowserContext');
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  await cdp('Page.enable', {}, sessionId);
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 400, height: 860, deviceScaleFactor: 1, mobile: true }, sessionId);
  await cdp('Browser.grantPermissions', { origin: BASE, browserContextId, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  const page = {
    label,
    async eval(body) {
      lastPage = page;
      const r = await cdp('Runtime.evaluate', { expression: `(async () => { ${LIB}\n${body} })()`, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error(`[${label}] ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result.value;
    },
    async waitFor(body, what, timeout = 6000) {
      const end = Date.now() + timeout;
      let last;
      while (Date.now() < end) {
        try { last = await page.eval(body); if (last) return last; } catch (e) { last = e.message; }
        await sleep(100);
      }
      throw new Error(`[${label}] 等不到：${what}`);
    },
    async goto(path) {
      await cdp('Page.navigate', { url: BASE + path }, sessionId);
      await sleep(150);
      await page.waitFor(`return document.readyState === 'complete' && view()?.childElementCount > 0 && !txt().includes('找車中…')`, `${path} 載入`);
    },
    text: () => page.eval('return txt();'),
    async shot(name) {
      const h = Math.max(860, await page.eval('return document.documentElement.scrollHeight'));
      await cdp('Emulation.setDeviceMetricsOverride', { width: 400, height: h, deviceScaleFactor: 1, mobile: true }, sessionId);
      await sleep(150);
      const { data } = await cdp('Page.captureScreenshot', { format: 'png' }, sessionId);
      await cdp('Emulation.setDeviceMetricsOverride', { width: 400, height: 860, deviceScaleFactor: 1, mobile: true }, sessionId);
      writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
    },
  };
  return page;
}
mkdirSync(SHOTS, { recursive: true });

// ---------- 測試框架 ----------
const results = [];
async function tc(id, title, fn, { partial } = {}) {
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); };
  try { await fn(ok); } catch (e) { fails.push('例外：' + e.message); }
  let shot = null;
  try { await sleep(150); await lastPage.shot(id); shot = `${id}.png`; } catch {}
  const status = fails.length ? 'FAIL' : partial ? 'PARTIAL' : 'PASS';
  results.push({ id, title, status, fails, partial, shot, who: lastPage?.label });
  console.log(`${status.padEnd(7)} ${id} ${title}${fails.length ? '\n        - ' + fails.join('\n        - ') : ''}`);
}

// ---------- 共用操作 ----------
async function login(page, name, contact) {
  await page.goto('/new');
  await page.waitFor(`return txt().includes('開發用假登入')`, '假登入表單');
  await page.eval(`setVal('input[aria-label="測試用名稱"]', ${JSON.stringify(name)}); click('假登入', 'button');`);
  await page.waitFor(`return !txt().includes('開發用假登入') && (txt().includes('先填聯絡方式') || txt().includes('發布行程'))`, '登入完成');
  if (contact && (await page.text()).includes('先填聯絡方式')) {
    await page.eval(`setVal('form input', ${JSON.stringify(contact)}); click('儲存', 'button');`);
    await page.waitFor(`return txt().includes('發布行程')`, '發車表單');
  }
}
const STD = { date: D1, time: '05:00', spots: ['北堤'], pickups: '後山埤站、板橋新埔站', seats: 2, boardRule: 'short', fareOneWay: 150 };
async function fillTrip(page, t) {
  await page.eval(`
    const f = $$('form').find((x) => x.elements.fareOneWay);
    const v = ${JSON.stringify(t)};
    const all = ['date','time','returnTime','pickups','meetingPoint','seats','boardRule','fareOneWay','fareRoundTrip','note'];
    for (const k of all) setVal(f.elements[k], v[k] ?? '');
    for (const box of f.querySelectorAll('input[name=spots]')) box.checked = (v.spots ?? []).includes(box.value);
  `);
}
async function publish(page, t) {
  await page.goto('/new');
  await page.waitFor(`return txt().includes('發布行程')`, '發車表單');
  await sleep(200); // 等預填跑完再覆寫
  await fillTrip(page, t);
  await page.eval(`click('發布行程', 'button')`);
  await page.waitFor(`return /^\\/trips\\/\\d+$/.test(location.pathname) && txt().includes('座位')`, '發布後導向行程頁');
  return Number(await page.eval('return location.pathname.split("/").pop()'));
}
async function apply(page, tripId, pickup, board) {
  await page.goto(`/trips/${tripId}`);
  await page.eval(`
    const f = $$('form').find((x) => x.elements.pickup);
    setVal(f.elements.pickup, ${JSON.stringify(pickup)}); setVal(f.elements.boardType, ${JSON.stringify(board)});
    click('申請共乘', 'button');`);
  await page.waitFor(`return txt().includes('我的申請')`, '申請卡');
}
// 司機在行程頁對某乘客卡片按接受／拒絕
async function decide(page, tripId, name, action) {
  await page.goto(`/trips/${tripId}`);
  await page.eval(`
    const card = $$('.card').find((c) => c.querySelector('strong')?.textContent === ${JSON.stringify(name)});
    if (!card) throw new Error('找不到 ${name} 的卡片');
    [...card.querySelectorAll('button')].find((b) => b.textContent === ${JSON.stringify(action)}).click();`);
  await sleep(400);
  await page.waitFor(`return txt().includes('申請（')`, '重畫');
}
const cardOf = (page, name) =>
  page.eval(`return $$('.card').find((c) => c.querySelector('strong')?.textContent === ${JSON.stringify(name)})?.innerText ?? null;`);
async function cancelTrip(page, tripId) {
  await page.goto(`/trips/${tripId}`);
  await page.eval(`click('取消行程', 'button')`);
  await page.waitFor(`return txt().includes('已取消')`, '已取消');
}

// =====================================================================
// 場景 1：發車相關（TRIP / CONTACT-01 / MEET-01,02 / SHARE-05）
// =====================================================================
console.log('\n=== 場景 1：發車 ===');
await startServer('s1');
const akai = await newPage('阿凱');
const guest = await newPage('訪客');

await tc('TC-TRIP-02', '未登入不能發行程', async (ok) => {
  await guest.goto('/new');
  const t = await guest.text();
  ok(t.includes('請先登入') && t.includes('登入後才能發行程。'), '沒有「請先登入／登入後才能發行程。」');
  ok(!(await guest.eval(`return !!byText('發布行程','button')`)), '出現了發車表單');
});

await tc('TC-CONTACT-01', '沒填聯絡方式時發行程要先填', async (ok) => {
  await akai.goto('/new');
  await akai.eval(`setVal('input[aria-label="測試用名稱"]', '阿凱'); click('假登入','button');`);
  await akai.waitFor(`return !txt().includes('開發用假登入') && (txt().includes('先填聯絡方式') || txt().includes('發布行程'))`, '登入');
  const t = await akai.text();
  ok(t.includes('先填聯絡方式'), '登入後沒先出現「先填聯絡方式」');
  ok(!t.includes('發布行程'), '聯絡方式未填就出現發車表單');
  await akai.eval(`setVal('form input', 'akai-line'); click('儲存','button');`);
  await akai.waitFor(`return txt().includes('發布行程')`, '儲存後出現發車表單');
});

await tc('TC-TRIP-09', '第一次發車表單全空', async (ok) => {
  await akai.goto('/new');
  await sleep(500);
  const r = await akai.eval(`
    const f = $$('form').find((x) => x.elements.fareOneWay);
    return { notice: txt().includes('已帶入'), filled: [...f.elements].filter((e) => e.name && e.type !== 'checkbox' && e.value).map((e) => e.name), checked: f.querySelectorAll('input[name=spots]:checked').length };`);
  ok(!r.notice, '出現「已帶入」提示');
  ok(r.filled.length === 0, '有欄位不是空的：' + r.filled.join(','));
  ok(r.checked === 0, '有浪點被勾選');
});

await tc('TC-TRIP-07', '發車頁提示車資僅限分攤', async (ok) => {
  const note = await akai.eval(`return $$('[data-field=fareOneWay] .field-note')[0]?.textContent`);
  ok(note === '車資僅限分攤油資與過路費，不得營利載客', '單程車資下方提示不對：' + note);
});

await tc('TC-TRIP-03', '漏填必填欄位無法發布並標示欄位', async (ok) => {
  await fillTrip(akai, { date: D1, time: '05:00' });
  await akai.eval(`click('發布行程','button')`);
  await akai.waitFor(`return $$('.notice.error').length`, '錯誤訊息');
  const r = await akai.eval(`return { path: location.pathname, msg: $$('.notice.error')[0].textContent, marked: $$('.field-error').map((e) => e.dataset.field) };`);
  ok(r.path === '/new', '離開了發車頁');
  for (const f of ['浪點', '上車點', '座位數', '載板條件', '單程車資']) ok(r.msg.includes(f), `訊息沒列出 ${f}（訊息：${r.msg}）`);
  for (const f of ['spots', 'pickups', 'seats', 'boardRule', 'fareOneWay']) ok(r.marked.includes(f), `欄位 ${f} 沒被標示`);
  ok(!r.marked.includes('date') && !r.marked.includes('time'), '日期/時間被誤標');
  const my = await akai.eval(`return (await (await fetch('/api/my')).json()).trips.length`);
  ok(my === 0, '行程被建立了');
});

await tc('TC-TRIP-04', '出發時間已過無法發布', async (ok) => {
  const past = new Date(taiwanNow().getTime() - 3600000);
  if (past.toISOString().slice(0, 10) !== twDate(0)) throw new Error('現在太接近午夜，無法測「今天一小時前」');
  await akai.goto('/new');
  await fillTrip(akai, { ...STD, date: twDate(0), time: hhmm(past) });
  await akai.eval(`click('發布行程','button')`);
  await akai.waitFor(`return $$('.notice.error').length`, '錯誤訊息');
  const r = await akai.eval(`return { path: location.pathname, msg: $$('.notice.error')[0].textContent, marked: $$('.field-error').map((e) => e.dataset.field) };`);
  ok(r.path === '/new', '離開了發車頁');
  ok(r.msg.includes('出發時間必須晚於現在'), '訊息不對：' + r.msg);
  ok(r.marked.includes('date') && r.marked.includes('time'), '日期/出發時間沒被標示：' + r.marked);
});

let trip1;
await tc('TC-TRIP-01', '司機發布含必填與選填欄位的行程', async (ok) => {
  trip1 = await publish(akai, { ...STD, spots: ['北堤', '雙獅'], returnTime: '10:00', fareRoundTrip: 250, meetingPoint: '後山埤站 1 號出口', note: '不菸' });
  const t = await akai.text();
  ok(t.includes('北堤、雙獅'), '浪點不是「北堤、雙獅」');
  ok(t.includes('後山埤站、板橋新埔站'), '上車點不對');
  ok(t.includes('共 2 位，剩 2 位'), '座位不對');
  ok(t.includes('僅短板'), '載板不對');
  ok(t.includes('單程 $150／來回 $250'), '車資不對');
  ok(/回程\s*10:00/.test(t), '回程不對');
});

await tc('TC-TRIP-08', '第二趟發車帶入上一趟資料，日期空白', async (ok) => {
  await akai.goto('/new');
  await akai.waitFor(`return txt().includes('已帶入你上一趟的資料，記得選日期')`, '已帶入提示');
  const v = await akai.eval(`const f = $$('form').find((x) => x.elements.fareOneWay); const o = {}; for (const k of ['date','time','returnTime','pickups','meetingPoint','seats','boardRule','fareOneWay','fareRoundTrip','note']) o[k] = f.elements[k].value; o.spots = $$('input[name=spots]:checked').map((b) => b.value); return o;`);
  const want = { date: '', time: '05:00', returnTime: '10:00', pickups: '後山埤站、板橋新埔站', meetingPoint: '後山埤站 1 號出口', seats: '2', boardRule: 'short', fareOneWay: '150', fareRoundTrip: '250', note: '不菸' };
  for (const [k, w] of Object.entries(want)) ok(v[k] === w, `${k} 是「${v[k]}」，應為「${w}」`);
  ok(v.spots.join() === '北堤,雙獅', '浪點勾選不對：' + v.spots);
});

await tc('TC-TRIP-05', '未登入用分享連結查看行程', async (ok) => {
  await guest.goto(`/trips/${trip1}`);
  const t = await guest.text();
  for (const s of ['北堤、雙獅', '05:00', '後山埤站、板橋新埔站', '共 2 位，剩 2 位', '僅短板', '單程 $150']) ok(t.includes(s), '看不到 ' + s);
  ok(t.includes('使用 LINE 登入後申請'), '沒有「使用 LINE 登入後申請」');
  ok(!t.includes('akai-line') && !t.includes('1 號出口'), '訪客看到了聯絡方式或集合點');
});

await tc('TC-TRIP-06', '開啟不存在的行程連結', async (ok) => {
  await guest.goto('/trips/999999');
  const t = await guest.text();
  ok(t.includes('找不到資料'), '沒有「找不到資料」：' + t);
  ok(await guest.eval(`return !!byText('回到首頁','a')`), '沒有回首頁連結');
});

let meetTrip;
await tc('TC-MEET-01', '司機填集合點，自己看得到', async (ok) => {
  meetTrip = await publish(akai, { ...STD, meetingPoint: '後山埤站 1 號出口，白色 RAV4', note: '不菸' });
  ok(/集合點\s*後山埤站 1 號出口，白色 RAV4/.test(await akai.text()), '行程頁沒有集合點');
});

await tc('TC-SHARE-05', '發文文字不含私人資訊且只有一個標籤', async (ok) => {
  await akai.goto(`/trips/${meetTrip}`);
  await akai.eval(`click('複製發文','button')`);
  await sleep(500);
  const r = await akai.eval(`
    const btn = byText('已複製','button');
    let text = $$('textarea[readonly]')[0]?.value;
    if (btn && !text) text = await navigator.clipboard.readText();
    return { copied: !!btn, text };`);
  ok(r.text, '取不到發文文字');
  const text = r.text ?? '';
  ok(!text.includes('akai-line'), '含聯絡方式');
  ok(!text.includes('1 號出口') && !text.includes('RAV4'), '含集合點');
  ok(!text.includes('不菸'), '含備註');
  ok((text.match(/#/g) ?? []).length === 1, '「#」不是剛好一個');
  writeFileSync(join(WORK, 'TC-SHARE-05.txt'), `按鈕變成已複製：${r.copied}\n\n${text}`);
});

await tc('TC-MEET-02', '不填集合點也能發布', async (ok) => {
  const id = await publish(akai, { ...STD, meetingPoint: '' });
  ok(id > 0, '沒有發布成功');
  ok(!(await akai.text()).includes('集合點'), '行程頁出現了集合點');
});

await tc('TC-TRIP-10', '上一趟已取消仍會帶入', async (ok) => {
  const id = await publish(akai, { ...STD, fareOneWay: 180 });
  await cancelTrip(akai, id);
  await akai.goto('/new');
  await akai.waitFor(`return txt().includes('已帶入')`, '已帶入提示');
  const v = await akai.eval(`const f = $$('form').find((x) => x.elements.fareOneWay); return { fare: f.elements.fareOneWay.value, date: f.elements.date.value };`);
  ok(v.fare === '180', '單程車資帶入的是 ' + v.fare);
  ok(v.date === '', '日期不是空的');
});

// =====================================================================
// 場景 2：找車（FIND-01～06、08）
// =====================================================================
console.log('\n=== 場景 2：找車 ===');
await startServer('s2');
await login(akai, '阿凱', 'akai-line');
const tA = await publish(akai, { ...STD, time: '05:00' });
const tB = await publish(akai, { ...STD, time: '07:00' });
const tC = await publish(akai, { ...STD, date: D2, time: '05:00' });
const rowTitles = (p) => p.eval(`return $$('.rows .row .row-title').map((e) => e.textContent)`);
const summaryOf = (p) => p.eval(`return document.querySelector('.list-summary').textContent`);
const fmt = (d) => { const [, m, dd] = d.split('-').map(Number); return `${m}/${dd}`; };

await tc('TC-FIND-08', '首頁預設明天，一鍵切到全部日期', async (ok) => {
  await guest.goto('/');
  const pressed = await guest.eval(`return $$('.chip[aria-pressed=true]').map((c) => c.getAttribute('aria-label'))[0]`);
  ok(pressed?.startsWith('明天'), '預設選中的不是明天：' + pressed);
  ok((await rowTitles(guest)).length === 2, '明天顯示的不是明天那兩趟');
  await guest.eval(`click('全部','button')`);
  await sleep(200);
  ok((await rowTitles(guest)).length === 3, '點全部後沒有顯示全部行程');
}, { partial: false });

await tc('TC-FIND-01', '全部日期列表由近到遠排序', async (ok) => {
  await guest.goto('/');
  await guest.eval(`$$('.chip-all')[0].click()`);
  await sleep(200);
  const titles = await rowTitles(guest);
  const want = [`${fmt(D1)}`, `${fmt(D1)}`, `${fmt(D2)}`];
  ok(titles.length === 3 && titles[0].includes(want[0]) && titles[0].endsWith('05:00') && titles[1].endsWith('07:00') && titles[2].includes(want[2]) && titles[2].endsWith('05:00'), '順序不對：' + titles.join(' | '));
  ok((await summaryOf(guest)) === '全部日期・3 趟', '摘要是：' + (await summaryOf(guest)));
});

await tc('TC-FIND-03', '依日期篩選', async (ok) => {
  await guest.eval(`$$('.chip').find((c) => c.getAttribute('aria-label')?.includes('${fmt(D2)}')).click()`);
  await sleep(200);
  const titles = await rowTitles(guest);
  ok(titles.length === 1 && titles[0] === '05:00 出發', '結果：' + titles.join(' | '));
});

await tc('TC-FIND-04', '選沒有行程的日期', async (ok) => {
  await guest.eval(`$$('.chip').find((c) => c.getAttribute('aria-label')?.includes('${fmt(D3)}')).click()`);
  await sleep(200);
  ok((await guest.text()).includes('目前沒有符合的行程，換個日期或浪點看看'), '沒有空狀態訊息');
  ok((await summaryOf(guest)).endsWith('・0 趟'), '摘要是：' + (await summaryOf(guest)));
});

await tc('TC-FIND-02', '已取消的行程不出現在列表', async (ok) => {
  await cancelTrip(akai, tB);
  await guest.goto('/?date=all');
  const titles = await rowTitles(guest);
  ok(titles.length === 2 && !titles.some((t) => t.endsWith('07:00')), '列表：' + titles.join(' | '));
  ok((await summaryOf(guest)) === '全部日期・2 趟', '摘要是：' + (await summaryOf(guest)));
});

await tc('TC-FIND-05', '依浪點篩選，多浪點行程也會出現', async (ok) => {
  await publish(akai, { ...STD, time: '06:00', spots: ['雙獅'] });
  const idB = await publish(akai, { ...STD, time: '06:30', spots: ['北堤', '蜜月灣'] });
  await guest.goto('/');
  const opts = await guest.eval(`return $$('select[aria-label=浪點] option').map((o) => o.value + '|' + o.textContent)`);
  await guest.eval(`setVal('select[aria-label=浪點]', '蜜月灣')`);
  await sleep(500);
  const rows = await guest.eval(`return $$('.rows .row').map((r) => ({ href: r.getAttribute('href'), tile: r.querySelector('.spot-tile').textContent, meta: r.querySelector('.row-meta').textContent }))`);
  ok(rows.length === 1 && rows[0].href === `/trips/${idB}`, '篩選結果：' + JSON.stringify(rows));
  ok(rows[0]?.tile === '北堤+1', '方塊顯示：' + rows[0]?.tile);
  ok(rows[0]?.meta.includes('北堤、蜜月灣'), '說明沒列出「北堤、蜜月灣」');
  ok(!opts.some((o) => o.startsWith('烏石港|') || o.includes('頭城')), '選單有獨立的烏石港/頭城：' + opts.join(', '));
  writeFileSync(join(WORK, 'TC-FIND-05-options.txt'), opts.join('\n'));
});

await tc('TC-FIND-06', '選沒有車的浪點', async (ok) => {
  await guest.eval(`setVal('select[aria-label=浪點]', '外澳')`);
  await sleep(400);
  await guest.eval(`$$('.chip-all')[0].click()`);
  await sleep(200);
  ok((await guest.text()).includes('目前沒有符合的行程，換個日期或浪點看看'), '沒有空狀態訊息');
});

// =====================================================================
// 場景 3：明天沒車（FIND-09）
// =====================================================================
console.log('\n=== 場景 3：明天沒車 ===');
await startServer('s3');
await login(akai, '阿凱', 'akai-line');
await publish(akai, { ...STD, date: D2 });
await tc('TC-FIND-09', '明天沒有行程時提示並提供切換', async (ok) => {
  await guest.goto('/');
  ok((await guest.text()).includes('明天目前沒有行程'), '沒有「明天目前沒有行程」');
  await guest.eval(`click('看全部日期','button')`);
  await sleep(200);
  const titles = await rowTitles(guest);
  ok(titles.length === 1 && titles[0].includes(fmt(D2)), '點下去後：' + titles.join(' | '));
});

// =====================================================================
// 場景 4：申請 / 聯絡方式 / 取消（REQ / CONTACT / CANCEL / MEET-04）
// =====================================================================
console.log('\n=== 場景 4：申請 ===');
await startServer('s4');
const yu = await newPage('小魚');
const lang = await newPage('小浪');
const sha = await newPage('小沙');
const xin = await newPage('小新');
await login(akai, '阿凱', 'akai-line');
await login(yu, '小魚', 'yu-line');
await login(lang, '小浪', 'lang-line');
await login(sha, '小沙', 'sha-line');
const T1 = await publish(akai, { ...STD, meetingPoint: '後山埤站 1 號出口，白色 RAV4' });

await tc('TC-REQ-02', '沒選上車點或板型無法申請', async (ok) => {
  await yu.goto(`/trips/${T1}`);
  await yu.eval(`click('申請共乘','button')`);
  await yu.waitFor(`return $$('.notice.error').length`, '錯誤訊息');
  const r = await yu.eval(`return { msg: $$('.notice.error')[0].textContent, marked: $$('.field-error').map((e) => e.dataset.field) }`);
  ok(r.msg.includes('上車點') && r.msg.includes('浪板類型'), '訊息：' + r.msg);
  ok(r.marked.includes('pickup') && r.marked.includes('boardType'), '標示：' + r.marked);
  ok(!(await yu.text()).includes('我的申請'), '建立了申請');
});

await tc('TC-REQ-12', '僅短板行程可以帶短板（選單部分）', async (ok) => {
  const opts = await yu.eval(`return $$('select[name=boardType] option').filter((o) => o.value).map((o) => o.textContent)`);
  ok(opts.join() === '不帶板,短板', '選單是：' + opts);
});

await tc('TC-REQ-01', '乘客申請行程', async (ok) => {
  await apply(yu, T1, '後山埤站', 'short');
  const t = await yu.text();
  ok(t.includes('上車：後山埤站｜短板'), '卡片沒有「上車：後山埤站｜短板」');
  ok(t.includes('待確認'), '沒有「待確認」');
});

await tc('TC-REQ-11', '不能重複申請同一行程', async (ok) => {
  await yu.goto(`/trips/${T1}`);
  ok((await yu.eval(`return $$('select[name=pickup]').length`)) === 0, '還有申請表單');
  ok((await yu.text()).includes('待確認'), '看不到自己的申請卡');
});

await tc('TC-CANCEL-03', '乘客看不到取消行程按鈕', async (ok) => {
  ok(!(await yu.text()).includes('取消行程'), '乘客看到「取消行程」');
});

await tc('TC-REQ-10', '司機不能申請自己的行程', async (ok) => {
  await akai.goto(`/trips/${T1}`);
  const t = await akai.text();
  ok(t.includes('申請（1）'), '沒有「申請（1）」');
  ok(t.includes('取消行程'), '沒有「取消行程」');
  ok((await akai.eval(`return $$('select[name=pickup]').length`)) === 0, '司機看到申請表單');
});

await tc('TC-REQ-06', '乘客看不到別人行程的申請清單', async (ok) => {
  await lang.goto(`/trips/${T1}`);
  const t = await lang.text();
  ok(!t.includes('申請（'), '看到申請清單');
  ok(!t.includes('小魚'), '看到小魚的名字');
  ok(!(await lang.eval(`return !!byText('接受','button')`)), '看到接受按鈕');
  ok((await lang.eval(`return $$('select[name=pickup]').length`)) === 1, '沒有自己的申請表單');
});

await tc('TC-REQ-04', '司機看到申請並接受', async (ok) => {
  await akai.goto(`/trips/${T1}`);
  const before = await cardOf(akai, '小魚');
  ok(before?.includes('上車：後山埤站｜短板'), '卡片內容：' + before);
  await decide(akai, T1, '小魚', '接受');
  const after = await cardOf(akai, '小魚');
  ok(after?.includes('已接受'), '狀態沒變已接受');
  ok(!after?.includes('拒絕') || after.includes('已拒絕'), '按鈕沒消失');
  const btns = await akai.eval(`return [...$$('.card').find((c) => c.querySelector('strong')?.textContent === '小魚').querySelectorAll('button')].length`);
  ok(btns === 0, '接受/拒絕按鈕還在');
});

await tc('TC-REQ-07', '接受後剩餘座位減一', async (ok) => {
  await akai.goto(`/trips/${T1}`);
  ok((await akai.text()).includes('共 2 位，剩 1 位'), '座位不是「剩 1 位」');
  await guest.goto(`/?date=${D1}`);
  const badge = await guest.eval(`return $$('.row').find((r) => r.getAttribute('href') === '/trips/${T1}')?.querySelector('.badge').textContent`);
  ok(badge === '剩 1 位', '首頁座位是：' + badge);
});

await tc('TC-CONTACT-04', '接受後雙方看得到聯絡方式', async (ok) => {
  await yu.goto(`/trips/${T1}`);
  ok((await yu.text()).includes('司機聯絡方式：akai-line'), '小魚看不到 akai-line');
  ok((await cardOf(akai, '小魚'))?.includes('yu-line'), '阿凱看不到 yu-line');
});

await tc('TC-MEET-03', '被接受的乘客看得到集合點（頁面部分；推播看 log）', async (ok) => {
  ok(/集合點\s*後山埤站 1 號出口，白色 RAV4/.test(await yu.text()), '小魚行程頁沒有集合點');
  ok(serverLog.some((l) => l.includes('已被接受') && l.includes('集合點：後山埤站 1 號出口，白色 RAV4')) || serverLog.join('\n').match(/已被接受[^]*?集合點：後山埤站 1 號出口，白色 RAV4/), '接受推播文字（log）不含集合點');
}, { partial: true });

await apply(lang, T1, '板橋新埔站', 'none');
await apply(sha, T1, '後山埤站', 'short');

await tc('TC-REQ-05', '司機拒絕申請', async (ok) => {
  await decide(akai, T1, '小沙', '拒絕');
  ok((await cardOf(akai, '小沙'))?.includes('已拒絕'), '小沙沒變已拒絕');
  ok((await akai.text()).includes('共 2 位，剩 1 位'), '剩餘座位變了');
});

await tc('TC-CONTACT-05', '未被接受者與訪客看不到聯絡方式', async (ok) => {
  for (const p of [lang, sha, guest]) {
    await p.goto(`/trips/${T1}`);
    ok(!(await p.text()).includes('akai-line'), `${p.label} 看到 akai-line`);
    const api = await p.eval(`return JSON.stringify(await (await fetch('/api/trips/${T1}')).json())`);
    ok(!api.includes('akai-line'), `${p.label} 的 API 回應含 akai-line`);
  }
  await akai.goto(`/trips/${T1}`);
  ok(!(await cardOf(akai, '小浪'))?.includes('lang-line'), '阿凱看到小浪的聯絡方式');
  ok(!(await cardOf(akai, '小沙'))?.includes('sha-line'), '阿凱看到小沙的聯絡方式');
});

await tc('TC-MEET-04', '未被接受者與訪客看不到集合點', async (ok) => {
  for (const p of [lang, sha, guest]) {
    await p.goto(`/trips/${T1}`);
    const t = await p.text();
    ok(!t.includes('集合點') && !t.includes('RAV4'), `${p.label} 看到集合點`);
  }
  const rej = serverLog.filter((l) => l.includes('未被接受'));
  ok(rej.length && !serverLog.join('\n').match(/未被接受[^\n]*\n[^\n]*集合點/), '拒絕推播（log）含集合點或沒有拒絕推播');
});

await tc('TC-CANCEL-06', '已拒絕的申請沒有退出按鈕', async (ok) => {
  await sha.goto('/me');
  ok((await sha.text()).includes('已拒絕'), '「我的」沒有已拒絕');
  await sha.goto(`/trips/${T1}`);
  const t = await sha.text();
  ok(t.includes('已拒絕'), '行程頁沒有已拒絕');
  ok(!t.includes('退出行程'), '有退出行程按鈕');
});

await tc('TC-CONTACT-02', '沒填聯絡方式時申請要先填', async (ok) => {
  await login(xin, '小新');
  await xin.goto(`/trips/${T1}`);
  const t = await xin.text();
  ok(t.includes('申請前先填聯絡方式'), '申請區沒先出現聯絡方式表單');
  ok((await xin.eval(`return $$('select[name=pickup]').length`)) === 0, '未填聯絡方式就出現申請表單');
});

await tc('TC-CONTACT-03', '聯絡方式留空無法儲存', async (ok) => {
  await xin.eval(`setVal('form input', '   '); click('儲存','button');`);
  await xin.waitFor(`return $$('.notice.error').length`, '錯誤訊息');
  const r = await xin.eval(`const i = $$('form input')[0]; return { msg: $$('.notice.error')[0].textContent, invalid: i.getAttribute('aria-invalid') === 'true' || !!i.closest('.field-error'), stay: txt().includes('申請前先填聯絡方式') }`);
  ok(r.msg.includes('請填寫聯絡方式'), '訊息：' + r.msg);
  ok(r.stay, '離開了聯絡方式表單');
  ok(r.invalid, '欄位沒有被標示（沒有紅框/aria-invalid）');
});

await tc('TC-CONTACT-02b', '（接續）填完儲存後出現申請表單', async (ok) => {
  await xin.eval(`setVal('form input', 'xin-line'); click('儲存','button');`);
  await xin.waitFor(`return $$('select[name=pickup]').length`, '申請表單');
});

// PR-CONTACT-03：用另一個新帳號，才不會打亂小新的流程。截圖停在格式錯誤的畫面，儲存成功另列 06b
const shi = await newPage('小石');
await tc('TC-CONTACT-06', '聯絡方式要是手機號碼或 LINE ID（格式錯誤被擋）', async (ok) => {
  await login(shi, '小石');
  await shi.goto(`/trips/${T1}`);
  for (const bad of ['私訊我', '12345']) {
    await shi.eval(`$$('.notice.error').forEach((n) => n.remove()); setVal('form input', ${JSON.stringify(bad)}); click('儲存','button');`);
    await shi.waitFor(`return $$('.notice.error').length`, `「${bad}」的錯誤訊息`);
    const r = await shi.eval(`const i = $$('form input')[0]; return { msg: $$('.notice.error')[0].textContent, invalid: i.getAttribute('aria-invalid') === 'true', stay: txt().includes('申請前先填聯絡方式') }`);
    ok(r.msg === '聯絡方式格式不對，請填 LINE ID 或手機號碼', `「${bad}」訊息：${r.msg}`);
    ok(r.invalid, `「${bad}」欄位沒有被標示`);
    ok(r.stay, `「${bad}」離開了聯絡方式表單`);
  }
});
await tc('TC-CONTACT-06b', '（接續）填手機號碼 0912-345-678 儲存成功', async (ok) => {
  await shi.eval(`setVal('form input', '0912-345-678'); click('儲存','button');`);
  await shi.waitFor(`return $$('select[name=pickup]').length`, '申請表單');
  ok(!(await shi.eval(`return $$('.notice.error').length`)), '還有錯誤訊息');
});

// REQ-08 / FIND-07：座位 1
const T2 = await publish(akai, { ...STD, seats: 1, time: '06:00' });
await apply(yu, T2, '後山埤站', 'short');
await apply(lang, T2, '後山埤站', 'short');
await tc('TC-REQ-08', '坐滿後接受第二筆被擋', async (ok) => {
  await decide(akai, T2, '小魚', '接受');
  await akai.eval(`[...$$('.card').find((c) => c.querySelector('strong')?.textContent === '小浪').querySelectorAll('button')].find((b) => b.textContent === '接受').click()`);
  await akai.waitFor(`return $$('.notice.error').length`, '頁首錯誤');
  const msg = await akai.eval(`return $$('.notice.error')[0].textContent`);
  ok(msg.includes('座位已滿'), '頁首訊息：' + msg);
  ok((await cardOf(akai, '小浪'))?.includes('待確認'), '小浪不是待確認');
  ok((await akai.text()).includes('共 1 位，剩 0 位'), '已確認人數不是 1');
});

await tc('TC-FIND-07', '坐滿的行程標示已滿且不能申請', async (ok) => {
  await sha.goto(`/?date=${D1}`);
  const badge = await sha.eval(`return $$('.row').find((r) => r.getAttribute('href') === '/trips/${T2}')?.querySelector('.badge').textContent`);
  ok(badge === '已滿', '列表標示：' + badge);
  await sha.goto(`/trips/${T2}`);
  ok((await sha.text()).includes('這個行程已滿，無法申請'), '沒有「這個行程已滿，無法申請」');
  ok((await sha.eval(`return $$('select[name=pickup]').length`)) === 0, '有申請表單');
});

// REQ-09：小魚 T1 已接受、T3 待確認、T4 已拒絕
const T3 = await publish(akai, { ...STD, time: '07:00' });
const T4 = await publish(akai, { ...STD, time: '08:00' });
await apply(yu, T3, '後山埤站', 'short');
await apply(yu, T4, '後山埤站', 'short');
await decide(akai, T4, '小魚', '拒絕');
await tc('TC-REQ-09', '乘客在「我的」看到申請狀態', async (ok) => {
  await yu.goto('/me');
  const t = await yu.text();
  for (const s of ['待確認', '已接受', '已拒絕']) ok(t.includes(s), '「我的」沒有 ' + s);
});

await tc('TC-REQ-13', '不載板行程不能選短板或長板', async (ok) => {
  const T5 = await publish(akai, { ...STD, time: '09:00', boardRule: 'none' });
  await yu.goto(`/trips/${T5}`);
  const r = await yu.eval(`return { opts: $$('select[name=boardType] option').filter((o) => o.value).map((o) => o.textContent), note: $$('[data-field=boardType] .field-note')[0]?.textContent }`);
  ok(r.opts.join() === '不帶板', '選單是：' + r.opts);
  ok(r.note?.includes('不載板'), '沒有不載板說明：' + r.note);
});

await tc('TC-REQ-12b', '僅短板行程申請短板成功', async () => {
  // TC-REQ-01 已經以短板申請成功，這裡用 T3 再確認一次（小浪）
  await apply(lang, T3, '後山埤站', 'short');
});

// CANCEL-04/05 的頁面部分（推播看 log）
const T6 = await publish(akai, { ...STD, time: '10:00' });
await apply(yu, T6, '後山埤站', 'short');
await apply(lang, T6, '後山埤站', 'short');
await decide(akai, T6, '小魚', '接受');
await tc('TC-CANCEL-04', '已接受的乘客退出，座位釋放（頁面＋log）', async (ok) => {
  const n = serverLog.length;
  await yu.goto(`/trips/${T6}`);
  await yu.eval(`click('退出行程','button')`);
  await yu.waitFor(`return $$('select[name=pickup]').length`, '重新出現申請表單');
  ok(!(await yu.text()).includes('我的申請'), '申請卡還在');
  await akai.goto(`/trips/${T6}`);
  ok((await akai.text()).includes('共 2 位，剩 2 位'), '座位沒回到剩 2 位');
  ok(serverLog.slice(n).some((l) => l.includes('小魚 退出了你')), 'log 沒有退出推播給司機');
}, { partial: true });

await tc('TC-CANCEL-05', '待確認的乘客退出，司機不收推播（頁面＋log）', async (ok) => {
  const n = serverLog.length;
  await lang.goto(`/trips/${T6}`);
  await lang.eval(`click('退出行程','button')`);
  await lang.waitFor(`return $$('select[name=pickup]').length`, '重新出現申請表單');
  await akai.goto(`/trips/${T6}`);
  ok(!(await cardOf(akai, '小浪')), '阿凱的清單還有小浪');
  ok((await akai.text()).includes('剩 2 位'), '座位變了');
  ok(!serverLog.slice(n).some((l) => l.includes('退出')), 'log 有退出推播（不應該有）');
}, { partial: true });

await tc('TC-CANCEL-01', '司機取消行程（頁面＋log；手機推播要另測）', async (ok) => {
  // T3：小魚待確認、小浪待確認
  await decide(akai, T3, '小魚', '接受');
  const n = serverLog.length;
  await cancelTrip(akai, T3);
  ok(!(await akai.text()).includes('取消行程'), '取消按鈕還在');
  const pushes = serverLog.slice(n).filter((l) => l.includes('已被司機取消'));
  ok(pushes.length === 2, `log 取消推播 ${pushes.length} 則，應為 2（已接受＋待確認）`);
  await guest.goto('/?date=all');
  ok(!(await guest.eval(`return $$('.row').some((r) => r.getAttribute('href') === '/trips/${T3}')`)), '首頁仍列出該行程');
}, { partial: true });

await tc('TC-CANCEL-02', '已取消的行程不能申請', async (ok) => {
  await sha.goto(`/trips/${T3}`);
  const t = await sha.text();
  ok(t.includes('已取消'), '沒有已取消標示');
  ok((await sha.eval(`return $$('select[name=pickup]').length`)) === 0, '有申請表單');
});

// =====================================================================
// 場景 5：統計（METRIC-01、02）— 用 3 分鐘後出發代替 10 分鐘
// =====================================================================
console.log('\n=== 場景 5：統計（約需 3～4 分鐘）===');
await startServer('s5');
await login(akai, '阿凱', 'akai-line');
await login(yu, '小魚', 'yu-line');
const stats = () => execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/stats.js'], { cwd: PROJECT, env: { ...process.env, DB_PATH: dbPath } }).toString().trim();
const soon = new Date(taiwanNow().getTime() + 3 * 60000);
const soonT = { ...STD, date: soon.toISOString().slice(0, 10), time: hhmm(soon) };
const M1 = await publish(akai, soonT);
const M2 = await publish(akai, soonT);
const M3 = await publish(akai, soonT);
await apply(yu, M1, '後山埤站', 'short');
await apply(yu, M3, '後山埤站', 'short');
await decide(akai, M1, '小魚', '接受');
await decide(akai, M3, '小魚', '接受');
await cancelTrip(akai, M3);
const statsBefore = stats();
const departAt = Date.parse(`${soonT.date}T${soonT.time}:00+08:00`);
while (Date.now() < departAt + 3000) await sleep(1000);
const statsAfter = stats();
const count = (s) => Number(s.match(/：(\d+) 趟/)?.[1] ?? 0);
await tc('TC-METRIC-01', '成行的行程計入每週統計', async (ok) => {
  ok(count(statsAfter) === count(statsBefore) + 1, `執行前「${statsBefore}」→ 執行後「${statsAfter}」`);
});
await tc('TC-METRIC-02', '沒有乘客或已取消的行程不計入', async (ok) => {
  ok(count(statsAfter) === 1, `三趟裡應只算 1 趟，實際：${statsAfter}`);
});

// ---------- 收尾 ----------
writeFileSync(join(WORK, 'results.json'), JSON.stringify({ results, statsBefore, statsAfter }, null, 2));
writeFileSync(join(WORK, 'server-log.txt'), serverLog.join('\n'));
server.kill();
// 正常收尾：請瀏覽器自己關閉（連同所有子程序）
await Promise.race([cdp('Browser.close').catch(() => {}), sleep(3000)]);
ws.close();
const c = (s) => results.filter((r) => r.status === s).length;
console.log(`\n總計：PASS ${c('PASS')}、PARTIAL ${c('PARTIAL')}、FAIL ${c('FAIL')}`);
execFileSync(process.execPath, [fileURLToPath(new URL('make-report.mjs', import.meta.url)), WORK], { stdio: 'inherit' });
process.exit(0);
