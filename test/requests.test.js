import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startApp, validTrip } from './helpers.js';

const applyBody = { pickup: '板橋新埔站', boardType: 'short' };

async function setup(t, tripOverrides) {
  const ctx = await startApp(t);
  const driver = await ctx.user('司機', 'driver-line');
  const { body } = await driver.post('/api/trips', validTrip(tripOverrides));
  return { ...ctx, driver, tripId: body.trip.id };
}

const apply = async (passenger, tripId) =>
  (await passenger.post(`/api/trips/${tripId}/requests`, applyBody)).body.requestId;

test('PR-REQ-01 乘客可申請，上車點與浪板類型為必填', async (t) => {
  const { user, tripId } = await setup(t);
  const passenger = await user('乘客');
  const missing = await passenger.post(`/api/trips/${tripId}/requests`, {});
  assert.equal(missing.status, 400);
  assert.deepEqual(missing.body.fields, ['pickup', 'boardType']);
  const wrong = await passenger.post(`/api/trips/${tripId}/requests`, {
    ...applyBody,
    pickup: '不在清單的地點',
  });
  assert.deepEqual(wrong.body.fields, ['pickup']);
  const ok = await passenger.post(`/api/trips/${tripId}/requests`, applyBody);
  assert.equal(ok.status, 201);
});

test('PR-REQ-03 司機可查看申請並接受或拒絕，其他人不行', async (t) => {
  const { user, driver, tripId } = await setup(t);
  const a = await user('乘客A');
  const b = await user('乘客B');
  const requestA = await apply(a, tripId);
  const requestB = await apply(b, tripId);

  const { body } = await driver.get(`/api/trips/${tripId}`);
  assert.deepEqual(
    body.trip.requests.map((r) => r.passenger.name),
    ['乘客A', '乘客B'],
  );
  assert.equal((await b.post(`/api/requests/${requestA}/accept`)).status, 403);
  assert.equal((await driver.post(`/api/requests/${requestA}/accept`)).status, 200);
  assert.equal((await driver.post(`/api/requests/${requestB}/reject`)).status, 200);
  assert.equal((await driver.post(`/api/requests/${requestB}/accept`)).status, 409);
});

test('PR-REQ-04 接受後座位減一，已確認人數不超過座位數', async (t) => {
  const { user, driver, tripId } = await setup(t, { seats: 1 });
  const a = await user('乘客A');
  const b = await user('乘客B');
  const requestA = await apply(a, tripId);
  const requestB = await apply(b, tripId);
  await driver.post(`/api/requests/${requestA}/accept`);
  const { body } = await driver.get(`/api/trips/${tripId}`);
  assert.equal(body.trip.seatsLeft, 0);
  const over = await driver.post(`/api/requests/${requestB}/accept`);
  assert.equal(over.status, 409);
  assert.equal(over.body.error, 'full');
});

test('PR-FIND-04 已滿的行程標示已滿且不能再申請', async (t) => {
  const { user, driver, client, tripId } = await setup(t, { seats: 1 });
  const a = await user('乘客A');
  await driver.post(`/api/requests/${await apply(a, tripId)}/accept`);
  const list = await client().get('/api/trips');
  assert.equal(list.body.trips[0].full, true);
  const late = await user('晚到的人');
  const res = await late.post(`/api/trips/${tripId}/requests`, applyBody);
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'full');
});

test('PR-REQ-05 乘客可查看申請狀態', async (t) => {
  const { user, driver, tripId } = await setup(t);
  const passenger = await user('乘客');
  const requestId = await apply(passenger, tripId);
  const pending = await passenger.get(`/api/trips/${tripId}`);
  assert.equal(pending.body.trip.myRequest.status, 'pending');
  await driver.post(`/api/requests/${requestId}/reject`);
  const rejected = await passenger.get(`/api/trips/${tripId}`);
  assert.equal(rejected.body.trip.myRequest.status, 'rejected');
  const mine = await passenger.get('/api/my');
  assert.equal(mine.body.requests[0].status, 'rejected');
});

test('PR-REQ-06 不能申請自己的行程，也不能重複申請', async (t) => {
  const { user, driver, tripId } = await setup(t);
  const own = await driver.post(`/api/trips/${tripId}/requests`, applyBody);
  assert.equal(own.body.error, 'own_trip');
  const passenger = await user('乘客');
  await apply(passenger, tripId);
  const again = await passenger.post(`/api/trips/${tripId}/requests`, applyBody);
  assert.equal(again.body.error, 'duplicate');
});

