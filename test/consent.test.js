import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { openDb } from '../src/db.js';
import { createService } from '../src/service.js';
import { NOW, startApp } from './helpers.js';

const stateOf = (res) => new URL(res.headers.get('location')).searchParams.get('state');

// 走一次完整的 LINE 登入流程（假的 LINE 固定回傳 U1／小海）
async function lineLogin(browser) {
  const start = await browser.get('/auth/line');
  return browser.get(`/auth/line/callback?code=abc&state=${stateOf(start)}`);
}

test('PR-LEGAL-05 LINE 登入完成時記錄同意的條款版本與時間', async (t) => {
  const { client, service } = await startApp(t);
  const browser = client();
  await lineLogin(browser);
  const { user } = (await browser.get('/api/me')).body;
  const published = (await browser.get('/api/legal')).body.version;
  const saved = service.getUser(user.id);
  assert.equal(saved.terms_version, published);
  assert.equal(saved.terms_accepted_at, NOW);
});

test('PR-LEGAL-05 再登入一次會更新成最新的同意時間', async (t) => {
  const { client, service, clock } = await startApp(t);
  await lineLogin(client());
  const later = NOW + 3 * 86400_000;
  clock.now = later;
  const browser = client();
  await lineLogin(browser);
  const { user } = (await browser.get('/api/me')).body;
  assert.equal(service.getUser(user.id).terms_accepted_at, later);
});

test('PR-LEGAL-05 LINE 登入沒有完成時不更新同意紀錄', async (t) => {
  let lineDown = false;
  const { client, service, clock } = await startApp(t, {
    line: {
      exchangeCode: async () => {
        if (lineDown) throw new Error('token 失敗');
        return { lineUserId: 'U1', displayName: '小海' };
      },
    },
  });
  const browser = client();
  await lineLogin(browser);
  const { user } = (await browser.get('/api/me')).body;

  lineDown = true;
  clock.now = NOW + 86400_000;
  await lineLogin(client());
  assert.equal(service.getUser(user.id).terms_accepted_at, NOW);
});

test('PR-LEGAL-05 用沒有同意欄位的舊資料庫啟動，會補上欄位且保留既有使用者', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'carpool-'));
  const path = join(dir, 'old.db');
  // #16 之前的 users 表結構
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    line_user_id TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    picture_url TEXT,
    contact TEXT,
    created_at INTEGER NOT NULL
  )`);
  old.prepare('INSERT INTO users (line_user_id, display_name, created_at) VALUES (?, ?, ?)').run('U-old', '老用戶', NOW);
  old.close();

  const db = openDb(path);
  // Windows 上要先關閉資料庫才能刪檔
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const service = createService(db, { now: () => NOW });
  const existing = service.upsertLineUser({ lineUserId: 'U-old', displayName: '老用戶' });
  assert.equal(existing.display_name, '老用戶');
  // 既有使用者不需要補同意（#10 Out of scope）
  assert.equal(existing.terms_version, null);
  service.acceptTerms(existing, 'v-test');
  assert.equal(service.getUser(existing.id).terms_version, 'v-test');
});
