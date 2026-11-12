// 前端單頁程式。所有使用者內容都透過 textContent 寫入，不使用 innerHTML，避免 XSS。
const view = document.getElementById('view');
const nav = document.getElementById('nav');

const STATUS_LABEL = { pending: '待確認', accepted: '已接受', rejected: '已拒絕' };
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const FIELD_LABEL = {
  date: '日期',
  time: '出發時間',
  spots: '浪點',
  pickups: '上車點',
  seats: '座位數',
  boardRule: '載板條件',
  fareOneWay: '單程車資',
  fareRoundTrip: '來回車資',
  returnTime: '回程時間',
  pickup: '上車點',
  boardType: '浪板類型',
  contact: '聯絡方式',
};

let me = null;
let devLogin = false;
let config = null;

// replaceChildren 會把陣列和 null 印成文字，所以畫面一律經過這裡攤平
function mount(...children) {
  view.replaceChildren(...children.flat(Infinity).filter((child) => child !== null && child !== undefined));
}

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat().filter((child) => child !== null && child !== undefined));
  return node;
}

async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: method === 'GET' ? {} : { 'content-type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
  } catch {
    // fetch 只有在連不到伺服器時才會丟錯，瀏覽器給的是英文 "Failed to fetch"，換成使用者看得懂的話
    const error = new Error('網路連線失敗，請確認網路後再試一次');
    Object.assign(error, { code: 'network', fields: [] });
    throw error;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 登入過期：清掉前端的登入狀態，導覽列才不會繼續顯示「我的」
    if (data.error === 'login_required' && me) {
      me = null;
      renderNav();
    }
    const error = new Error(data.message ?? '系統錯誤，請稍後再試');
    Object.assign(error, { code: data.error, fields: data.fields ?? [] });
    throw error;
  }
  return data;
}

// 按鈕動作共用：執行期間停用按鈕防止連點；失敗時把錯誤顯示在 slot，不再靜默失敗
async function runAction(button, slot, fn) {
  if (button.disabled) return;
  button.disabled = true;
  slot.replaceChildren();
  try {
    await fn();
  } catch (error) {
    slot.replaceChildren(notice(errorText(error), 'error'));
  } finally {
    button.disabled = false;
  }
}

function go(path) {
  history.pushState(null, '', path);
  render();
}

function link(path, attrs, ...children) {
  return h('a', { href: path, 'data-link': true, ...attrs }, ...children);
}

function formatDate(date) {
  const [, month, day] = date.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return `${month}/${day}（${weekday}）`;
}

function loginHref() {
  return `/auth/line?next=${encodeURIComponent(location.pathname)}`;
}

