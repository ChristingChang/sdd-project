import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startApp, validTrip } from './helpers.js';

const MEET = '3 號出口全家門口，白色 RAV4';

test('PR-MEET-01 司機可填精確集合點，並在自己的行程頁看到', async (t) => {
  const { user } = await startApp(t);
  const driver = await user('司機');
  const { body } = await driver.post('/api/trips', validTrip({ meetingPoint: MEET }));
  const own = await driver.get(`/api/trips/${body.trip.id}`);
  assert.equal(own.body.trip.meetingPoint, MEET);
});

// 建好一趟有集合點的行程，回傳司機與行程編號
async function setupTrip(t) {
  const ctx = await startApp(t);
  const driver = await ctx.user('司機');
  const { body } = await driver.post('/api/trips', validTrip({ meetingPoint: MEET }));
  const apply = async (passenger) =>
    (await passenger.post(`/api/trips/${body.trip.id}/requests`, { pickup: '後山埤站', boardType: 'none' }))
      .body.requestId;
  return { ...ctx, driver, tripId: body.trip.id, apply };
}

test('PR-MEET-02 精確集合點只顯示給已接受的乘客', async (t) => {
  const { user, driver, client, tripId, apply } = await setupTrip(t);
  const accepted = await user('乘客A');
  const pending = await user('乘客B');
  const rejected = await user('乘客C');
  const requestA = await apply(accepted);
  await apply(pending);
  const requestC = await apply(rejected);
  await driver.post(`/api/requests/${requestA}/accept`);
  await driver.post(`/api/requests/${requestC}/reject`);

  assert.equal((await accepted.get(`/api/trips/${tripId}`)).body.trip.meetingPoint, MEET);
  for (const res of [
    await pending.get(`/api/trips/${tripId}`),
    await rejected.get(`/api/trips/${tripId}`),
    await client().get(`/api/trips/${tripId}`),
    await client().get('/api/trips'),
  ]) {
    assert.doesNotMatch(res.text, /全家門口/);
  }
});

test('PR-MEET-02 接受推播附上精確集合點，拒絕推播不附', async (t) => {
  const { user, driver, pushes, apply } = await setupTrip(t);
  const requestA = await apply(await user('乘客A'));
  const requestB = await apply(await user('乘客B'));
  pushes.length = 0;
  await driver.post(`/api/requests/${requestA}/accept`);
  await driver.post(`/api/requests/${requestB}/reject`);
  assert.match(pushes[0].text, /3 號出口全家門口，白色 RAV4/);
  assert.doesNotMatch(pushes[1].text, /全家門口/);
});