test('已出發的行程不能申請、確認或退出', async (t) => {
  const { user, driver, clock, tripId } = await setup(t);
  const a = await user('乘客A');
  const b = await user('乘客B');
  const requestA = await apply(a, tripId);
  clock.now = Date.parse('2026-11-08T05:00:00+08:00');
  const res = await b.post(`/api/trips/${tripId}/requests`, applyBody);
  assert.equal(res.body.error, 'departed');
  assert.equal((await driver.post(`/api/requests/${requestA}/accept`)).body.error, 'departed');
  assert.equal((await a.post(`/api/requests/${requestA}/withdraw`)).body.error, 'departed');
});

test('PR-CONTACT-01 沒填聯絡方式不能發行程或申請', async (t) => {
  const { user, tripId } = await setup(t);
  const noContact = await user('沒聯絡方式', null);
  const trip = await noContact.post('/api/trips', validTrip());
  assert.equal(trip.body.error, 'contact_required');
  const request = await noContact.post(`/api/trips/${tripId}/requests`, applyBody);
  assert.equal(request.body.error, 'contact_required');
});

test('PR-CONTACT-02 聯絡方式只在接受後顯示給該司機與該乘客', async (t) => {
  const { user, driver, client, tripId } = await setup(t);
  const a = await user('乘客A', 'a-line');
  const b = await user('乘客B', 'b-line');
  const requestA = await apply(a, tripId);
  await apply(b, tripId);

  const before = await a.get(`/api/trips/${tripId}`);
  assert.equal(before.body.trip.driverContact, undefined);
  const driverBefore = await driver.get(`/api/trips/${tripId}`);
  assert.ok(driverBefore.body.trip.requests.every((r) => r.contact === undefined));

  await driver.post(`/api/requests/${requestA}/accept`);

  assert.equal((await a.get(`/api/trips/${tripId}`)).body.trip.driverContact, 'driver-line');
  const driverAfter = await driver.get(`/api/trips/${tripId}`);
  assert.equal(driverAfter.body.trip.requests[0].contact, 'a-line');
  assert.equal(driverAfter.body.trip.requests[1].contact, undefined);

  // 未被接受的乘客、未登入者、公開列表都不能出現聯絡方式
  for (const res of [
    await b.get(`/api/trips/${tripId}`),
    await client().get(`/api/trips/${tripId}`),
    await client().get('/api/trips'),
  ]) {
    assert.doesNotMatch(res.text, /driver-line|a-line|b-line/);
  }
});

test('PR-CONTACT-02 乘客退出後雙方不再看得到聯絡方式', async (t) => {
  const { user, driver, tripId } = await setup(t);
  const a = await user('乘客A', 'a-line');
  const requestId = await apply(a, tripId);
  await driver.post(`/api/requests/${requestId}/accept`);
  await a.post(`/api/requests/${requestId}/withdraw`);
  assert.doesNotMatch((await a.get(`/api/trips/${tripId}`)).text, /driver-line/);
  assert.doesNotMatch((await driver.get(`/api/trips/${tripId}`)).text, /a-line/);
});

test('PR-NOTIFY-01 有新申請時推播給司機', async (t) => {
  const { user, pushes, tripId } = await setup(t);
  await apply(await user('乘客'), tripId);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].lineUserId, 'dev:司機');
  assert.match(pushes[0].text, /乘客 申請了/);
  assert.match(pushes[0].text, new RegExp(`/trips/${tripId}`));
});

test('PR-NOTIFY-02 接受與拒絕都推播給乘客', async (t) => {
  const { user, driver, pushes, tripId } = await setup(t);
  const a = await user('乘客A');
  const b = await user('乘客B');
  const requestA = await apply(a, tripId);
  const requestB = await apply(b, tripId);
  pushes.length = 0;
  await driver.post(`/api/requests/${requestA}/accept`);
  await driver.post(`/api/requests/${requestB}/reject`);
  assert.equal(pushes[0].lineUserId, 'dev:乘客A');
  assert.match(pushes[0].text, /已被接受/);
  assert.equal(pushes[1].lineUserId, 'dev:乘客B');
  assert.match(pushes[1].text, /未被接受/);
});

test('推播失敗時操作仍然成功', async (t) => {
  const ctx = await startApp(t, {
    line: {
      push: async () => {
        throw new Error('LINE 掛了');
      },
    },
  });
  const driver = await ctx.user('司機');
  const { body } = await driver.post('/api/trips', validTrip());
  const passenger = await ctx.user('乘客');
  const res = await passenger.post(`/api/trips/${body.trip.id}/requests`, applyBody);
  assert.equal(res.status, 201);
});

