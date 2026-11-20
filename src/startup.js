// 啟動前檢查環境設定。回傳拒絕啟動的原因，可以啟動時回傳 null。
// 抽成純函式是為了能測試；src/server.js 只負責印出原因並結束。
export function startupError(env) {
  const baseUrl = env.BASE_URL ?? '';
  const production = env.NODE_ENV === 'production' || baseUrl.startsWith('https://');
  if (!production) return null;
  // 假登入等於任何人都能冒充任何人，寧可起不來
  if (env.DEV_LOGIN === '1') return 'DEV_LOGIN 不可用於正式環境';
  // 隱私權說明承諾用客服信箱受理權利行使，正式環境少了它就沒有管道（PR-SUPPORT-01）
  if (!env.SUPPORT_EMAIL?.trim()) return '正式環境必須設定 SUPPORT_EMAIL（客服信箱）';
  return null;
}
