import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openDb } from '../src/db.js';
import { startApp, validTrip } from './helpers.js';

test('浪點選項：北堤標註烏石港、蜜月灣標註大溪，沒有烏石港與頭城', async (t) => {
  const { client } = await startApp(t);
  const { body } = await client().get('/api/config');
  assert.deepEqual(body.spots, ['北堤', '雙獅', '外澳', '蜜月灣', '宜蘭其他']);
  assert.equal(body.spotLabels['北堤'], '北堤（烏石港）');
  assert.equal(body.spotLabels['蜜月灣'], '蜜月灣（大溪）');
  assert.equal(body.spotLabels['雙獅'], '雙獅');
});

test('可以發布蜜月灣的行程，不能再發布烏石港', async (t) => {
  const { user } = await startApp(t);
  const driver = await user('司機');
  assert.equal((await driver.post('/api/trips', validTrip({ spots: ['蜜月灣'] }))).status, 201);
  const old = await driver.post('/api/trips', validTrip({ spots: ['烏石港'] }));
  assert.equal(old.status, 400);
  assert.deepEqual(old.body.fields, ['spots']);
});

test('既有的烏石港行程在啟動時改成北堤，重複的北堤只留一個', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'spots-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'app.db');
  const db = openDb(path);
  db.prepare(`INSERT INTO users (line_user_id, display_name, created_at) VALUES ('U1', '司機', 0)`).run();
  const insert = db.prepare(
    `INSERT INTO trips (driver_id, date, time, depart_ts, spots, pickups, seats, board_rule, fare_one_way, created_at)
     VALUES (1, '2026-11-08', '05:00', 0, ?, '["南港"]', 2, 'any', 150, 0)`,
  );
  insert.run(JSON.stringify(['烏石港']));
  insert.run(JSON.stringify(['北堤', '烏石港', '雙獅']));
  db.close();

  const reopened = openDb(path);
  const spots = reopened.prepare('SELECT spots FROM trips ORDER BY id').all().map((r) => JSON.parse(r.spots));
  reopened.close();
  assert.deepEqual(spots, [['北堤'], ['北堤', '雙獅']]);
});
