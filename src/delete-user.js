// 管理員刪除帳號（PR-ACCOUNT-01～03）。流程與正式環境怎麼執行見 docs/support-sop.md
//
//   npm run delete-user -- --find <名稱或聯絡方式>   查使用者編號
//   npm run delete-user -- <使用者編號>              印出預覽，輸入 yes 才刪除
//   npm run delete-user -- <使用者編號> --yes        略過確認（測試或已經確認過時用）
//
// 和網站共用同一個資料庫檔。這支指令只會取消行程、退出申請（座位只減不增），不會造成超賣。
import { createInterface } from 'node:readline/promises';
import { deleteUserCommand, findUsersText } from './admin.js';
import { openDb } from './db.js';
import { createLineClient } from './line.js';
import { createNotifier } from './notify.js';
import { createService } from './service.js';

try {
  process.loadEnvFile();
} catch {
  // 沒有 .env 時直接使用環境變數（正式環境如此）
}

const { env } = process;
const args = process.argv.slice(2);
const db = openDb(env.DB_PATH ?? 'data/carpool.db');
// 網站剛好在寫入時等一下再試，不要直接失敗
db.exec('PRAGMA busy_timeout = 5000;');
const service = createService(db);

if (args[0] === '--find') {
  const keyword = args.slice(1).join(' ').trim();
  if (!keyword) {
    console.log('請給要查的名稱或聯絡方式，例如：npm run delete-user -- --find 小魚');
    process.exitCode = 1;
  } else {
    console.log(findUsersText(service.findUsers(keyword), keyword));
  }
} else {
  const baseUrl = env.BASE_URL ?? `http://localhost:${env.PORT ?? 3000}`;
  const line = createLineClient({
    channelId: env.LINE_LOGIN_CHANNEL_ID,
    channelSecret: env.LINE_LOGIN_CHANNEL_SECRET,
    messagingToken: env.LINE_MESSAGING_ACCESS_TOKEN,
    baseUrl,
  });
  const skipConfirm = args.includes('--yes');
  const confirm = async () => {
    if (skipConfirm) return true;
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('\n確定要刪除嗎？輸入 yes 執行，輸入其他內容中止：');
    rl.close();
    return answer.trim() === 'yes';
  };
  process.exitCode = await deleteUserCommand({
    service,
    notifier: createNotifier(line, baseUrl),
    userId: args.find((arg) => arg !== '--yes'),
    confirm,
  });
}
db.close();
