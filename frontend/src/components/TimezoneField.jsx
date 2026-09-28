import { TIMEZONES, formatBangkokRange } from '../tz'

// เลือกเขตเวลาที่ใช้กรอกเวลาจอง (feedback Rev.1 ข้อ 12)
// เลือกแล้ว ช่องวันและเวลาจะเป็นเวลาของเขตนั้น ระบบแปลงเป็นเวลาไทยให้ดู
// ห้อง Zoom และอีเมลแจ้งเตือนจะแสดงเวลาตามเขตนี้ด้วย
function TimezoneField({ value, onChange, range, ruleError, disabled, labelStyle, inputStyle, fieldStyle }) {
  return (
    <div style={fieldStyle}>
      <label style={labelStyle}>
        Timezone
      </label>
      <select
        style={inputStyle}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
      >
        {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
      </select>
      {value && (
        <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5, color: ruleError ? '#c62828' : '#028152' }}>
          {range
            ? <>ตรงกับเวลาไทย: <strong>{formatBangkokRange(range.start, range.end)}</strong></>
            : 'กรอกวันและเวลาตามเขตเวลาที่เลือก'}
          {ruleError && <><br />{ruleError}</>}
          <br />
          <span style={{ color: '#888' }}>ห้อง Zoom และอีเมลแจ้งเตือนจะแสดงเวลาตามเขตนี้ด้วย</span>
        </div>
      )}
    </div>
  )
}

export default TimezoneField
