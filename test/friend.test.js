import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startApp } from './helpers.js';

test('PR-FRIEND-01 有設定官方帳號 ID 時，前端設定帶出加好友網址', async (t) => {
  const { client } = await startApp(t, { lineOaBasicId: '@abc1234' });
  const { body } = await client().get('/api/config');
  // @ 編碼成 %40，是 LINE 文件寫的加好友網址格式
  assert.equal(body.addFriendUrl, 'https://line.me/R/ti/p/%40abc1234');
});

test('PR-FRIEND-01 沒設定官方帳號 ID 時，前端設定照常回應且沒有加好友網址', async (t) => {
  for (const lineOaBasicId of [undefined, '', '   ']) {
    const { client } = await startApp(t, { lineOaBasicId });
    const { status, body } = await client().get('/api/config');
    assert.equal(status, 200);
    assert.equal(body.addFriendUrl, undefined, `設定為 ${JSON.stringify(lineOaBasicId)} 時不該有網址`);
  }
});

test('PR-FRIEND-01 前端有加好友提醒，且不承諾一定收得到', async (t) => {
  const { client } = await startApp(t);
  const { text } = await client().get('/app.js');
  assert.match(text, /記得加浪乘官方帳號好友，才收得到申請和接受通知/);
  // docs/user-stories.md「宣傳時不要說的話」
  assert.doesNotMatch(text, /一定收得到/);
});
