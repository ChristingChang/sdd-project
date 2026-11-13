import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startApp, validTrip } from './helpers.js';

test('PR-SHARE-01 司機的行程頁提供可直接貼到 FB／Threads 的發文文字', async (t) => {
  const { user } = await startApp(t);
  const driver = await user('司機');
  const { body } = await driver.post(
    '/api/trips',
    validTrip({ spots: ['北堤', '雙獅'], fareRoundTrip: 250, returnTime: '10:00' }),
  );
  const res = await driver.get(`/api/trips/${body.trip.id}`);
  assert.equal(
    res.body.trip.shareText,
    [
      '#我是司機徵乘客',
      '日期：11/8（日）',
      '浪點：北堤、雙獅',
      '出發：05:00',
      '上車：板橋新埔站、後山埤站',
      '座位：剩 2 位',
      '載板：僅短板',
      '車資：單程 $150／來回 $250',
      '回程：10:00',
      '',
      `申請共乘：http://test.local/trips/${body.trip.id}`,
    ].join('\n'),
  );
});

test('PR-SHARE-02 發文文字不超過 500 字、只有一個標籤、不含聯絡方式與集合點', async (t) => {
  const { user } = await startApp(t);
  const driver = await user('司機', 'driver-line-id');
  // 上車點塞到上限（8 個 × 40 字），逼出最長的情況
  const pickups = Array.from({ length: 8 }, (_, i) => `${i}`.repeat(40));
  const { body } = await driver.post(
    '/api/trips',
    validTrip({ pickups, meetingPoint: '3 號出口全家門口', note: '備'.repeat(300) }),
  );
  const { shareText } = (await driver.get(`/api/trips/${body.trip.id}`)).body.trip;
  assert.ok([...shareText].length <= 500, `長度 ${[...shareText].length}`);
  assert.equal(shareText.match(/#/g).length, 1);
  assert.match(shareText, new RegExp(`/trips/${body.trip.id}$`));
  assert.doesNotMatch(shareText, /driver-line-id|全家門口/);
});
