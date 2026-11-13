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
// 重新整理畫面後要顯示在頁首的一次性訊息（例如「行程已滿」），下一次 mount 時取用並清掉
let flash = null;

// replaceChildren 會把陣列和 null 印成文字，所以畫面一律經過這裡攤平
function mount(...children) {
  const top = flash ? notice(flash, 'error') : null;
  flash = null;
  view.replaceChildren(...[top, children].flat(Infinity).filter((child) => child !== null && child !== undefined));
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
    // 登入過期：清掉前端的登入狀態並重畫目前頁面，畫面會換成登入按鈕（PR-REQ-02），不是停在一則錯誤
    if (data.error === 'login_required' && me) {
      me = null;
      flash = '登入已過期，請重新登入';
      render();
    }
    const error = new Error(data.message ?? '系統錯誤，請稍後再試');
    Object.assign(error, { code: data.error, fields: data.fields ?? [] });
    throw error;
  }
  return data;
}

// 按鈕動作共用：執行期間停用按鈕防止連點；失敗時顯示原因，不再靜默失敗。
// fn 裡的 render() 要 await，否則按鈕會在新畫面出來前就恢復可按。
// refreshOnReject：伺服器拒絕（例如行程已滿、已取消）代表畫面狀態過時，先重新整理再把原因放在頁首；
// 網路錯誤不重新整理，因為重抓也會失敗，原因留在按鈕旁
async function runAction(button, slot, fn, { refreshOnReject = false } = {}) {
  if (button.disabled) return;
  button.disabled = true;
  slot.replaceChildren();
  try {
    await fn();
  } catch (error) {
    if (error.code === 'login_required') return; // api() 已經重畫成登入畫面
    if (refreshOnReject && error.code !== 'network') {
      flash = errorText(error);
      await render();
      return;
    }
    slot.replaceChildren(notice(errorText(error), 'error'));
  } finally {
    button.disabled = false;
  }
}

// 有沒有在站內換過頁：行程頁的「返回」據此決定回上一頁，還是回首頁（從分享連結直接進來時）
let navigatedInApp = false;

function go(path) {
  navigatedInApp = true;
  history.pushState(null, '', path);
  render();
}

// 線條圖示：同一個 24×24 格、2px 筆畫，用 currentColor 跟著文字顏色走。純裝飾，螢幕閱讀器略過
const ICONS = {
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM20 20l-4-4',
  plus: 'M12 5v14M5 12h14',
  user: 'M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  calendar: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5',
};

function icon(name, className = 'icon') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const attrs = {
    class: className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  };
  for (const [key, value] of Object.entries(attrs)) svg.setAttribute(key, value);
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
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

// 底部分頁列：手機上拇指搆得到。目前所在頁標 aria-current；行程詳細頁不屬於任何一項
function renderNav() {
  const current = (path) => (location.pathname === path ? 'page' : null);
  nav.replaceChildren(
    link('/', { class: 'tab', 'aria-current': current('/') }, icon('search'), h('span', {}, '找車')),
    link(
      '/new',
      { class: 'tab tab-post', 'aria-current': current('/new') },
      h('span', { class: 'tab-post-mark' }, icon('plus')),
      h('span', {}, '發車'),
    ),
    me
      ? link('/me', { class: 'tab', 'aria-current': current('/me') }, icon('user'), h('span', {}, '我的'))
      : h('a', { class: 'tab', href: loginHref() }, icon('user'), h('span', {}, '登入')),
  );
}

function tripBadge(trip) {
  if (trip.status === 'cancelled') return h('span', { class: 'badge cancelled' }, '已取消');
  if (trip.departed) return h('span', { class: 'badge' }, '已出發');
  if (trip.full) return h('span', { class: 'badge full' }, '已滿');
  return h('span', { class: 'badge seats' }, `剩 ${trip.seatsLeft} 位`);
}

