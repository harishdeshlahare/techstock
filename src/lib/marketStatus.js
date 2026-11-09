function getLocalParts(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

export function getMarketStatus(market, tradingPeriod, clock = Date.now()) {
  const timestamp = Number.isFinite(clock) && clock > 0 ? clock : Date.now();
  const nowSeconds = timestamp / 1000;
  const open = Number(tradingPeriod?.open ?? tradingPeriod?.start);
  const close = Number(tradingPeriod?.close ?? tradingPeriod?.end);
  if (Number.isFinite(open) && Number.isFinite(close)) {
    return nowSeconds >= open && nowSeconds < close;
  }

  const timeZone = market === 'India' ? 'Asia/Kolkata' : 'America/New_York';
  const { weekday, hour, minute } = getLocalParts(timestamp, timeZone);
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  const minutes = Number(hour) * 60 + Number(minute);
  const start = market === 'India' ? 9 * 60 + 15 : 9 * 60 + 30;
  const end = market === 'India' ? 15 * 60 + 30 : 16 * 60;
  return minutes >= start && minutes < end;
}