function notice(text, kind = '') {
  return h('div', { class: `notice ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, text);
}

function errorText(error) {
  const names = (error.fields ?? []).map((field) => FIELD_LABEL[field] ?? field);
  return names.length ? `${error.message}：${[...new Set(names)].join('、')}` : error.message;
}

// 紅框之外也標 aria-invalid，螢幕閱讀器才會念出「無效」，不只靠顏色
function markFields(form, fields = []) {
  form.querySelectorAll('.field-error').forEach((node) => node.classList.remove('field-error'));
  form.querySelectorAll('[aria-invalid]').forEach((node) => node.removeAttribute('aria-invalid'));
  for (const field of fields) {
    const wrapper = form.querySelector(`[data-field="${field}"]`);
    if (!wrapper) continue;
    wrapper.classList.add('field-error');
    wrapper.querySelectorAll('input, select, textarea').forEach((node) => node.setAttribute('aria-invalid', 'true'));
  }
}

function renderNav() {
  nav.replaceChildren(
    link('/', {}, '找車'),
    link('/new', {}, '發車'),
    me ? link('/me', {}, '我的') : h('a', { href: loginHref() }, '登入'),
  );
}

function tripBadge(trip) {
  if (trip.status === 'cancelled') return h('span', { class: 'badge cancelled' }, '已取消');
  if (trip.departed) return h('span', { class: 'badge' }, '已出發');
  if (trip.full) return h('span', { class: 'badge full' }, '已滿');
  return h('span', { class: 'badge' }, `剩 ${trip.seatsLeft} 位`);
}

function tripCard(trip, extra) {
  return link(
    `/trips/${trip.id}`,
    { class: 'card' },
    h(
      'div',
      { class: 'card-head' },
      h('span', { class: 'when' }, `${formatDate(trip.date)} ${trip.time}`),
      tripBadge(trip),
    ),
    h('p', { class: 'meta' }, `${trip.spots.join('、')}｜單程 $${trip.fareOneWay}｜${config.boardRules[trip.boardRule]}`),
    h('p', { class: 'meta' }, `上車：${trip.pickups.join('、')}`),
    extra,
  );
}

// 台灣時間的明天。行程多在出發前一天發、清晨出發，所以首頁預設看明天（PR-FIND-05）
function tomorrowInTaiwan() {
  return new Date(Date.now() + 8 * 3600000 + 86400000).toISOString().slice(0, 10);
}

async function homePage() {
  const params = new URLSearchParams(location.search);
  const tomorrow = tomorrowInTaiwan();
  // 網址沒有 date 時預設明天；date=all 代表全部日期
  const initialDate = params.get('date') === 'all' ? '' : params.get('date') || tomorrow;
  const date = h('input', { type: 'date', value: initialDate, 'aria-label': '日期' });
  const dateToggle = h('button', { type: 'button', class: 'link-button' });
  const setDate = (value) => {
    date.value = value;
    load();
  };
  const spot = h(
    'select',
    { 'aria-label': '浪點' },
    h('option', { value: '' }, '全部浪點'),
    config.spots.map((name) => h('option', { value: name, selected: name === params.get('spot') }, name)),
  );
  const list = h('div', { 'aria-live': 'polite' });
  // 快速切換篩選時，較慢回來的舊結果不能蓋掉新結果：只採用最後一次請求
  let latest = 0;

  async function load() {
    const requestId = ++latest;
    const query = new URLSearchParams();
    if (date.value) query.set('date', date.value);
    if (spot.value) query.set('spot', spot.value);
    const apiSuffix = query.size ? `?${query}` : '';
    // 網址要記住「全部日期」，重新整理才不會跳回明天
    const pageQuery = new URLSearchParams(query);
    if (!date.value) pageQuery.set('date', 'all');
    history.replaceState(null, '', `/?${pageQuery}`);

    const isTomorrow = date.value === tomorrow;
    dateToggle.textContent = date.value ? '全部日期' : '只看明天';
    dateToggle.onclick = () => setDate(date.value ? '' : tomorrow);

    list.setAttribute('aria-busy', 'true');
    let trips;
    try {
      ({ trips } = await api(`/api/trips${apiSuffix}`));
    } catch (error) {
      if (requestId !== latest) return;
      list.removeAttribute('aria-busy');
      list.replaceChildren(
        h(
          'div',
          { class: 'empty' },
          notice(errorText(error), 'error'),
          h('button', { type: 'button', class: 'secondary', onclick: load }, '重新載入'),
        ),
      );
      return;
    }
    if (requestId !== latest) return;
    list.removeAttribute('aria-busy');
    let empty;
    if (isTomorrow) {
      empty = h(
        'div',
        { class: 'empty' },
        h('p', {}, '明天目前沒有行程'),
        h('button', { type: 'button', class: 'secondary', onclick: () => setDate('') }, '看全部日期'),
      );
    } else {
      empty = h('p', { class: 'empty' }, '目前沒有符合的行程，換個日期或浪點看看');
    }
    list.replaceChildren(...(trips.length ? trips.map((trip) => tripCard(trip)) : [empty]));
  }

  date.addEventListener('change', load);
  spot.addEventListener('change', load);
  const failed = params.get('login') === 'failed';
  mount(
    h('h1', {}, '台北到宜蘭的共乘行程'),
    failed ? notice('LINE 登入沒有完成，請再試一次', 'error') : null,
    h(
      'div',
      { class: 'filters' },
      h('label', {}, '日期', date),
      h('label', {}, '浪點', spot),
    ),
    h('div', { class: 'filter-actions' }, dateToggle),
    list,
  );
  await load();
}

function loginPrompt(message) {
  const children = [
    h('h1', {}, '請先登入'),
    h('p', {}, message),
    h('a', { class: 'button block line-button', href: loginHref() }, '使用 LINE 登入'),
  ];
  if (devLogin) {
    const name = h('input', { value: '測試司機', 'aria-label': '測試用名稱' });
    const slot = h('div');
    children.push(
      h('h2', {}, '開發用假登入'),
      name,
      h(
        'button',
        {
          class: 'secondary block spaced',
          onclick: (event) =>
            runAction(event.currentTarget, slot, async () => {
              await api('/auth/dev', { method: 'POST', body: { name: name.value } });
              await refreshMe();
              render();
            }),
        },
        '假登入',
      ),
      slot,
    );
  }
  mount(...children);
}

// onDone 有傳就交給呼叫端換頁；沒傳就留在原頁顯示「已儲存」
function contactForm(onDone) {
  const input = h('input', {
    value: me.contact ?? '',
    maxlength: 60,
    placeholder: 'LINE ID 或手機號碼',
    required: true,
  });
  const message = h('div');
  return h(
    'form',
    {
      onsubmit: async (event) => {
        event.preventDefault();
        const button = event.currentTarget.querySelector('button');
        if (button.disabled) return;
        button.disabled = true;
        try {
          const { user } = await api('/api/me', { method: 'PUT', body: { contact: input.value } });
          me = user;
          if (onDone) onDone();
          else message.replaceChildren(notice('已儲存聯絡方式'));
        } catch (error) {
          message.replaceChildren(notice(errorText(error), 'error'));
        } finally {
          button.disabled = false;
        }
      },
    },
    message,
    h(
      'label',
      {},
      '聯絡方式',
      input,
      h('span', { class: 'field-note' }, '只有在申請被接受後，才會顯示給同行程的司機或乘客'),
    ),
    h('button', { class: 'block' }, '儲存'),
  );
}

function newTripPage() {
  if (!me) return loginPrompt('登入後才能發行程。');
  if (!me.contact) {
    mount(h('h1', {}, '先填聯絡方式'), contactForm(render));
    return;
  }
  const message = h('div');
  const field = (name, label, control, note) =>
    h('label', { 'data-field': name }, label, control, note ? h('span', { class: 'field-note' }, note) : null);
  const form = h(
    'form',
    {
      novalidate: true,
      onsubmit: async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const number = (name) => (data.get(name) === '' ? null : Number(data.get(name)));
        const button = form.querySelector('button');
        button.disabled = true;
        try {
          const { trip } = await api('/api/trips', {
            method: 'POST',
            body: {
              date: data.get('date'),
              time: data.get('time'),
              spots: data.getAll('spots'),
              pickups: data.get('pickups').split(/[,，、\n]/),
              seats: number('seats'),
              boardRule: data.get('boardRule'),
              fareOneWay: number('fareOneWay'),
              fareRoundTrip: number('fareRoundTrip'),
              returnTime: data.get('returnTime'),
              note: data.get('note'),
            },
          });
          go(`/trips/${trip.id}`);
        } catch (error) {
          button.disabled = false;
          markFields(form, error.fields);
          message.replaceChildren(notice(errorText(error), 'error'));
          message.scrollIntoView({ block: 'center' });
        }
      },
    },
    message,
    field('date', '日期', h('input', { type: 'date', name: 'date' })),
    field('time', '出發時間', h('input', { type: 'time', name: 'time' })),
    h(
      'fieldset',
      { 'data-field': 'spots' },
      h('legend', {}, '浪點（可多選）'),
      h(
        'div',
        { class: 'checks' },
        config.spots.map((name) =>
          h('label', {}, h('input', { type: 'checkbox', name: 'spots', value: name }), name),
        ),
      ),
    ),
    field(
      'pickups',
      '上車點',
      h('input', { name: 'pickups', placeholder: '例如：板橋新埔站、後山埤站' }),
      '多個上車點請用頓號或逗號分開',
    ),
    field('seats', '座位數', h('input', { type: 'number', name: 'seats', min: 1, max: 8, inputmode: 'numeric' })),
    field(
      'boardRule',
      '載板條件',
      h(
        'select',
        { name: 'boardRule' },
        h('option', { value: '' }, '請選擇'),
        Object.entries(config.boardRules).map(([value, label]) => h('option', { value }, label)),
      ),
    ),
    field(
      'fareOneWay',
      '單程車資（元）',
      h('input', { type: 'number', name: 'fareOneWay', min: 0, inputmode: 'numeric' }),
      '車資僅限分攤油資與過路費，不得營利載客',
    ),
    field(
      'fareRoundTrip',
      '來回車資（元，選填）',
      h('input', { type: 'number', name: 'fareRoundTrip', min: 0, inputmode: 'numeric' }),
    ),
    field('returnTime', '回程時間（選填）', h('input', { type: 'time', name: 'returnTime' })),
    field('note', '備註（選填）', h('textarea', { name: 'note', rows: 3, maxlength: 300 })),
    h('button', { class: 'block' }, '發布行程'),
  );
  mount(h('h1', {}, '發行程'), form);
}

function detailRow(label, value) {
  return h('div', {}, h('dt', {}, label), h('dd', {}, value));
}

function requestCard(request) {
  const slot = h('div');
  // 錯誤留在卡片裡（原本用 alert 跳窗）。重新整理頁面就能看到最新狀態，例如行程已滿
  const act = (action) => (event) =>
    runAction(event.currentTarget, slot, async () => {
      await api(`/api/requests/${request.id}/${action}`, { method: 'POST' });
      render();
    });
  return h(
    'div',
    { class: 'card' },
    h(
      'div',
      { class: 'card-head' },
      h('strong', {}, request.passenger.name),
      h('span', { class: `badge ${request.status}` }, STATUS_LABEL[request.status]),
    ),
    h('p', { class: 'meta' }, `上車：${request.pickup}｜${config.boardTypes[request.boardType]}`),
    request.contact ? h('div', { class: 'contact' }, `聯絡方式：${request.contact}`) : null,
    slot,
    request.status === 'pending'
      ? h(
          'div',
          { class: 'actions' },
          h('button', { class: 'secondary', onclick: act('reject') }, '拒絕'),
          h('button', { onclick: act('accept') }, '接受'),
        )
      : null,
  );
}

function driverPanel(trip) {
  const active = trip.status === 'open' && !trip.departed;
  const slot = h('div');
  return [
    h('h2', {}, `申請（${trip.requests.length}）`),
    trip.requests.length
      ? trip.requests.map(requestCard)
      : h('p', { class: 'empty' }, '還沒有人申請，把連結分享到 FB 社團或 LINE 群吧'),
    slot,
    active
      ? h(
          'button',
          {
            class: 'danger block',
            onclick: (event) => {
              if (!confirm('確定要取消這個行程嗎？已申請的乘客會收到通知。')) return;
              return runAction(event.currentTarget, slot, async () => {
                await api(`/api/trips/${trip.id}/cancel`, { method: 'POST' });
                render();
              });
            },
          },
          '取消行程',
        )
      : null,
  ];
}

function applyForm(trip) {
  const message = h('div');
  const allowed = config.boardAllowed[trip.boardRule];
  const boardNote =
    trip.boardRule === 'any'
      ? null
      : h(
          'span',
          { class: 'field-note' },
          trip.boardRule === 'none'
            ? '這位司機不載板，只能選「不帶板」。想帶板請找其他行程。'
            : '這位司機僅載短板，不能帶長板。想帶長板請找其他行程。',
        );
  const form = h(
    'form',
    {
      novalidate: true,
      onsubmit: async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const button = form.querySelector('button');
        if (button.disabled) return;
        button.disabled = true;
        try {
          await api(`/api/trips/${trip.id}/requests`, {
            method: 'POST',
            body: { pickup: data.get('pickup'), boardType: data.get('boardType') },
          });
          render();
        } catch (error) {
          button.disabled = false;
          markFields(form, error.fields);
          message.replaceChildren(notice(errorText(error), 'error'));
        }
      },
    },
    message,
    h(
      'label',
      { 'data-field': 'pickup' },
      '上車點',
      h(
        'select',
        { name: 'pickup' },
        h('option', { value: '' }, '請選擇'),
        trip.pickups.map((name) => h('option', { value: name }, name)),
      ),
    ),
    h(
      'label',
      { 'data-field': 'boardType' },
      '浪板類型',
      h(
        'select',
        { name: 'boardType' },
        h('option', { value: '' }, '請選擇'),
        allowed.map((value) => h('option', { value }, config.boardTypes[value])),
      ),
      boardNote,
    ),
    h('button', { class: 'block' }, '申請共乘'),
  );
  return form;
}

function passengerPanel(trip) {
  if (trip.myRequest) {
    const { id, status, pickup, boardType } = trip.myRequest;
    const canWithdraw =
      trip.status === 'open' && !trip.departed && ['pending', 'accepted'].includes(status);
    const slot = h('div');
    return [
      h('h2', {}, '我的申請'),
      h(
        'div',
        { class: 'card' },
        h(
          'div',
          { class: 'card-head' },
          h('span', {}, `上車：${pickup}｜${config.boardTypes[boardType]}`),
          h('span', { class: `badge ${status}` }, STATUS_LABEL[status]),
        ),
        trip.driverContact ? h('div', { class: 'contact' }, `司機聯絡方式：${trip.driverContact}`) : null,
        slot,
        canWithdraw
          ? h(
              'div',
              { class: 'actions' },
              h(
                'button',
                {
                  class: 'danger',
                  onclick: (event) => {
                    if (!confirm('確定要退出這個行程嗎？')) return;
                    return runAction(event.currentTarget, slot, async () => {
                      await api(`/api/requests/${id}/withdraw`, { method: 'POST' });
                      render();
                    });
                  },
                },
                '退出行程',
              ),
            )
          : null,
      ),
    ];
  }
  if (trip.status !== 'open' || trip.departed) return [];
  if (trip.full) return [notice('這個行程已滿，無法申請')];
  if (!me) {
    return [h('a', { class: 'button block line-button', href: loginHref() }, '使用 LINE 登入後申請')];
  }
  if (!me.contact) {
    return [h('h2', {}, '申請前先填聯絡方式'), contactForm(render)];
  }
  return [h('h2', {}, '申請共乘'), applyForm(trip)];
}

async function tripPage(id) {
  const { trip } = await api(`/api/trips/${id}`);
  const shareSlot = h('div');
  const share = async () => {
    const url = location.href;
    shareSlot.replaceChildren();
    if (navigator.share) {
      // 使用者自己關掉分享面板也會丟錯，那不是失敗，所以吞掉
      await navigator.share({ title: '浪乘', url }).catch(() => {});
      return;
    }
    // 非 HTTPS（例如手機連電腦的區網 IP）沒有 clipboard，寫入也可能被瀏覽器拒絕
    try {
      await navigator.clipboard.writeText(url);
      shareButton.textContent = '已複製連結';
    } catch {
      shareSlot.replaceChildren(notice(`無法自動複製，請手動複製這個網址：${url}`, 'error'));
    }
  };
  const shareButton = h('button', { class: 'secondary block', onclick: share }, '分享行程');
  mount(
    h(
      'div',
      { class: 'card-head' },
      h('h1', {}, `${formatDate(trip.date)} ${trip.time}`),
      tripBadge(trip),
    ),
    h(
      'div',
      { class: 'card' },
      h(
        'dl',
        { class: 'detail' },
        detailRow('司機', trip.driver.name),
        detailRow('浪點', trip.spots.join('、')),
        detailRow('上車點', trip.pickups.join('、')),
        detailRow('座位', `共 ${trip.seats} 位，剩 ${trip.seatsLeft} 位`),
        detailRow('載板', config.boardRules[trip.boardRule]),
        detailRow(
          '車資',
          `單程 $${trip.fareOneWay}${trip.fareRoundTrip === null ? '' : `／來回 $${trip.fareRoundTrip}`}`,
        ),
        trip.returnTime ? detailRow('回程', trip.returnTime) : null,
        trip.note ? detailRow('備註', trip.note) : null,
      ),
    ),
    shareButton,
    shareSlot,
    ...(trip.isDriver ? driverPanel(trip) : passengerPanel(trip)),
  );
}

async function mePage() {
  if (!me) return loginPrompt('登入後才能查看你的行程與申請。');
  const { trips, requests } = await api('/api/my');
  const logoutSlot = h('div');
  mount(
    h('h1', {}, `${me.name} 的共乘`),
    h('h2', {}, '我的申請'),
    requests.length
      ? requests.map((request) =>
          tripCard(
            request.trip,
            h('p', { class: 'meta' }, `申請狀態：${STATUS_LABEL[request.status]}`),
          ),
        )
      : h('p', { class: 'empty' }, '還沒有申請過行程'),
    h('h2', {}, '我發的行程'),
    trips.length
      ? trips.map((trip) =>
          tripCard(trip, trip.pending ? h('p', { class: 'meta' }, `${trip.pending} 筆申請待確認`) : null),
        )
      : h('p', { class: 'empty' }, '還沒有發過行程'),
    link('/new', { class: 'button block' }, '＋ 發一趟新行程'),
    h('h2', {}, '聯絡方式'),
    contactForm(),
    h(
      'button',
      {
        class: 'secondary block spaced',
        onclick: (event) =>
          runAction(event.currentTarget, logoutSlot, async () => {
            await api('/api/logout', { method: 'POST' });
            me = null;
            go('/');
          }),
      },
      '登出',
    ),
    logoutSlot,
  );
}

async function refreshMe() {
  const data = await api('/api/me');
  me = data.user;
  devLogin = data.devLogin;
}

async function render() {
  renderNav();
  const path = location.pathname;
  const tripMatch = path.match(/^\/trips\/(\d+)$/);
  try {
    if (tripMatch) await tripPage(tripMatch[1]);
    else if (path === '/new') newTripPage();
    else if (path === '/me') await mePage();
    else await homePage();
  } catch (error) {
    mount(notice(error.message, 'error'), link('/', {}, '回到首頁'));
  }
}

document.addEventListener('click', (event) => {
  const anchor = event.target.closest('a[data-link]');
  if (!anchor || event.metaKey || event.ctrlKey) return;
  event.preventDefault();
  go(anchor.getAttribute('href'));
  window.scrollTo(0, 0);
});
window.addEventListener('popstate', render);

// 啟動失敗（多半是離線）時給一個重試按鈕，不要留一片空白
async function boot() {
  try {
    config = await api('/api/config');
    await refreshMe();
  } catch (error) {
    mount(
      notice(errorText(error), 'error'),
      h('button', { type: 'button', class: 'block', onclick: boot }, '重新載入'),
    );
    return;
  }
  await render();
}

await boot();
