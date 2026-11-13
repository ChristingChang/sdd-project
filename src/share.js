import { BOARD_RULES } from './service.js';

// Threads 單篇上限 500 字；FB 沒有這麼嚴，所以以 Threads 為準
export const SHARE_LIMIT = 500;

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const length = (text) => [...text].length;

// 公開發文文字：只用公開欄位，不碰聯絡方式與精確集合點
export function shareText(trip, url) {
  const [, month, day] = trip.date.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(`${trip.date}T00:00:00Z`).getUTCDay()];
  const fare =
    trip.fareRoundTrip === null
      ? `單程 $${trip.fareOneWay}`
      : `單程 $${trip.fareOneWay}／來回 $${trip.fareRoundTrip}`;
  const build = (pickupLine) =>
    [
      '#我是司機徵乘客',
      `日期：${month}/${day}（${weekday}）`,
      `浪點：${trip.spots.join('、')}`,
      `出發：${trip.time}`,
      `上車：${pickupLine}`,
      `座位：剩 ${trip.seatsLeft} 位`,
      `載板：${BOARD_RULES[trip.boardRule]}`,
      `車資：${fare}`,
      ...(trip.returnTime ? [`回程：${trip.returnTime}`] : []),
      '',
      `申請共乘：${url}`,
    ].join('\n');

  // 上車點太多時從後面省略，其餘留給連結頁面
  for (let shown = trip.pickups.length; shown > 0; shown -= 1) {
    const rest = trip.pickups.length - shown;
    const line = trip.pickups.slice(0, shown).join('、') + (rest ? ` 等 ${trip.pickups.length} 處` : '');
    const text = build(line);
    if (length(text) <= SHARE_LIMIT) return text;
  }
  return build(`${trip.pickups.length} 處，詳見連結`);
}
