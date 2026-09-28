// แปลงเวลาระหว่างเขตเวลา — ใช้กับการจองตามเขตเวลา (feedback Rev.1 ข้อ 12)
// ผู้ใช้กรอกวันและเวลาเป็นเวลาของเขตที่เลือก ระบบแปลงเป็นเวลาสากลก่อนส่ง backend
// กติกาการจอง 08:00-24:00 ยังนับตามเวลาไทยเสมอ
export const BKK_TZ = 'Asia/Bangkok'

// เขตเวลา UTC-12 ถึง UTC+12 แบบตัวเลข ค่าเริ่มต้น UTC+7 เวลาไทย (value ว่าง)
// ใช้ Etc/GMT... ซึ่งกลับเครื่องหมาย: Etc/GMT-8 = UTC+8 · เป็นเวลาคงที่ ไม่เปลี่ยนตามเวลาออมแสง
// ตัวอย่างเลือกเฉพาะประเทศที่ไม่มีเวลาออมแสง จะได้ไม่ต้องระบุฤดู
const OFFSET_EXAMPLES = {
  '-12': 'Baker Island',
  '-11': 'American Samoa',
  '-10': 'Hawaii',
  '-9': 'Gambier Islands',
  '-8': 'Pitcairn Islands',
  '-7': 'Arizona',
  '-6': 'Mexico City, Costa Rica',
  '-5': 'Colombia, Peru',
  '-4': 'Venezuela, Puerto Rico',
  '-3': 'Brazil, Argentina',
  '-2': 'South Georgia',
  '-1': 'Cape Verde',
  '0': 'Iceland, Ghana',
  '1': 'Nigeria, Algeria',
  '2': 'South Africa, Zimbabwe',
  '3': 'Saudi Arabia, Turkey, Moscow',
  '4': 'United Arab Emirates, Oman',
  '5': 'Pakistan, Uzbekistan',
  '6': 'Bangladesh, Bhutan',
  '7': 'Thailand, Vietnam, Western Indonesia',
  '8': 'China, Singapore, Malaysia, Philippines',
  '9': 'Japan, South Korea',
  '10': 'Queensland, Guam',
  '11': 'New Caledonia, Solomon Islands',
  '12': 'Fiji',
}

export const TIMEZONES = Array.from({ length: 25 }, (_, i) => {
  const off = i - 12
  const sign = off < 0 ? '−' : '+'
  const label = `UTC${sign}${String(Math.abs(off)).padStart(2, '0')}:00 · ${OFFSET_EXAMPLES[off]}`
  if (off === 7) return { value: '', label: `${label} (default)` }
  if (off === 0) return { value: 'UTC', label }
  // Etc/GMT กลับเครื่องหมาย
  return { value: `Etc/GMT${off > 0 ? '-' : '+'}${Math.abs(off)}`, label }
})

const tzOrBkk = (tz) => tz || BKK_TZ

// วันและเวลาของ instant นี้ในเขตเวลา tz → { ymd: 'YYYY-MM-DD', hhmm: 'HH:MM' }
export function utcToZoned(date, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tzOrBkk(tz), year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const get = (t) => parts.find(p => p.type === t).value
  return { ymd: `${get('year')}-${get('month')}-${get('day')}`, hhmm: `${get('hour')}:${get('minute')}` }
}

function offsetMs(date, tz) {
  const { ymd, hhmm } = utcToZoned(date, tz)
  const asUtc = Date.parse(`${ymd}T${hhmm}:00Z`)
  return asUtc - Math.floor(date.getTime() / 60000) * 60000
}

// วัน 'YYYY-MM-DD' + เวลา 'HH:MM' ในเขตเวลา tz → Date (instant) · ข้อมูลไม่ครบคืน null
export function zonedToUtc(ymd, hhmm, tz) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '') || !/^\d{2}:\d{2}$/.test(hhmm || '')) return null
  const guess = Date.parse(`${ymd}T${hhmm}:00Z`)
  if (isNaN(guess)) return null
  let result = guess - offsetMs(new Date(guess), tz)
  // รอบที่ 2 แก้กรณีช่วงเปลี่ยนเวลาออมแสง
  const off2 = offsetMs(new Date(result), tz)
  result = guess - off2
  return new Date(result)
}

// ช่วงเวลาที่ผู้ใช้กรอก → { start, end } เป็น Date · เวลาสิ้นสุดน้อยกว่าเวลาเริ่ม = ข้ามไปวันถัดไป
export function zonedRange(ymd, startHHMM, endHHMM, tz) {
  const start = zonedToUtc(ymd, startHHMM, tz)
  let end = zonedToUtc(ymd, endHHMM, tz)
  if (!start || !end) return null
  if (end <= start) end = new Date(end.getTime() + 24 * 3600 * 1000)
  return { start, end }
}

// ตรวจกติกาเวลาไทย 08:00-24:00 ของวันเดียวกัน · ผ่าน = null, ไม่ผ่าน = ข้อความ
export function bangkokRuleError(start, end) {
  const s = utcToZoned(start, BKK_TZ)
  const e = utcToZoned(end, BKK_TZ)
  const endsAtMidnight = e.hhmm === '00:00' && e.ymd > s.ymd &&
    (end - start) <= 24 * 3600 * 1000
  if (s.hhmm < '08:00') return `เริ่มได้ตั้งแต่ 08:00 เวลาไทย แต่เวลาที่เลือกตรงกับ ${s.hhmm} น. เวลาไทย`
  if (e.ymd !== s.ymd && !endsAtMidnight) return 'ต้องจบภายใน 24:00 เวลาไทยของวันเดียวกัน'
  return null
}

// ข้อความช่วงเวลาไทย เช่น "จ. 26 ส.ค. 69 · 20:00 – 21:00 น."
export function formatBangkokRange(start, end) {
  const d = start.toLocaleDateString('th-TH', { timeZone: BKK_TZ, weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' })
  const t = (x) => x.toLocaleTimeString('th-TH', { timeZone: BKK_TZ, hour: '2-digit', minute: '2-digit' })
  return `${d} · ${t(start)} – ${t(end)} น.`
}
