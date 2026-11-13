import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  line_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  picture_url TEXT,
  contact TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY,
  driver_id INTEGER NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  depart_ts INTEGER NOT NULL,
  spots TEXT NOT NULL,
  pickups TEXT NOT NULL,
  seats INTEGER NOT NULL,
  board_rule TEXT NOT NULL,
  fare_one_way INTEGER NOT NULL,
  fare_round_trip INTEGER,
  return_time TEXT,
  note TEXT,
  meeting_point TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS trips_depart ON trips(status, depart_ts);
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  passenger_id INTEGER NOT NULL REFERENCES users(id),
  pickup TEXT NOT NULL,
  board_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);
-- 退出後可以重新申請，其餘狀態同一人同一行程只能有一筆
CREATE UNIQUE INDEX IF NOT EXISTS requests_once
  ON requests(trip_id, passenger_id) WHERE status != 'withdrawn';
`;

export function openDb(path = ':memory:') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

// 舊資料庫補欄位：CREATE TABLE IF NOT EXISTS 不會幫既有的表加新欄位
function migrate(db) {
  const columns = db.prepare('PRAGMA table_info(trips)').all().map((c) => c.name);
  if (!columns.includes('meeting_point')) db.exec('ALTER TABLE trips ADD COLUMN meeting_point TEXT');
}
