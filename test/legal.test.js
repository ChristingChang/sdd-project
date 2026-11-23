import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startApp } from './helpers.js';

test('PR-LEGAL-01 未登入可以打開隱私權說明頁', async (t) => {
  const { client } = await startApp(t);
  const res = await client().get('/privacy');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
});

test('PR-LEGAL-02 未登入可以打開使用須知頁', async (t) => {
  const { client } = await startApp(t);
  const res = await client().get('/terms');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
});

// 依 #10 PR-LEGAL-01 逐項列出的應告知事項；只檢查關鍵字，措辭可以改
const PRIVACY_MUST_SAY = [
  'CC', // 經營者暱稱
  '真實姓名', // 依法要求時提供
  '共乘媒合', // 蒐集目的
  'LINE 使用者識別碼',
  '顯示名稱',
  '頭像',
  '聯絡方式',
  '7 天', // 刪除時限
  '去識別化', // 已出發行程的保留方式
  '日本', // 利用地區：主機在 Fly.io 東京
  'Fly.io', // 受託處理的主機服務商要具名
  '依法令要求提供時除外',
  'LINE 隱私政策',
  '主機服務商', // 受託處理
  '不用於廣告',
  '查詢或請求閱覽',
  '請求製給複製本',
  '請求補充或更正',
  '請求停止蒐集、處理或利用',
  '請求刪除',
  '15 天', // 查詢、閱覽、複本的回覆時限
  'cookie',
];

test('PR-LEGAL-01 隱私權說明涵蓋個資法第 8 條應告知事項', async (t) => {
  const { client } = await startApp(t);
  const { status, body } = await client().get('/api/legal');
  assert.equal(status, 200);
  const text = JSON.stringify(body.privacy);
  for (const phrase of PRIVACY_MUST_SAY) assert.ok(text.includes(phrase), `隱私權說明缺少「${phrase}」`);
});

// 依 #10 PR-LEGAL-02 列出的使用須知內容
const TERMS_MUST_SAY = [
  '只提供免費的共乘資訊媒合',
  '不是運輸業者',
  '不保證行程成行',
  '駕駛能力',
  '依法律規定處理', // 乘車中的損害
  '故意或重大過失', // 免責的例外（民法第 222 條）
  '分攤油資與過路費',
  '下架',
  '乘客險',
  '未滿 18 歲',
  '法定代理人',
  '騷擾',
  '冒用',
  '被放鳥',
  '報警',
  '停用',
];

test('PR-LEGAL-02 使用須知說明平台角色、車資原則、責任與禁止行為', async (t) => {
  const { client } = await startApp(t);
  const { body } = await client().get('/api/legal');
  const text = JSON.stringify(body.terms);
  for (const phrase of TERMS_MUST_SAY) assert.ok(text.includes(phrase), `使用須知缺少「${phrase}」`);
});

test('PR-LEGAL-01 PR-LEGAL-02 兩頁共用同一個條款版本與最後更新日期', async (t) => {
  const { client } = await startApp(t);
  const { body } = await client().get('/api/legal');
  assert.match(body.version, /\S/);
  assert.match(body.updatedAt, /^\d{4}-\d{2}-\d{2}$/);
});

test('PR-SUPPORT-01 有設定客服信箱時，前端設定會帶出信箱', async (t) => {
  const { client } = await startApp(t, { supportEmail: 'help@example.test' });
  const { body } = await client().get('/api/config');
  assert.equal(body.supportEmail, 'help@example.test');
});

test('PR-SUPPORT-01 開發環境沒設定客服信箱時，前端設定照常回應且沒有信箱', async (t) => {
  const { client } = await startApp(t);
  const { status, body } = await client().get('/api/config');
  assert.equal(status, 200);
  assert.equal(body.supportEmail, undefined);
});

test('PR-LEGAL-04 LINE 登入按鈕寫明同意，旁邊附隱私權說明與使用須知連結', async (t) => {
  const { client } = await startApp(t);
  const { text } = await client().get('/app.js');
  assert.match(text, /同意並以 LINE 登入/);
  assert.match(text, /點選即表示你已閱讀並同意/);
  // 舊按鈕文字沒有說明同意，不能再留在任何地方
  assert.doesNotMatch(text, /使用 LINE 登入/);
});
