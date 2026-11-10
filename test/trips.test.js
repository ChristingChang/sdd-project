import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startApp, validTrip } from './helpers.js';

test('PR-TRIP-01 司機可發布含必填與選填欄位的行程', async (t) => {
  const { user } = await startApp(t);
  const driver = await user('司機');
  const res = await driver.post(
    '/api/trips',
    validTrip({ spots: ['北堤', '雙獅'], fareRoundTrip: 250, returnTime: '10:00' }),
  );
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.trip.spots, ['北堤', '雙獅']);
  assert.deepEqual(res.body.trip.pickups, ['板橋新埔站', '後山埤站']);
  assert.equal(res.body.trip.fareRoundTrip, 250);
  assert.equal(res.body.trip.returnTime, '10:00');
  assert.equal(res.body.trip.seatsLeft, 2);
});

test('PR-TRIP-01 未登入不能發布行程', async (t) => {
  const { client } = await startApp(t);
  const res = await client().post('/api/trips', validTrip());
  assert.equal(res.status, 401);
});

test('PR-TRIP-02 缺少必填欄位時無法發布，並標示每個欄位', async (t) => {
  const { user } = await startApp(t);
  const driver = await user('司機');
  const res = await driver.post('/api/trips', {});
  assert.equal(res.status, 400);
  assert.deepEqual(res.body.fields, [
    'date',
    'time',
    'spots',
    'pickups',
    'seats',
    'boardRule',
    'fareOneWay',
  ]);
  const { body } = await driver.get('/api/trips');
  assert.equal(body.trips.length, 0);
});

test('PR-TRIP-02 拒絕不存在的日期、過去的時間與未知浪點', async (t) => {
  const { user } = await startApp(t);
  const driver = await user('司機');
  const badDate = await driver.post('/api/trips', validTrip({ date: '2026-02-31' }));
  assert.deepEqual(badDate.body.fields, ['date']);
  const past = await driver.post('/api/trips', validTrip({ date: '2026-11-06', time: '11:59' }));
  assert.equal(past.status, 400);
  const badSpot = await driver.post('/api/trips', validTrip({ spots: ['墾丁'] }));
  assert.deepEqual(badSpot.body.fields, ['spots']);
});

test('PR-TRIP-03 未登入可用分享連結查看行程，頁面路徑可開啟', async (t) => {
  const { user, client } = await startApp(t);
  const driver = await user('司機');
  const { body } = await driver.post('/api/trips', validTrip());
  const anonymous = client();
  const api = await anonymous.get(`/api/trips/${body.trip.id}`);
  assert.equal(api.status, 200);
  assert.equal(api.body.trip.driver.name, '司機');
  const page = await anonymous.get(`/trips/${body.trip.id}`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
});

test('PR-TRIP-04 發行程頁包含僅分攤油資的提示', async (t) => {
  const { client } = await startApp(t);
  const res = await client().get('/app.js');
  assert.match(res.text, /車資僅限分攤油資與過路費/);
});

test('PR-FIND-01 只列未出發且未取消的行程，由近到遠排序', async (t) => {
  const { user, client, clock } = await startApp(t);
  const driver = await user('司機');
  const later = await driver.post('/api/trips', validTrip({ date: '2026-11-09' }));
  const soon = await driver.post('/api/trips', validTrip({ date: '2026-11-07' }));
  const cancelled = await driver.post('/api/trips', validTrip({ date: '2026-11-08' }));
  await driver.post(`/api/trips/${cancelled.body.trip.id}/cancel`);

  const list = await client().get('/api/trips');
  assert.deepEqual(
    list.body.trips.map((trip) => trip.id),
    [soon.body.trip.id, later.body.trip.id],
  );

  clock.now = Date.parse('2026-11-07T05:00:00+08:00');
  const after = await client().get('/api/trips');
  assert.deepEqual(
    after.body.trips.map((trip) => trip.id),
    [later.body.trip.id],
  );
});

test('PR-FIND-02 可依日期篩選', async (t) => {
  const { user, client } = await startApp(t);
  const driver = await user('司機');
  await driver.post('/api/trips', validTrip({ date: '2026-11-07' }));
  const target = await driver.post('/api/trips', validTrip({ date: '2026-11-08' }));
  const res = await client().get('/api/trips?date=2026-11-08');
  assert.deepEqual(
    res.body.trips.map((trip) => trip.id),
    [target.body.trip.id],
  );
});

test('PR-FIND-03 可依浪點篩選，多浪點行程也會命中', async (t) => {
  const { user, client } = await startApp(t);
  const driver = await user('司機');
  await driver.post('/api/trips', validTrip({ spots: ['北堤'] }));
  const target = await driver.post('/api/trips', validTrip({ spots: ['北堤', '雙獅'] }));
  const res = await client().get(`/api/trips?spot=${encodeURIComponent('雙獅')}`);
  assert.deepEqual(
    res.body.trips.map((trip) => trip.id),
    [target.body.trip.id],
  );
});
