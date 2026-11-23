import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deleteUserCommand } from '../src/admin.js';
import { startApp, validTrip } from './helpers.js';

const applyBody = { pickup: '板橋新埔站', boardType: 'short' };
// 出發時間 2026-11-08 05:00 之後，用來讓行程變成「已出發」
const AFTER_DEPARTURE = Date.parse('2026-11-08T06:00:00+08:00');

// 司機發一趟車；回傳每個人的 HTTP client 與使用者編號
async function setup(t, tripOverrides) {
  const ctx = await startApp(t);
  const driver = await ctx.user('司機', 'driver-line');
  const { body } = await driver.post('/api/trips', validTrip(tripOverrides));
  return { ...ctx, driver, tripId: body.trip.id };
}

const idOf = async (client) => (await client.get('/api/me')).body.user.id;
const apply = async (passenger, tripId) =>
  (await passenger.post(`/api/trips/${tripId}/requests`, applyBody)).body.requestId;

// 跑刪除指令：預設自動回答 yes，訊息收集起來給測試檢查
async function runDelete(ctx, userId, { answer = true } = {}) {
  const lines = [];
  const code = await deleteUserCommand({
    service: ctx.service,
    notifier: ctx.notifier,
    userId,
    confirm: async () => answer,
    log: (text) => lines.push(text),
  });
  return { code, output: lines.join('\n') };
}

test('PR-ACCOUNT-01 刪除後清空聯絡方式與頭像、名稱改為已刪除的使用者、登入立即失效', async (t) => {
  const ctx = await setup(t);
  const { driver, tripId, client } = ctx;
  const id = await idOf(driver);

  const { code } = await runDelete(ctx, id);
  assert.equal(code, 0);

  const row = ctx.service.getUser(id);
  assert.equal(row.contact, null);
  assert.equal(row.picture_url, null);
  assert.equal(row.display_name, '已刪除的使用者');
  // 原本的登入失效
  assert.equal((await driver.get('/api/me')).body.user, null);
  // 公開頁面只看得到「已刪除的使用者」
  const { text } = await client().get(`/api/trips/${tripId}`);
  assert.match(text, /已刪除的使用者/);
  assert.doesNotMatch(text, /司機|driver-line/);
});

test('PR-ACCOUNT-01 原 LINE 帳號再登入會是全新的使用者', async (t) => {
  const ctx = await setup(t);
  const id = await idOf(ctx.driver);
  await runDelete(ctx, id);

  const again = ctx.client();
  await again.post('/auth/dev', { name: '司機' });
  const { user } = (await again.get('/api/me')).body;
  assert.notEqual(user.id, id);
  assert.equal(user.contact, null);
  assert.equal((await again.get('/api/my')).body.trips.length, 0);
});

test('PR-ACCOUNT-01 執行前印出預覽，沒輸入 yes 就中止且不改任何資料', async (t) => {
  const ctx = await setup(t);
  const { user, driver, tripId } = ctx;
  const a = await user('乘客A');
  const b = await user('乘客B');
  await driver.post(`/api/requests/${await apply(a, tripId)}/accept`);
  await apply(b, tripId);
  const id = await idOf(driver);
  ctx.pushes.length = 0;

  const { code, output } = await runDelete(ctx, id, { answer: false });
  assert.notEqual(code, 0);
  // 預覽：編號與名稱、還沒出發的行程與人數、會通知誰
  assert.match(output, new RegExp(`#${id}`));
  assert.match(output, /司機/);
  assert.match(output, new RegExp(`#${tripId}`));
  assert.match(output, /已接受 1 人/);
  assert.match(output, /待確認 1 人/);
  assert.match(output, /乘客A/);
  assert.match(output, /乘客B/);
  assert.match(output, /中止/);

  // 什麼都沒變
  assert.equal(ctx.service.getUser(id).contact, 'driver-line');
  assert.equal((await driver.get('/api/me')).body.user.id, id);
  assert.equal((await driver.get(`/api/trips/${tripId}`)).body.trip.status, 'open');
  assert.equal(ctx.pushes.length, 0);
});

test('PR-ACCOUNT-01 編號不存在或重複刪除，印出清楚訊息且不壞資料', async (t) => {
  const ctx = await setup(t);
  const id = await idOf(ctx.driver);

  const missing = await runDelete(ctx, 9999);
  assert.notEqual(missing.code, 0);
  assert.match(missing.output, /找不到編號 9999/);

  const notNumber = await runDelete(ctx, 'abc');
  assert.notEqual(notNumber.code, 0);
  assert.match(notNumber.output, /使用者編號/);

  assert.equal((await runDelete(ctx, id)).code, 0);
  const twice = await runDelete(ctx, id);
  assert.notEqual(twice.code, 0);
  assert.match(twice.output, /已經刪除過/);
  assert.equal(ctx.service.getUser(id).display_name, '已刪除的使用者');
});

