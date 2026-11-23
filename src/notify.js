// 所有 LINE 推播的文字都在這裡。網站操作與管理員指令（刪除帳號，PR-ACCOUNT-02）共用同一套，
// 同一件事（行程取消、乘客退出）不管從哪裡觸發，使用者收到的都是同一句話。
export function createNotifier(line, baseUrl) {
  const tripUrl = (trip) => `${baseUrl}/trips/${trip.id}`;
  const tripLabel = (trip) => `${trip.date} ${trip.time}`;

  // 推播失敗不能讓使用者的操作失敗，資料已經寫入了
  const send = async (user, text) => {
    try {
      await line.push(user.line_user_id, text);
    } catch (error) {
      console.error('推播失敗', error.message);
    }
  };

  return {
    tripUrl,

    // PR-NOTIFY-01
    applied: (driver, passengerName, trip) =>
      send(driver, `${passengerName} 申請了你 ${tripLabel(trip)} 的行程\n${tripUrl(trip)}`),

    // PR-NOTIFY-02。集合點只放進接受通知，被拒絕的乘客不該知道
    decided: (passenger, trip, accepted) => {
      const result = accepted ? '已被接受，可以查看司機聯絡方式' : '未被接受';
      const meet = accepted && trip.meeting_point ? `\n集合點：${trip.meeting_point}` : '';
      return send(passenger, `你申請的 ${tripLabel(trip)} 行程${result}${meet}\n${tripUrl(trip)}`);
    },

    // PR-CANCEL-01：通知待確認與已接受的乘客
    tripCancelled: (passengers, trip) =>
      Promise.all(
        passengers.map((p) => send(p, `你申請的 ${tripLabel(trip)} 行程已被司機取消\n${tripUrl(trip)}`)),
      ),

    // PR-CANCEL-02：已接受的乘客退出，通知司機座位釋出
    withdrawn: (driver, passengerName, trip) =>
      send(driver, `${passengerName} 退出了你 ${tripLabel(trip)} 的行程，座位已釋出\n${tripUrl(trip)}`),
  };
}
