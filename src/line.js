// LINE 平台的唯一接觸點。測試時以假物件替換，其餘程式不直接呼叫 LINE。
const TIMEOUT_MS = 5000;

export function createLineClient(
  { channelId, channelSecret, messagingToken, baseUrl },
  fetchImpl = fetch,
) {
  const redirectUri = `${baseUrl}/auth/line/callback`;

  return {
    loginEnabled: Boolean(channelId && channelSecret),

    authorizeUrl(state) {
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: channelId,
        redirect_uri: redirectUri,
        state,
        scope: 'profile openid',
        // 登入時順便邀請加官方帳號好友，否則收不到推播
        bot_prompt: 'aggressive',
      });
      return `https://access.line.me/oauth2/v2.1/authorize?${params}`;
    },

    async exchangeCode(code) {
      const tokenRes = await fetchImpl('https://api.line.me/oauth2/v2.1/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: channelId,
          client_secret: channelSecret,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!tokenRes.ok) throw new Error(`LINE token 交換失敗：${tokenRes.status}`);
      const { access_token: accessToken } = await tokenRes.json();
      const profileRes = await fetchImpl('https://api.line.me/v2/profile', {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!profileRes.ok) throw new Error(`LINE profile 取得失敗：${profileRes.status}`);
      const profile = await profileRes.json();
      return {
        lineUserId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl,
      };
    },

    async push(lineUserId, text) {
      if (!messagingToken) {
        console.log(`[推播未設定] ${text}`);
        return;
      }
      const res = await fetchImpl('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${messagingToken}`,
        },
        body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`LINE 推播失敗：${res.status}`);
    },
  };
}
