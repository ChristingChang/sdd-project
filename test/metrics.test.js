import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createService } from '../src/service.js';
import { openDb } from '../src/db.js';
import { NOW, validTrip } from './helpers.js';

test('PR-METRIC-01 只計入已出發、未取消、有已確認乘客的行程，並依週分組', () => {
  const db = openDb();
  const clock = { now: NOW };
  const service = createService(db, { now: () => clock.now });
  const user = (name) => {
    const created = service.upsertLineUser({ lineUserId: name, displayName: name });
    return service.setContact(created, `${name}-line`);
  };
  const driver = user('司機');
  const passenger = user('乘客');
  const body = { pickup: '板橋新埔站', boardType: 'short' };
  const confirmedTrip = (date) => {
    const trip = service.createTrip(driver, validTrip({ date }));
    const { request } = service.applyToTrip(passenger, trip.id, body);
    service.decide(driver, request.id, 'accepted');
    return trip;
  };

  confirmedTrip('2026-11-07'); // 週六，週一為 11-02
  confirmedTrip('2026-11-08'); // 週日，同一週
  confirmedTrip('2026-11-10'); // 週二，下一週
  service.createTrip(driver, validTrip({ date: '2026-11-08' })); // 沒有乘客
  const cancelled = confirmedTrip('2026-11-08');
  service.cancelTrip(driver, cancelled.id);
  confirmedTrip('2026-11-30'); // 尚未出發

  clock.now = Date.parse('2026-11-12T12:00:00+08:00');
  assert.deepEqual(service.weeklyCompletedTrips(), [
    { weekStart: '2026-11-02', trips: 2 },
    { weekStart: '2026-11-09', trips: 1 },
  ]);
  db.close();
});