test('PR-ACCOUNT-02 刪除司機：還沒出發的行程取消，待確認與已接受的乘客收到取消推播', async (t) => {
  const ctx = await setup(t);
  const { user, driver, tripId, pushes } = ctx;
  const a = await user('乘客A');
  const b = await user('乘客B');
  const c = await user('乘客C');
  await driver.post(`/api/requests/${await apply(a, tripId)}/accept`);
  await apply(b, tripId);
  await driver.post(`/api/requests/${await apply(c, tripId)}/reject`);
  pushes.length = 0;

  await runDelete(ctx, await idOf(driver));

  assert.equal((await a.get(`/api/trips/${tripId}`)).body.trip.status, 'cancelled');
  assert.deepEqual(pushes.map((p) => p.lineUserId).sort(), ['dev:乘客A', 'dev:乘客B']);
  // 和司機自己按取消（PR-CANCEL-01）同一句話
  for (const p of pushes) {
    assert.equal(p.text, `你申請的 2026-11-08 05:00 行程已被司機取消\nhttp://test.local/trips/${tripId}`);
  }
});

test('PR-ACCOUNT-02 刪除乘客：申請改為已退出，已接受的釋出座位並通知司機，待確認的不通知', async (t) => {
  const ctx = await setup(t, { seats: 1 });
  const { user, driver, tripId, pushes } = ctx;
  const a = await user('乘客A');
  await driver.post(`/api/requests/${await apply(a, tripId)}/accept`);
  const other = (await driver.post('/api/trips', validTrip({ time: '06:00' }))).body.trip.id;
  await apply(a, other);
  pushes.length = 0;

  await runDelete(ctx, await idOf(a));

  const { body } = await driver.get(`/api/trips/${tripId}`);
  assert.equal(body.trip.seatsLeft, 1);
  assert.equal(body.trip.requests.length, 0);
  assert.equal((await driver.get(`/api/trips/${other}`)).body.trip.requests.length, 0);
  // 只有已接受那筆通知司機，和乘客自己按退出（PR-CANCEL-02）同一句話
  assert.deepEqual(pushes, [
    {
      lineUserId: 'dev:司機',
      text: `乘客A 退出了你 2026-11-08 05:00 的行程，座位已釋出\nhttp://test.local/trips/${tripId}`,
    },
  ]);
});

test('PR-ACCOUNT-03 已出發的行程保留，清除可認出本人的細節，成行趟數不變', async (t) => {
  const ctx = await setup(t, { note: '不菸', meetingPoint: '3 號出口' });
  const { user, driver, tripId, clock, service } = ctx;
  const a = await user('乘客A');
  const requestId = await apply(a, tripId);
  await driver.post(`/api/requests/${requestId}/accept`);
  clock.now = AFTER_DEPARTURE;
  const before = service.weeklyCompletedTrips();
  assert.equal(before.length, 1);

  // 先刪乘客：他已接受的申請要維持已接受，否則這趟會變成沒成行
  await runDelete(ctx, await idOf(a));
  assert.deepEqual(service.weeklyCompletedTrips(), before);
  const driverView = (await driver.get(`/api/trips/${tripId}`)).body.trip;
  assert.equal(driverView.requests[0].status, 'accepted');
  assert.equal(driverView.requests[0].pickup, '');
  assert.equal(driverView.requests[0].passenger.name, '已刪除的使用者');

  // 再刪司機：只留日期、浪點、座位與狀態
  const driverId = await idOf(driver);
  await runDelete(ctx, driverId);
  // 精確集合點不在公開欄位裡，從持久化狀態確認有清掉
  assert.equal(service.tripTemplate({ id: driverId }).meetingPoint, null);
  assert.deepEqual(service.weeklyCompletedTrips(), before);
  const { trip } = (await ctx.client().get(`/api/trips/${tripId}`)).body;
  assert.equal(trip.status, 'open');
  assert.equal(trip.date, '2026-11-08');
  assert.deepEqual(trip.spots, ['北堤']);
  assert.equal(trip.seats, 2);
  assert.deepEqual(trip.pickups, []);
  assert.equal(trip.note, null);
  assert.equal(trip.driver.name, '已刪除的使用者');
});

test('PR-ACCOUNT-01 管理員可依名稱或聯絡方式查到使用者編號，已刪除的不列出', async (t) => {
  const ctx = await setup(t);
  const a = await ctx.user('小魚', 'yu-line');
  const id = await idOf(a);
  assert.deepEqual(
    ctx.service.findUsers('小魚').map((u) => u.id),
    [id],
  );
  assert.deepEqual(
    ctx.service.findUsers('yu-line').map((u) => u.id),
    [id],
  );
  await runDelete(ctx, id);
  assert.deepEqual(ctx.service.findUsers('小魚'), []);
});
