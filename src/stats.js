// 用法：npm run stats，列出每週成行趟數（PR-METRIC-01）
import { openDb } from './db.js';
import { createService } from './service.js';

try {
  process.loadEnvFile();
} catch {
  // 沒有 .env 時使用預設路徑
}

const service = createService(openDb(process.env.DB_PATH ?? 'data/carpool.db'));
const rows = service.weeklyCompletedTrips();
if (!rows.length) console.log('目前沒有成行紀錄');
for (const { weekStart, trips } of rows) console.log(`${weekStart} 當週：${trips} 趟`);
