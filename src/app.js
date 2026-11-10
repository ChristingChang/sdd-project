import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createService, BOARD_RULES, BOARD_TYPES, DomainError, SPOTS } from './service.js';

const SESSION_DAYS = 30;
const MAX_BODY = 16 * 1024;
const PUBLIC_DIR = new URL('../public/', import.meta.url);
const ASSETS = {
  '/app.js': 'text/javascript; charset=utf-8',
  '/style.css': 'text/css; charset=utf-8',
};
const PAGES = [/^\/$/, /^\/new$/, /^\/me$/, /^\/trips\/\d+$/];
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'content-security-policy':
    "default-src 'self'; img-src 'self' https://profile.line-scdn.net; frame-ancestors 'none'",
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

// 只接受站內路徑，避免登入後被導向外部網站
export function safeNext(value) {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/';
}

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return cookies;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    // 要求 JSON 也是 CSRF 防線之一：跨站表單送不出這個 content-type
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
      req.resume();
      reject(new DomainError(415, 'json_required', '請以 JSON 傳送'));
      return;
    }
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      if (size > MAX_BODY) {
        reject(new DomainError(413, 'too_large', '資料過大'));
        return;
      }
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error();
        resolve(body);
      } catch {
        reject(new DomainError(400, 'bad_json', 'JSON 格式錯誤'));
      }
    });
  });
}