test('PR-CANCEL-01 司機取消行程，通知待確認與已接受的乘客', async (t) => {
  const { user, driver, pushes, tripId } = await setup(t);
  const a = await user('乘客A');
  const b = await user('乘客B');
  const c = await user('乘客C');
  await driver.post(`/api/requests/${await apply(a, tripId)}/accept`);
  await apply(b, tripId);
  await driver.post(`/api/requests/${await apply(c, tripId)}/reject`);
  assert.equal((await a.post(`/api/trips/${tripId}/cancel`)).status, 403);
  pushes.length = 0;
  assert.equal((await driver.post(`/api/trips/${tripId}/cancel`)).status, 200);
  assert.deepEqual(pushes.map((p) => p.lineUserId).sort(), ['dev:乘客A', 'dev:乘客B']);
  const { body } = await a.get(`/api/trips/${tripId}`);
  assert.equal(body.trip.status, 'cancelled');
  assert.equal(body.trip.driverContact, undefined);
});

test('PR-CANCEL-01 已出發的行程不能取消', async (t) => {
  const { driver, clock, tripId } = await setup(t);
  clock.now = Date.parse('2026-11-08T06:00:00+08:00');
  const res = await driver.post(`/api/trips/${tripId}/cancel`);
  assert.equal(res.body.error, 'departed');
});

test('PR-CANCEL-02 已接受的乘客退出會釋放座位並通知司機，之後可重新申請', async (t) => {
  const { user, driver, pushes, tripId } = await setup(t, { seats: 1 });
  const a = await user('乘客A');
  const requestId = await apply(a, tripId);
  await driver.post(`/api/requests/${requestId}/accept`);
  pushes.length = 0;
  assert.equal((await a.post(`/api/requests/${requestId}/withdraw`)).status, 200);
  assert.equal(pushes[0].lineUserId, 'dev:司機');
  assert.match(pushes[0].text, /座位已釋出/);
  const { body } = await driver.get(`/api/trips/${tripId}`);
  assert.equal(body.trip.seatsLeft, 1);
  assert.equal(body.trip.requests.length, 0);
  assert.equal((await a.post(`/api/trips/${tripId}/requests`, applyBody)).status, 201);
});

test('PR-CANCEL-02 別人不能替乘客退出，已拒絕的申請也不能退出', async (t) => {
  const { user, driver, tripId } = await setup(t);
  const a = await user('乘客A');
  const b = await user('乘客B');
  const requestId = await apply(a, tripId);
  assert.equal((await b.post(`/api/requests/${requestId}/withdraw`)).status, 403);
  await driver.post(`/api/requests/${requestId}/reject`);
  assert.equal((await a.post(`/api/requests/${requestId}/withdraw`)).status, 409);
});

test('PR-REQ-07 浪板類型必須符合司機的載板條件，不符時無法申請', async (t) => {
  const cases = [
    { boardRule: 'none', allowed: ['none'], denied: ['short', 'long'] },
    { boardRule: 'short', allowed: ['none', 'short'], denied: ['long'] },
    { boardRule: 'any', allowed: ['none', 'short', 'long'], denied: [] },
  ];
  const { user } = await startApp(t);
  const driver = await user('司機');
  for (const { boardRule, allowed, denied } of cases) {
    const { body } = await driver.post('/api/trips', validTrip({ boardRule, seats: 3 }));
    for (const boardType of denied) {
      const passenger = await user(`被擋-${boardRule}-${boardType}`);
      const res = await passenger.post(`/api/trips/${body.trip.id}/requests`, {
        pickup: '板橋新埔站',
        boardType,
      });
      assert.equal(res.status, 400, `${boardRule} 不該接受 ${boardType}`);
      assert.equal(res.body.error, 'board_not_allowed');
      assert.deepEqual(res.body.fields, ['boardType']);
    }
    for (const boardType of allowed) {
      const passenger = await user(`可以-${boardRule}-${boardType}`);
      const res = await passenger.post(`/api/trips/${body.trip.id}/requests`, {
        pickup: '板橋新埔站',
        boardType,
      });
      assert.equal(res.status, 201, `${boardRule} 應該接受 ${boardType}`);
    }
  }
});

test('PR-REQ-07 前端設定提供每種載板條件可選的浪板類型', async (t) => {
  const { client } = await startApp(t);
  const { body } = await client().get('/api/config');
  assert.deepEqual(body.boardAllowed, {
    none: ['none'],
    short: ['none', 'short'],
    any: ['none', 'short', 'long'],
  });
});
