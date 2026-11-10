import { createServer } from 'node:http';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { createLineClient } from './line.js';

try {
  process.loadEnvFile();
} catch {
  // 沒有 .env 時直接使用環境變數（正式環境通常如此）
}

const { env } = process;
const port = Number(env.PORT ?? 3000);
const baseUrl = env.BASE_URL ?? `http://localhost:${port}`;
const devLogin = env.DEV_LOGIN === '1';

if (devLogin && (env.NODE_ENV === 'production' || baseUrl.startsWith('https://'))) {
  // 假登入等於任何人都能冒充任何人，寧可起不來
  console.error('DEV_LOGIN 不可用於正式環境');
  process.exit(1);
}

const line = createLineClient({
  channelId: env.LINE_LOGIN_CHANNEL_ID,
  channelSecret: env.LINE_LOGIN_CHANNEL_SECRET,
  messagingToken: env.LINE_MESSAGING_ACCESS_TOKEN,
  baseUrl,
});
const db = openDb(env.DB_PATH ?? 'data/carpool.db');
const { handler } = createApp({ db, line, baseUrl, devLogin });

const server = createServer(handler);
server.on('error', (error) => {
  if (error.code !== 'EADDRINUSE') throw error;
  console.error(`埠 ${port} 已被其他程式佔用。請關掉那個程式，或在 .env 把 PORT 和 BASE_URL 改成別的埠`);
  process.exit(1);
});
server.listen(port, () => {
  console.log(`衝浪共乘平台：${baseUrl}`);
  if (devLogin) console.log('已開啟開發用假登入');
});