// 列表左欄的浪點方塊。多個浪點時顯示第一個，加上「+N」；完整浪點寫在列的內文，所以這裡對螢幕閱讀器隱藏
function spotTile(spots, className = 'spot-tile') {
  return h(
    'span',
    { class: className, 'aria-hidden': 'true' },
    h('span', {}, spots[0]),
    spots.length > 1 ? h('small', {}, `+${spots.length - 1}`) : null,
  );
}

// 一趟行程的列：浪點方塊｜時間、浪點與車資、上車點｜座位與箭頭。
// 首頁選了某一天時只顯示時間（日期已經在日期列上），其他地方連日期一起顯示
function tripRow(trip, extra, { showDate = true } = {}) {
  return link(
    `/trips/${trip.id}`,
    { class: 'row' },
    spotTile(trip.spots),
    h(
      'span',
      { class: 'row-body' },
      h('span', { class: 'row-title' }, showDate ? `${formatDate(trip.date)} ${trip.time}` : `${trip.time} 出發`),
      h('span', { class: 'row-meta' }, `${trip.spots.join('、')}・單程 $${trip.fareOneWay}・${config.boardRules[trip.boardRule]}`),
      h('span', { class: 'row-meta' }, icon('pin', 'icon icon-sm'), trip.pickups.join('、')),
      extra,
    ),
    h('span', { class: 'row-end' }, tripBadge(trip), icon('chevron', 'icon chevron')),
  );
}

// 台灣時間的今天加 offset 天，格式 YYYY-MM-DD
function taiwanDate(offsetDays = 0) {
  return new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10);
}

// 日期列上的短名：今天、明天，其他用星期
function dayName(date) {
  if (date === taiwanDate(0)) return '今天';
  if (date === taiwanDate(1)) return '明天';
  return `週${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]}`;
}

