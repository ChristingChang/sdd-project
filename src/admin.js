// 管理員指令的邏輯（PR-ACCOUNT-01～03）。指令入口 src/delete-user.js 只負責讀參數、開資料庫、問確認；
// 這裡不碰 process 與終端機，測試可以直接呼叫。
import { DELETED_NAME, DomainError } from './service.js';

const label = (trip) => `${trip.date} ${trip.time}`;
const names = (users) => [...new Map(users.map((u) => [u.id, u.display_name])).values()];

// 刪除後會收到推播的人：被取消行程的待確認與已接受乘客，以及他已接受申請的司機
function recipients(plan) {
  return names([
    ...plan.trips.flatMap(({ accepted, pending }) => [...accepted, ...pending]),
    ...plan.requests.filter(({ request }) => request.status === 'accepted').map(({ driver }) => driver),
  ]);
}

export function previewText(plan) {
  const { user, trips, requests } = plan;
  const lines = [
    `即將刪除使用者 #${user.id}「${user.display_name}」（聯絡方式：${user.contact ?? '未填'}）`,
    '',
    `他當司機、還沒出發的行程：${trips.length} 趟，全部會取消`,
    ...trips.map(
      ({ trip, accepted, pending }) =>
        `  - 行程 #${trip.id} ${label(trip)}：已接受 ${accepted.length} 人、待確認 ${pending.length} 人`,
    ),
    `他當乘客、還沒出發的申請：${requests.length} 筆，全部會退出`,
    ...requests.map(
      ({ request, trip, driver }) =>
        `  - 行程 #${trip.id} ${label(trip)}（司機 ${driver.display_name}）：${
          request.status === 'accepted' ? '已接受，退出後釋出座位' : '待確認'
        }`,
    ),
    '',
  ];
  const notify = recipients(plan);
  lines.push(notify.length ? `刪除後會推播通知：${notify.join('、')}` : '刪除後不會推播通知任何人');
  lines.push(
    `另外：清空聯絡方式與頭像、名稱改為「${DELETED_NAME}」、所有登入立即失效；` +
      '已出發的行程保留，但清除上車點、精確集合點與備註。',
  );
  return lines.join('\n');
}

// 回傳結束代碼：0 成功，1 沒有刪除（參數錯、找不到、已刪過、使用者中止）
export async function deleteUserCommand({ service, notifier, userId, confirm, log = console.log }) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) {
    log(`請給使用者編號（正整數），收到的是：${userId ?? '（沒有）'}`);
    return 1;
  }

  let plan;
  try {
    plan = service.deletionPlan(id);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    log(error.message);
    return 1;
  }

  log(previewText(plan));
  if (!(await confirm())) {
    log('已中止，沒有改任何資料。');
    return 1;
  }

  // 確認後重新計算一次（deleteUser 內部用同一份 deletionPlan），預覽之後若有人剛好申請也會一併處理
  let done;
  try {
    done = service.deleteUser(id);
  } catch (error) {
    if (!(error instanceof DomainError)) {
      log(`刪除失敗，資料已全部還原：${error.message}`);
      return 1;
    }
    log(error.message);
    return 1;
  }

  // 推播文字與網站操作共用（notify.js）：取消行程同 PR-CANCEL-01，乘客退出同 PR-CANCEL-02
  for (const { trip, accepted, pending } of done.trips) {
    await notifier.tripCancelled([...accepted, ...pending], trip);
  }
  for (const { request, trip, driver } of done.requests) {
    if (request.status === 'accepted') await notifier.withdrawn(driver, done.user.display_name, trip);
  }

  log(
    `已刪除使用者 #${id}：取消 ${done.trips.length} 趟行程、退出 ${done.requests.length} 筆申請，` +
      `已送出推播給 ${recipients(done).length} 人（沒送到的會在上面印出「推播失敗」，請改用其他方式通知）。`,
  );
  return 0;
}

// 依名稱或聯絡方式查使用者編號：來信的人只會說自己的 LINE 名稱，刪除指令要的是編號
export function findUsersText(users, keyword) {
  if (!users.length) return `找不到名稱或聯絡方式包含「${keyword}」的使用者`;
  return users
    .map((u) => `#${u.id}「${u.display_name}」 聯絡方式：${u.contact ?? '未填'}`)
    .join('\n');
}
