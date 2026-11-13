// 領域規則。所有函式都是同步的：單一 Node 行程內不會交錯執行，
// 所以「檢查座位 → 寫入」不會發生超賣。若改成多行程部署，這個前提要重新檢視。

export const SPOTS = ['北堤', '雙獅', '頭城', '烏石港', '外澳', '宜蘭其他'];
export const BOARD_RULES = { none: '不載板', short: '僅短板', any: '長短板皆可' };
export const BOARD_TYPES = { none: '不帶板', short: '短板', long: '長板' };
// 每種載板條件允許乘客帶的浪板類型（PR-REQ-07）
export const BOARD_ALLOWED = {
  none: ['none'],
  short: ['none', 'short'],
  any: ['none', 'short', 'long'],
};

export class DomainError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const notFound = () => new DomainError(404, 'not_found', '找不到資料');
const forbidden = () => new DomainError(403, 'forbidden', '沒有權限');

const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const isBlank = (v) => v === undefined || v === null || v === '';
const isFare = (v) => Number.isInteger(v) && v >= 0 && v <= 5000;

// Date.parse 會把 02-31 默默進位成三月，所以要轉回來比對
function isDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const parsed = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
}

// 行程時間一律以台灣時間解讀
const toTs = (date, time) => Date.parse(`${date}T${time}:00+08:00`);

function cleanList(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  const items = value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean);
  return [...new Set(items)].slice(0, maxItems);
}

