import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeNext } from '../src/app.js';
import { createLineClient } from '../src/line.js';
import { startApp } from './helpers.js';

const stateOf = (res) => new URL(res.headers.get('location')).searchParams.get('state');

test('PR-AUTH-01 LINE 登入後建立帳號與登入狀態', async (t) => {
  const { client } = await startApp(t);
  const browser = client();
  const start = await browser.get('/auth/line');
  assert.equal(start.status, 302);
  assert.match(start.headers.get('location'), /^https:\/\/line\.test\/authorize/);
  const callback = await browser.get(`/auth/line/callback?code=abc&state=${stateOf(start)}`);
  assert.equal(callback.status, 302);
  const me = await browser.get('/api/me');
  assert.equal(me.body.user.name, '小海');
});

test('PR-AUTH-01 state 不符或使用者取消時不會登入', async (t) => {
  const { client } = await startApp(t);
  const browser = client();
  await browser.get('/auth/line');
  const forged = await browser.get('/auth/line/callback?code=abc&state=forged');
  assert.equal(forged.headers.get('location'), '/?login=failed');
  assert.equal((await browser.get('/api/me')).body.user, null);
  const noCookie = await client().get('/auth/line/callback?code=abc&state=x');
  assert.equal(noCookie.headers.get('location'), '/?login=failed');
});

test('PR-AUTH-01 LINE 回傳失敗時導回首頁並提示', async (t) => {
  const { client } = await startApp(t, {
    line: {
      exchangeCode: async () => {
        throw new Error('token 失敗');
      },
    },
  });
  const browser = client();
  const start = await browser.get('/auth/line');
  const callback = await browser.get(`/auth/line/callback?code=abc&state=${stateOf(start)}`);
  assert.equal(callback.headers.get('location'), '/?login=failed');
});

test('PR-REQ-02 未登入申請回 401，登入完成後回到原行程', async (t) => {
  const { client, user } = await startApp(t);
  const driver = await user('司機');
  const { body } = await driver.post('/api/trips', {
    date: '2026-11-08',
    time: '05:00',
    spots: ['北堤'],
    pickups: ['板橋'],
    seats: 1,
    boardRule: 'any',
    fareOneWay: 150,
  });
  const path = `/trips/${body.trip.id}`;
  const browser = client();
  const denied = await browser.post(`/api/trips/${body.trip.id}/requests`, {});
  assert.equal(denied.status, 401);
  const start = await browser.get(`/auth/line?next=${encodeURIComponent(path)}`);
  const callback = await browser.get(`/auth/line/callback?code=abc&state=${stateOf(start)}`);
  assert.equal(callback.headers.get('location'), path);
});

test('登入後只能導向站內路徑', () => {
  assert.equal(safeNext('/trips/1'), '/trips/1');
  assert.equal(safeNext('https://evil.test'), '/');
  assert.equal(safeNext('//evil.test'), '/');
  assert.equal(safeNext('/\\evil.test'), '/');
  assert.equal(safeNext(null), '/');
});

test('假登入預設關閉', async (t) => {
  const { client } = await startApp(t, { devLogin: false });
  assert.equal((await client().post('/auth/dev', { name: '冒充' })).status, 404);
});

test('登出後登入狀態失效', async (t) => {
  const { user } = await startApp(t);
  const someone = await user('某人');
  await someone.post('/api/logout');
  assert.equal((await someone.get('/api/me')).body.user, null);
});

test('寫入請求必須是 JSON，避免跨站表單送出', async (t) => {
  const { origin } = await startApp(t);
  const res = await fetch(`${origin}/api/trips`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'a=1',
  });
  assert.equal(res.status, 415);
});

test('LINE 客戶端以正確格式換 token 與推播', async () => {
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/token')) return Response.json({ access_token: 'tok' });
    if (url.endsWith('/profile')) {
      return Response.json({ userId: 'U9', displayName: '阿浪', pictureUrl: 'https://p' });
    }
    return Response.json({});
  };
  const client = createLineClient(
    { channelId: 'id', channelSecret: 'secret', messagingToken: 'mt', baseUrl: 'https://x.test' },
    fakeFetch,
  );
  assert.equal(new URL(client.authorizeUrl('s')).searchParams.get('redirect_uri'), 'https://x.test/auth/line/callback');
  const profile = await client.exchangeCode('code');
  assert.deepEqual(profile, { lineUserId: 'U9', displayName: '阿浪', pictureUrl: 'https://p' });
  assert.equal(calls[1].options.headers.authorization, 'Bearer tok');
  await client.push('U9', '哈囉');
  assert.equal(calls[2].options.headers.authorization, 'Bearer mt');
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    to: 'U9',
    messages: [{ type: 'text', text: '哈囉' }],
  });
});