// 首頁：日期列（日曆、今天起 7 天、全部）＋行程列表。
// 一次抓這個浪點所有未出發的行程，在前端算每天幾趟、切換日期，不必每點一天就重抓。
// PR-FIND-05：預設明天；「全部」一鍵切換；明天沒車時提示並提供切換
async function homePage() {
  const params = new URLSearchParams(location.search);
  const today = taiwanDate(0);
  const tomorrow = taiwanDate(1);
  const week = Array.from({ length: 7 }, (_, i) => taiwanDate(i));
  // 網址沒有 date 時預設明天；date=all 代表全部日期（以空字串表示）
  let selected = params.get('date') === 'all' ? '' : params.get('date') || tomorrow;
  let trips = null;
  let scrolled = false;

  const spot = h(
    'select',
    { class: 'compact-select', 'aria-label': '浪點' },
    h('option', { value: '' }, '全部浪點'),
    config.spots.map((name) => h('option', { value: name, selected: name === params.get('spot') }, name)),
  );
  const strip = h('div', { class: 'dates', role: 'group', 'aria-label': '選擇日期' });
  const summary = h('p', { class: 'list-summary', 'aria-live': 'polite' });
  const list = h('div', { class: 'rows' });
  // 快速切換浪點時，較慢回來的舊結果不能蓋掉新結果：只採用最後一次請求
  let latest = 0;

  // 網址要記住目前的日期與浪點，重新整理或分享才不會跳回明天
  function syncUrl() {
    const query = new URLSearchParams();
    query.set('date', selected || 'all');
    if (spot.value) query.set('spot', spot.value);
    history.replaceState(null, '', `/?${query}`);
  }

  function choose(date) {
    selected = date;
    syncUrl();
    draw();
  }

  function countBadge(count) {
    return count ? h('span', { class: 'chip-count', 'aria-hidden': 'true' }, String(count)) : null;
  }

  function dayChip(date, counts) {
    const day = Number(date.slice(8));
    const count = counts.get(date) ?? 0;
    return h(
      'button',
      {
        type: 'button',
        class: 'chip',
        'aria-pressed': String(selected === date),
        'aria-label': `${dayName(date)} ${formatDate(date)}，${count} 趟`,
        onclick: () => choose(date),
      },
      h('span', { class: 'chip-top' }, dayName(date)),
      h('span', { class: 'chip-main' }, String(day)),
      countBadge(count),
    );
  }

  // 七天以外的日期（放在日期列最後）：日曆鈕裡疊一個透明的原生日期框，手機上點了直接開系統的日期選擇器
  function calendarChip(counts) {
    const custom = selected && !week.includes(selected);
    const input = h('input', {
      type: 'date',
      class: 'chip-input',
      min: today,
      value: custom ? selected : '',
      'aria-label': custom ? `其他日期，目前選 ${formatDate(selected)}` : '選其他日期',
    });
    input.addEventListener('change', () => input.value && choose(input.value));
    return h(
      'label',
      { class: `chip chip-cal${custom ? ' is-on' : ''}` },
      custom
        ? [h('span', { class: 'chip-top' }, dayName(selected)), h('span', { class: 'chip-main' }, String(Number(selected.slice(8))))]
        : icon('calendar'),
      input,
      custom ? countBadge(counts.get(selected) ?? 0) : null,
    );
  }

  function drawStrip() {
    const counts = new Map();
    for (const trip of trips ?? []) counts.set(trip.date, (counts.get(trip.date) ?? 0) + 1);
    const total = trips?.length ?? 0;
    // 「全部」放第一顆：手機上日期列要橫向捲動，放最後會被藏在畫面外（PR-FIND-05 要一鍵可及）
    strip.replaceChildren(
      h(
        'button',
        {
          type: 'button',
          class: 'chip chip-all',
          'aria-pressed': String(selected === ''),
          'aria-label': `全部日期，${total} 趟`,
          onclick: () => choose(''),
        },
        h('span', { class: 'chip-main' }, '全部'),
        countBadge(total),
      ),
      ...week.map((date) => dayChip(date, counts)),
      calendarChip(counts),
    );
    // 第一次畫出來時，把選中的那天捲到看得見的地方（例如網址帶了週日）
    if (!scrolled && trips) {
      scrolled = true;
      strip.querySelector('[aria-pressed="true"], .is-on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  }

  function drawList() {
    const shown = selected ? trips.filter((trip) => trip.date === selected) : trips;
    summary.textContent = `${selected ? `${dayName(selected)} ${formatDate(selected)}` : '全部日期'}・${shown.length} 趟`;
    if (shown.length) {
      list.replaceChildren(...shown.map((trip) => tripRow(trip, null, { showDate: !selected })));
    } else if (selected === tomorrow) {
      list.replaceChildren(
        h(
          'div',
          { class: 'empty' },
          h('p', {}, '明天目前沒有行程'),
          h('button', { type: 'button', class: 'secondary', onclick: () => choose('') }, '看全部日期'),
        ),
      );
    } else {
      list.replaceChildren(h('p', { class: 'empty' }, '目前沒有符合的行程，換個日期或浪點看看'));
    }
  }

  function draw() {
    drawStrip();
    if (trips) drawList();
  }

  async function load() {
    const seq = ++latest;
    syncUrl();
    list.setAttribute('aria-busy', 'true');
    // 第一次載入還沒有任何資料：給一句提示，慢網路時才不會看到一片空白
    if (trips === null) {
      summary.textContent = '';
      list.replaceChildren(h('p', { class: 'empty' }, '找車中…'));
    }
    let result;
    try {
      result = await api(`/api/trips${spot.value ? `?${new URLSearchParams({ spot: spot.value })}` : ''}`);
    } catch (error) {
      if (seq !== latest) return;
      list.removeAttribute('aria-busy');
      summary.textContent = '';
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
    if (seq !== latest) return;
    list.removeAttribute('aria-busy');
    trips = result.trips;
    draw();
  }

  spot.addEventListener('change', load);
  const failed = params.get('login') === 'failed';
  draw();
  mount(
    h('h1', {}, '台北到宜蘭的共乘行程'),
    failed ? notice('LINE 登入沒有完成，請再試一次', 'error') : null,
    strip,
    h('div', { class: 'list-head' }, summary, spot),
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
              await render();
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

// 白底分組容器，標題在外。表單、帳號設定共用
function group(title, ...children) {
  return h('section', { class: 'group' }, h('h2', {}, title), h('div', { class: 'group-body' }, ...children));
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
    group(
      '什麼時候',
      h(
        'div',
        { class: 'pair' },
        field('date', '日期', h('input', { type: 'date', name: 'date' })),
        field('time', '出發時間', h('input', { type: 'time', name: 'time' })),
      ),
      field('returnTime', '回程時間（選填）', h('input', { type: 'time', name: 'returnTime' })),
    ),
    group(
      '去哪裡',
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
    ),
    group(
      '座位與車資',
      h(
        'div',
        { class: 'pair' },
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
    ),
    group('補充', field('note', '備註（選填）', h('textarea', { name: 'note', rows: 3, maxlength: 300 }))),
    h('button', { class: 'block' }, '發布行程'),
  );
  mount(h('h1', {}, '發行程'), form);
}

function detailRow(label, value) {
  return h('div', {}, h('dt', {}, label), h('dd', {}, value));
}

function requestCard(request) {
  const slot = h('div');
  // 原本用 alert 跳窗。網路錯誤留在卡片裡；伺服器拒絕（例如行程已滿）則重新整理並在頁首說明原因
  const act = (action) => (event) =>
    runAction(event.currentTarget, slot, async () => {
      await api(`/api/requests/${request.id}/${action}`, { method: 'POST' });
      await render();
    }, { refreshOnReject: true });
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
                await render();
              }, { refreshOnReject: true });
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
                      await render();
                    }, { refreshOnReject: true });
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
      try {
        await navigator.share({ title: '浪乘', url });
        return;
      } catch (error) {
        // 使用者自己關掉分享面板（AbortError）不是失敗；其他錯誤改走下面的複製連結
        if (error.name === 'AbortError') return;
      }
    }
    // 非 HTTPS（例如手機連電腦的區網 IP）沒有 clipboard，寫入也可能被瀏覽器拒絕
    try {
      await navigator.clipboard.writeText(url);
      shareButton.textContent = '已複製連結';
    } catch {
      // 這是操作說明不是錯誤，用一般提示樣式
      shareSlot.replaceChildren(notice(`無法自動複製，請手動複製這個網址：${url}`));
    }
  };
  const shareButton = h('button', { class: 'secondary block', onclick: share }, icon('share'), '分享行程');
  // 站內點進來就回上一頁（保留首頁選的日期）；從分享連結直接進來沒有上一頁，回首頁
  const back = h(
    'button',
    { type: 'button', class: 'back', onclick: () => (navigatedInApp ? history.back() : go('/')) },
    icon('back'),
    navigatedInApp ? '返回' : '看更多行程',
  );
  mount(
    back,
    h(
      'div',
      { class: 'trip-hero' },
      spotTile(trip.spots, 'spot-tile spot-tile-lg'),
      h('div', { class: 'trip-hero-text' }, h('h1', {}, `${formatDate(trip.date)} ${trip.time}`), tripBadge(trip)),
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

// 「過去的行程」展開後一次多顯示幾筆
const HISTORY_PAGE = 10;

// 把「我發的」與「我申請的」合成一份清單，依時間分成三組：
// - 接下來：還沒出發、還會成行的（有待確認申請的司機行程排最前面，其餘依出發時間由近到遠）
// - 配對失敗：還沒出發，但我的申請被拒絕、或行程被司機取消；出發時間過了就移到「過去」
// - 過去：已出發的全部，加上司機自己取消的行程（那是自己的決定，不算配對失敗），由近到遠
function groupActivity(trips, requests) {
  const items = [
    ...trips.map((trip) => ({ trip, role: 'driver', pending: trip.pending })),
    ...requests.map((request) => ({ trip: request.trip, role: 'passenger', status: request.status })),
  ];
  const when = (item) => `${item.trip.date} ${item.trip.time}`;
  const upcoming = [];
  const failed = [];
  const past = [];
  for (const item of items) {
    const cancelled = item.trip.status === 'cancelled';
    if (item.trip.departed) past.push(item);
    else if (item.role === 'driver') (cancelled ? past : upcoming).push(item);
    else if (cancelled || item.status === 'rejected') failed.push(item);
    else upcoming.push(item);
  }
  upcoming.sort((a, b) => (b.pending > 0) - (a.pending > 0) || when(a).localeCompare(when(b)));
  failed.sort((a, b) => when(a).localeCompare(when(b)));
  past.sort((a, b) => when(b).localeCompare(when(a)));
  return { upcoming, failed, past };
}

// 卡片底下一行：先標身分，再放申請狀態或待確認數。
// 行程取消後申請在後端仍是「待確認」，和右上角的「已取消」互相矛盾，所以不顯示；
// 待確認數只在還能處理時（未出發、未取消）顯示
function activityCard(item) {
  const { trip } = item;
  const live = trip.status !== 'cancelled' && !trip.departed;
  const extra =
    item.role === 'driver'
      ? h(
          'span',
          { class: 'row-meta row-role' },
          '我發的',
          live && item.pending ? h('span', { class: 'badge pending' }, `${item.pending} 筆申請待確認`) : null,
        )
      : h(
          'span',
          { class: 'row-meta row-role' },
          '我申請的',
          trip.status === 'cancelled'
            ? null
            : h('span', { class: `badge ${item.status}` }, STATUS_LABEL[item.status]),
        );
  return tripRow(trip, extra);
}

// 過去的行程預設收合（原生 details，鍵盤與螢幕閱讀器都支援），展開後分批顯示
function historySection(past) {
  const list = h('div', { class: 'rows' });
  const more = h('button', { type: 'button', class: 'secondary block' }, '顯示更多');
  let shown = 0;
  const showMore = () => {
    list.append(...past.slice(shown, shown + HISTORY_PAGE).map(activityCard));
    shown += HISTORY_PAGE;
    more.hidden = shown >= past.length;
  };
  more.addEventListener('click', showMore);
  showMore();
  return h('details', { class: 'history' }, h('summary', {}, `過去的行程（${past.length}）`), list, more);
}

async function mePage() {
  if (!me) return loginPrompt('登入後才能查看你的行程與申請。');
  const { trips, requests } = await api('/api/my');
  const { upcoming, failed, past } = groupActivity(trips, requests);
  const logoutSlot = h('div');
  mount(
    h('h1', {}, `${me.name} 的共乘`),
    h('h2', {}, '接下來'),
    upcoming.length
      ? h('div', { class: 'rows' }, upcoming.map(activityCard))
      : h('p', { class: 'empty' }, '接下來沒有行程，去找車或發一趟吧'),
    link('/new', { class: 'button block' }, icon('plus'), '發一趟新行程'),
    failed.length
      ? [h('h2', {}, `配對失敗（${failed.length}）`), h('div', { class: 'rows' }, failed.map(activityCard))]
      : null,
    past.length ? historySection(past) : null,
    group('帳號', contactForm()),
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
    // 登入過期時 api() 已經重畫成登入畫面，這裡不能再蓋掉它
    if (error.code === 'login_required') return;
    // 沒有 code 的是程式本身的例外（英文訊息），不直接顯示給使用者
    mount(notice(error.code ? errorText(error) : '系統錯誤，請重新整理頁面', 'error'), link('/', {}, '回到首頁'));
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
      h(
        'button',
        {
          type: 'button',
          class: 'block',
          onclick: (event) => {
            event.currentTarget.disabled = true;
            boot();
          },
        },
        '重新載入',
      ),
    );
    return;
  }
  await render();
}

await boot();