export function createService(db, { now = () => Date.now() } = {}) {
  const seatsTaken = (tripId) =>
    db
      .prepare(`SELECT COUNT(*) AS n FROM requests WHERE trip_id = ? AND status = 'accepted'`)
      .get(tripId).n;

  const rawTrip = (id) => {
    const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(id);
    if (!trip) throw notFound();
    return trip;
  };

  const rawRequest = (id) => {
    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
    if (!request) throw notFound();
    return request;
  };

  const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

  const requireContact = (user) => {
    if (!user.contact) throw new DomainError(400, 'contact_required', '請先填寫聯絡方式');
  };

  const assertOpen = (trip) => {
    if (trip.status !== 'open') throw new DomainError(409, 'cancelled', '行程已取消');
    if (trip.depart_ts <= now()) throw new DomainError(409, 'departed', '行程已出發');
  };

  // 公開欄位：這裡刻意不含任何聯絡方式
  const present = (trip) => {
    const driver = getUser(trip.driver_id);
    const taken = seatsTaken(trip.id);
    return {
      id: trip.id,
      date: trip.date,
      time: trip.time,
      spots: JSON.parse(trip.spots),
      pickups: JSON.parse(trip.pickups),
      seats: trip.seats,
      seatsLeft: Math.max(trip.seats - taken, 0),
      full: taken >= trip.seats,
      boardRule: trip.board_rule,
      fareOneWay: trip.fare_one_way,
      fareRoundTrip: trip.fare_round_trip,
      returnTime: trip.return_time,
      note: trip.note,
      status: trip.status,
      departed: trip.depart_ts <= now(),
      driver: { name: driver.display_name, pictureUrl: driver.picture_url },
    };
  };

  return {
    upsertLineUser({ lineUserId, displayName, pictureUrl }) {
      db.prepare(
        `INSERT INTO users (line_user_id, display_name, picture_url, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(line_user_id) DO UPDATE SET
           display_name = excluded.display_name, picture_url = excluded.picture_url`,
      ).run(lineUserId, displayName, pictureUrl ?? null, now());
      return db.prepare('SELECT * FROM users WHERE line_user_id = ?').get(lineUserId);
    },

    getUser,

    setContact(user, contact) {
      const value = typeof contact === 'string' ? contact.trim().slice(0, 60) : '';
      if (!value) throw new DomainError(400, 'invalid', '請填寫聯絡方式', ['contact']);
      db.prepare('UPDATE users SET contact = ? WHERE id = ?').run(value, user.id);
      return getUser(user.id);
    },

    createTrip(user, input) {
      requireContact(user);
      const spots = cleanList(input.spots, SPOTS.length, 20);
      const pickups = cleanList(input.pickups, 8, 40);
      const missing = [];
      if (!isDate(input.date)) missing.push('date');
      if (!isTime(input.time)) missing.push('time');
      if (!spots.length || !spots.every((spot) => SPOTS.includes(spot))) missing.push('spots');
      if (!pickups.length) missing.push('pickups');
      if (!Number.isInteger(input.seats) || input.seats < 1 || input.seats > 8) missing.push('seats');
      if (!Object.hasOwn(BOARD_RULES, input.boardRule ?? '')) missing.push('boardRule');
      if (!isFare(input.fareOneWay)) missing.push('fareOneWay');
      if (!isBlank(input.fareRoundTrip) && !isFare(input.fareRoundTrip)) missing.push('fareRoundTrip');
      if (!isBlank(input.returnTime) && !isTime(input.returnTime)) missing.push('returnTime');
      if (missing.length) {
        throw new DomainError(400, 'invalid', '請檢查必填欄位', missing);
      }
      const departTs = toTs(input.date, input.time);
      if (departTs <= now()) {
        throw new DomainError(400, 'invalid', '出發時間必須晚於現在', ['date', 'time']);
      }
      const note = typeof input.note === 'string' ? input.note.trim().slice(0, 300) : '';
      const meetingPoint =
        typeof input.meetingPoint === 'string' ? input.meetingPoint.trim().slice(0, 100) : '';
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO trips (driver_id, date, time, depart_ts, spots, pickups, seats, board_rule,
             fare_one_way, fare_round_trip, return_time, note, meeting_point, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          user.id,
          input.date,
          input.time,
          departTs,
          JSON.stringify(spots),
          JSON.stringify(pickups),
          input.seats,
          input.boardRule,
          input.fareOneWay,
          isBlank(input.fareRoundTrip) ? null : input.fareRoundTrip,
          isBlank(input.returnTime) ? null : input.returnTime,
          note || null,
          meetingPoint || null,
          now(),
        );
      return present(rawTrip(Number(lastInsertRowid)));
    },

    listTrips({ date, spot } = {}) {
      const clauses = [`status = 'open'`, 'depart_ts > ?'];
      const params = [now()];
      if (date) {
        clauses.push('date = ?');
        params.push(date);
      }
      if (spot) {
        clauses.push('EXISTS (SELECT 1 FROM json_each(trips.spots) WHERE value = ?)');
        params.push(spot);
      }
      return db
        .prepare(`SELECT * FROM trips WHERE ${clauses.join(' AND ')} ORDER BY depart_ts, id`)
        .all(...params)
        .map(present);
    },

    // viewer 決定能看到什麼：司機看申請清單，乘客看自己的申請
    getTrip(id, viewer) {
      const trip = rawTrip(id);
      const view = present(trip);
      if (!viewer) return view;
      const live = trip.status === 'open';
      if (viewer.id === trip.driver_id) {
        view.isDriver = true;
        view.meetingPoint = trip.meeting_point;
        view.requests = db
          .prepare(
            `SELECT r.id, r.pickup, r.board_type, r.status, u.display_name, u.picture_url, u.contact
             FROM requests r JOIN users u ON u.id = r.passenger_id
             WHERE r.trip_id = ? AND r.status != 'withdrawn' ORDER BY r.id`,
          )
          .all(id)
          .map((r) => ({
            id: r.id,
            pickup: r.pickup,
            boardType: r.board_type,
            status: r.status,
            passenger: { name: r.display_name, pictureUrl: r.picture_url },
            contact: live && r.status === 'accepted' ? r.contact : undefined,
          }));
        return view;
      }
      const mine = db
        .prepare(
          `SELECT * FROM requests WHERE trip_id = ? AND passenger_id = ?
           ORDER BY id DESC LIMIT 1`,
        )
        .get(id, viewer.id);
      if (mine && mine.status !== 'withdrawn') {
        view.myRequest = {
          id: mine.id,
          status: mine.status,
          pickup: mine.pickup,
          boardType: mine.board_type,
        };
        if (live && mine.status === 'accepted') {
          view.driverContact = getUser(trip.driver_id).contact;
          view.meetingPoint = trip.meeting_point;
        }
      }
      return view;
    },

    applyToTrip(user, tripId, input) {
      const trip = rawTrip(tripId);
      assertOpen(trip);
      requireContact(user);
      if (trip.driver_id === user.id) {
        throw new DomainError(409, 'own_trip', '不能申請自己的行程');
      }
      if (seatsTaken(trip.id) >= trip.seats) throw new DomainError(409, 'full', '座位已滿');
      const missing = [];
      if (!JSON.parse(trip.pickups).includes(input.pickup)) missing.push('pickup');
      if (!Object.hasOwn(BOARD_TYPES, input.boardType ?? '')) missing.push('boardType');
      if (missing.length) throw new DomainError(400, 'invalid', '請檢查必填欄位', missing);
      if (!BOARD_ALLOWED[trip.board_rule].includes(input.boardType)) {
        throw new DomainError(
          400,
          'board_not_allowed',
          `這趟行程${BOARD_RULES[trip.board_rule]}，不能帶${BOARD_TYPES[input.boardType]}`,
          ['boardType'],
        );
      }
      const exists = db
        .prepare(
          `SELECT 1 FROM requests WHERE trip_id = ? AND passenger_id = ? AND status != 'withdrawn'`,
        )
        .get(trip.id, user.id);
      if (exists) throw new DomainError(409, 'duplicate', '已申請過這個行程');
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO requests (trip_id, passenger_id, pickup, board_type, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(trip.id, user.id, input.pickup, input.boardType, now());
      return { request: rawRequest(Number(lastInsertRowid)), trip, driver: getUser(trip.driver_id) };
    },

    decide(user, requestId, decision) {
      const request = rawRequest(requestId);
      const trip = rawTrip(request.trip_id);
      if (trip.driver_id !== user.id) throw forbidden();
      assertOpen(trip);
      if (request.status !== 'pending') {
        throw new DomainError(409, 'not_pending', '這筆申請已處理過');
      }
      if (decision === 'accepted' && seatsTaken(trip.id) >= trip.seats) {
        throw new DomainError(409, 'full', '座位已滿');
      }
      db.prepare('UPDATE requests SET status = ? WHERE id = ?').run(decision, request.id);
      return { trip, passenger: getUser(request.passenger_id) };
    },

    withdraw(user, requestId) {
      const request = rawRequest(requestId);
      if (request.passenger_id !== user.id) throw forbidden();
      const trip = rawTrip(request.trip_id);
      assertOpen(trip);
      if (!['pending', 'accepted'].includes(request.status)) {
        throw new DomainError(409, 'not_active', '這筆申請無法退出');
      }
      db.prepare(`UPDATE requests SET status = 'withdrawn' WHERE id = ?`).run(request.id);
      return { trip, driver: getUser(trip.driver_id), wasAccepted: request.status === 'accepted' };
    },

    cancelTrip(user, tripId) {
      const trip = rawTrip(tripId);
      if (trip.driver_id !== user.id) throw forbidden();
      assertOpen(trip);
      db.prepare(`UPDATE trips SET status = 'cancelled' WHERE id = ?`).run(trip.id);
      const passengers = db
        .prepare(
          `SELECT u.* FROM requests r JOIN users u ON u.id = r.passenger_id
           WHERE r.trip_id = ? AND r.status IN ('pending', 'accepted')`,
        )
        .all(trip.id);
      return { trip, passengers };
    },

    // 發車表單預填：司機最近一次發布的行程（含已取消），日期刻意不帶
    tripTemplate(user) {
      const trip = db
        .prepare('SELECT * FROM trips WHERE driver_id = ? ORDER BY created_at DESC, id DESC LIMIT 1')
        .get(user.id);
      if (!trip) return null;
      return {
        time: trip.time,
        spots: JSON.parse(trip.spots),
        pickups: JSON.parse(trip.pickups),
        seats: trip.seats,
        boardRule: trip.board_rule,
        fareOneWay: trip.fare_one_way,
        fareRoundTrip: trip.fare_round_trip,
        returnTime: trip.return_time,
        note: trip.note,
        meetingPoint: trip.meeting_point,
      };
    },

    myActivity(user) {
      const trips = db
        .prepare('SELECT * FROM trips WHERE driver_id = ? ORDER BY depart_ts DESC LIMIT 50')
        .all(user.id)
        .map((trip) => ({
          ...present(trip),
          pending: db
            .prepare(`SELECT COUNT(*) AS n FROM requests WHERE trip_id = ? AND status = 'pending'`)
            .get(trip.id).n,
        }));
      const requests = db
        .prepare(
          `SELECT r.id, r.status, r.trip_id FROM requests r JOIN trips t ON t.id = r.trip_id
           WHERE r.passenger_id = ? AND r.status != 'withdrawn'
           ORDER BY t.depart_ts DESC LIMIT 50`,
        )
        .all(user.id)
        .map((r) => ({ id: r.id, status: r.status, trip: present(rawTrip(r.trip_id)) }));
      return { trips, requests };
    },

    // 成行：已過出發時間、未取消、至少一位已確認乘客。週一為一週起始（台灣時間）
    weeklyCompletedTrips() {
      const rows = db
        .prepare(
          `SELECT t.date FROM trips t
           WHERE t.status = 'open' AND t.depart_ts <= ?
             AND EXISTS (SELECT 1 FROM requests r WHERE r.trip_id = t.id AND r.status = 'accepted')`,
        )
        .all(now());
      const weeks = new Map();
      for (const { date } of rows) {
        const day = new Date(`${date}T00:00:00Z`);
        day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
        const weekStart = day.toISOString().slice(0, 10);
        weeks.set(weekStart, (weeks.get(weekStart) ?? 0) + 1);
      }
      return [...weeks]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekStart, trips]) => ({ weekStart, trips }));
    },
  };
}
