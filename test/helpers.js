import { createServer } from 'node:http';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';

// 固定時鐘：2026-11-06 12:00（台灣時間）
export const NOW = Date.parse('2026-11-06T12:00:00+08:00');

export const validTrip = (overrides = {}) => ({
  date: '2026-11-08',
  time: '05:00',
  spots: ['北堤'],
  pickups: ['板橋新埔站', '後山埤站'],
  seats: 2,
  boardRule: 'short',
  fareOneWay: 150,
  ...overrides,
});

// 透過真實 HTTP 測試：這是專案的接縫，測試不碰內部函式
export async function startApp(t, { line: lineOverrides = {}, devLogin = true } = {}) {
  const clock = { now: NOW };
  const pushes = [];
  const line = {
    loginEnabled: true,
    authorizeUrl: (state) => `https://line.test/authorize?state=${state}`,
    exchangeCode: async () => ({ lineUserId: 'U1', displayName: '小海' }),
    push: async (lineUserId, text) => pushes.push({ lineUserId, text }),
    ...lineOverrides,
  };
  const db = openDb();
  const app = createApp({
    db,
    line,
    baseUrl: 'http://test.local',
    devLogin,
    now: () => clock.now,
  });
  const server = createServer(app.handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.close();
    db.close();
  });
  const origin = `http://127.0.0.1:${server.address().port}`;

  const client = () => {
    let cookie = '';
    const call = async (method, path, body) => {
      const res = await fetch(origin + path, {
        method,
        redirect: 'manual',
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
        },
        body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      });
      const setCookies = res.headers.getSetCookie();
      if (setCookies.length) {
        const jar = new Map(cookie ? cookie.split('; ').map((c) => c.split(/=(.*)/s).slice(0, 2)) : []);
        for (const line of setCookies) {
          const [name, value] = line.split(';')[0].split(/=(.*)/s);
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
        cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      }
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
      return { status: res.status, body: json, text, headers: res.headers };
    };
    return {
      get: (path) => call('GET', path),
      post: (path, body) => call('POST', path, body),
      put: (path, body) => call('PUT', path, body),
    };
  };

  // 建立已登入、已填聯絡方式的用戶
  const user = async (name, contact = `line-${name}`) => {
    const c = client();
    await c.post('/auth/dev', { name });
    if (contact) await c.put('/api/me', { contact });
    return c;
  };

  return { clock, pushes, client, user, origin };
}