export function createApp({ db, line, baseUrl, devLogin = false, now = () => Date.now() }) {
  const service = createService(db, { now });
  const secure = baseUrl.startsWith('https://');
  const cookieFlags = `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  const tripUrl = (trip) => `${baseUrl}/trips/${trip.id}`;
  const tripLabel = (trip) => `${trip.date} ${trip.time}`;

  // 推播失敗不能讓使用者的操作失敗，資料已經寫入了
  const notify = async (user, text) => {
    try {
      await line.push(user.line_user_id, text);
    } catch (error) {
      console.error('推播失敗', error.message);
    }
  };

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      ...SECURITY_HEADERS,
      ...headers,
    });
    res.end(JSON.stringify(body));
  };

  const redirect = (res, location, cookies = []) => {
    res.writeHead(302, { location, 'set-cookie': cookies, ...SECURITY_HEADERS });
    res.end();
  };

  const startSession = (userId) => {
    const token = randomBytes(32).toString('hex');
    const maxAge = SESSION_DAYS * 86400;
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
      sha256(token),
      userId,
      now() + maxAge * 1000,
    );
    return `sid=${token}; ${cookieFlags}; Max-Age=${maxAge}`;
  };

  const currentUser = (req) => {
    const token = parseCookies(req.headers.cookie).sid;
    if (!token) return null;
    const session = db
      .prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?')
      .get(sha256(token), now());
    return session ? service.getUser(session.user_id) : null;
  };

  const requireUser = (user) => {
    if (!user) throw new DomainError(401, 'login_required', '請先登入');
    return user;
  };

  const publicUser = (user) =>
    user && {
      id: user.id,
      name: user.display_name,
      pictureUrl: user.picture_url,
      contact: user.contact,
    };

  async function api(req, res, url, user) {
    const { method } = req;
    const path = url.pathname;
    let match;

    if (method === 'GET' && path === '/api/config') {
      return send(res, 200, { spots: SPOTS, boardRules: BOARD_RULES, boardTypes: BOARD_TYPES });
    }
    if (method === 'GET' && path === '/api/me') {
      return send(res, 200, { user: publicUser(user), devLogin });
    }
    if (method === 'PUT' && path === '/api/me') {
      const body = await readJson(req);
      const updated = service.setContact(requireUser(user), body.contact);
      return send(res, 200, { user: publicUser(updated) });
    }
    if (method === 'POST' && path === '/api/logout') {
      await readJson(req);
      const token = parseCookies(req.headers.cookie).sid;
      if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
      return send(res, 200, {}, { 'set-cookie': `sid=; ${cookieFlags}; Max-Age=0` });
    }
    if (method === 'GET' && path === '/api/my') {
      return send(res, 200, service.myActivity(requireUser(user)));
    }
    if (method === 'GET' && path === '/api/trips') {
      const filter = { date: url.searchParams.get('date'), spot: url.searchParams.get('spot') };
      return send(res, 200, { trips: service.listTrips(filter) });
    }
    if (method === 'POST' && path === '/api/trips') {
      const body = await readJson(req);
      return send(res, 201, { trip: service.createTrip(requireUser(user), body) });
    }
    if (method === 'GET' && (match = path.match(/^\/api\/trips\/(\d+)$/))) {
      return send(res, 200, { trip: service.getTrip(Number(match[1]), user) });
    }
    if (method === 'POST' && (match = path.match(/^\/api\/trips\/(\d+)\/cancel$/))) {
      await readJson(req);
      const { trip, passengers } = service.cancelTrip(requireUser(user), Number(match[1]));
      await Promise.all(
        passengers.map((p) =>
          notify(p, `你申請的 ${tripLabel(trip)} 行程已被司機取消\n${tripUrl(trip)}`),
        ),
      );
      return send(res, 200, {});
    }
    if (method === 'POST' && (match = path.match(/^\/api\/trips\/(\d+)\/requests$/))) {
      const body = await readJson(req);
      const { request, trip, driver } = service.applyToTrip(
        requireUser(user),
        Number(match[1]),
        body,
      );
      await notify(
        driver,
        `${user.display_name} 申請了你 ${tripLabel(trip)} 的行程\n${tripUrl(trip)}`,
      );
      return send(res, 201, { requestId: request.id });
    }
    if (method === 'POST' && (match = path.match(/^\/api\/requests\/(\d+)\/(accept|reject)$/))) {
      await readJson(req);
      const accepted = match[2] === 'accept';
      const { trip, passenger } = service.decide(
        requireUser(user),
        Number(match[1]),
        accepted ? 'accepted' : 'rejected',
      );
      const result = accepted ? '已被接受，可以查看司機聯絡方式' : '未被接受';
      await notify(passenger, `你申請的 ${tripLabel(trip)} 行程${result}\n${tripUrl(trip)}`);
      return send(res, 200, {});
    }
    if (method === 'POST' && (match = path.match(/^\/api\/requests\/(\d+)\/withdraw$/))) {
      await readJson(req);
      const { trip, driver, wasAccepted } = service.withdraw(requireUser(user), Number(match[1]));
      if (wasAccepted) {
        await notify(
          driver,
          `${user.display_name} 退出了你 ${tripLabel(trip)} 的行程，座位已釋出\n${tripUrl(trip)}`,
        );
      }
      return send(res, 200, {});
    }
    throw new DomainError(404, 'not_found', '找不到資料');
  }

  async function auth(req, res, url) {
    const path = url.pathname;
    if (req.method === 'GET' && path === '/auth/line') {
      if (!line.loginEnabled) {
        throw new DomainError(503, 'login_unavailable', '尚未設定 LINE 登入');
      }
      const state = randomBytes(16).toString('hex');
      const next = encodeURIComponent(safeNext(url.searchParams.get('next')));
      return redirect(res, line.authorizeUrl(state), [
        `oauth=${state}.${next}; ${cookieFlags}; Max-Age=600`,
      ]);
    }
    if (req.method === 'GET' && path === '/auth/line/callback') {
      const [expected, next] = (parseCookies(req.headers.cookie).oauth ?? '').split('.');
      const state = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      const clearState = `oauth=; ${cookieFlags}; Max-Age=0`;
      // 使用者在 LINE 按取消時不會有 code，同樣視為登入失敗
      if (!expected || state !== expected || !code) {
        return redirect(res, '/?login=failed', [clearState]);
      }
      let profile;
      try {
        profile = await line.exchangeCode(code);
      } catch (error) {
        console.error('LINE 登入失敗', error.message);
        return redirect(res, '/?login=failed', [clearState]);
      }
      const user = service.upsertLineUser(profile);
      return redirect(res, safeNext(decodeURIComponent(next ?? '')), [
        clearState,
        startSession(user.id),
      ]);
    }
    if (devLogin && req.method === 'POST' && path === '/auth/dev') {
      const body = await readJson(req);
      const name =
        typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 30) : '測試用戶';
      const user = service.upsertLineUser({ lineUserId: `dev:${name}`, displayName: name });
      return send(res, 200, { user: publicUser(user) }, { 'set-cookie': startSession(user.id) });
    }
    throw new DomainError(404, 'not_found', '找不到資料');
  }

  function serveStatic(req, res, path) {
    if (req.method !== 'GET') throw new DomainError(404, 'not_found', '找不到資料');
    if (path === '/favicon.ico') {
      res.writeHead(204, SECURITY_HEADERS);
      res.end();
      return;
    }
    const isAsset = Object.hasOwn(ASSETS, path);
    if (!isAsset && !PAGES.some((page) => page.test(path))) {
      throw new DomainError(404, 'not_found', '找不到頁面');
    }
    const file = isAsset ? path.slice(1) : 'index.html';
    res.writeHead(200, {
      'content-type': isAsset ? ASSETS[path] : 'text/html; charset=utf-8',
      ...SECURITY_HEADERS,
    });
    res.end(readFileSync(new URL(file, PUBLIC_DIR)));
  }

  const handler = async (req, res) => {
    try {
      const url = new URL(req.url, baseUrl);
      if (url.pathname.startsWith('/api/')) await api(req, res, url, currentUser(req));
      else if (url.pathname.startsWith('/auth/')) await auth(req, res, url);
      else serveStatic(req, res, url.pathname);
    } catch (error) {
      if (error instanceof DomainError) {
        send(res, error.status, { error: error.code, message: error.message, fields: error.fields });
        return;
      }
      console.error(error);
      if (!res.headersSent) {
        send(res, 500, { error: 'server_error', message: '系統錯誤，請稍後再試' });
      } else {
        res.end();
      }
    }
  };

  return { handler, service };
}
