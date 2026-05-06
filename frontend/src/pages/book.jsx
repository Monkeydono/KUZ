import { useState, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { AlertCircle, Check, Calendar, Clock } from 'lucide-react'
import api from '../api'
import { useUser } from '../useUser'
import Navbar from '../components/Navbar'

const formatToDDMMYYYY = (yyyymmdd) => {
  if (!yyyymmdd) return ''
  const [yyyy, mm, dd] = yyyymmdd.split('-')
  return `${dd}/${mm}/${yyyy}`
}

const parseDDMMYYYY = (str) => {
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  const [, dd, mm, yyyy] = match
  return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`
}

function Book() {
  const { isAdmin } = useUser()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    title: '',
    date: formatToDDMMYYYY(searchParams.get('date')) || '',
    startTime: searchParams.get('startTime') || '',
    endTime: '',
    coHosts: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const dateInputRef = useRef(null)
  const startTimeRef = useRef(null)
  const endTimeRef = useRef(null)

  const openPicker = (ref) => {
    const el = ref.current
    if (!el) return
    if (typeof el.showPicker === 'function') {
      try { el.showPicker() } catch { el.focus() }
    } else {
      el.focus()
    }
  }
  const openDatePicker = () => openPicker(dateInputRef)

  const handleDatePick = (e) => {
    const iso = e.target.value
    if (iso) setForm(f => ({ ...f, date: formatToDDMMYYYY(iso) }))
  }

  const dateAsISO = parseDDMMYYYY(form.date) || ''

  const handleSubmit = async () => {
    setError('')
    setSuccess(false)

    if (!form.title || !form.date || !form.startTime || !form.endTime) {
      setError('กรุณากรอกข้อมูลให้ครบทุกช่อง')
      return
    }

    const dateISO = parseDDMMYYYY(form.date)
    if (!dateISO) {
      setError('รูปแบบวันที่ไม่ถูกต้อง (DD/MM/YYYY)')
      return
    }

    const startTime = `${dateISO}T${form.startTime}:00+07:00`
    const endTime   = `${dateISO}T${form.endTime}:00+07:00`
    const coHostEmails = form.coHosts
      .split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)

    try {
      setLoading(true)
      await api.post('/bookings', { title: form.title, startTime, endTime, coHostEmails })
      setSuccess(true)
      setForm({ title: '', date: '', startTime: '', endTime: '', coHosts: '' })
    } catch (err) {
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  const calcDuration = () => {
    if (!form.startTime || !form.endTime) return null
    const [sh, sm] = form.startTime.split(':').map(Number)
    const [eh, em] = form.endTime.split(':').map(Number)
    const mins = (eh * 60 + em) - (sh * 60 + sm)
    return mins > 0 ? mins : null
  }
  const duration = calcDuration()
  const overLimit = duration && duration > 40

  return (
    <div style={s.root}>
      <Navbar />

      <div style={s.body}>
        <div style={s.container}>
          <button style={s.backBtn} onClick={() => navigate('/calendar')} className="ku-back">
            กลับไปหน้าปฏิทิน
          </button>

          <div style={s.card} className="fade-in">
            <div style={s.cardHeader}>
              <h2 style={s.heading}>จองห้องประชุม Zoom</h2>
            </div>

            <div style={s.infoBox}>
              <div style={s.infoItem}>
                <span style={s.infoLabel}>ระยะเวลา</span>
                <span style={s.infoValue}>สูงสุด 40 นาที / ครั้ง</span>
              </div>
              {!isAdmin && (
                <>
                  <div style={s.infoDivider} />
                  <div style={s.infoItem}>
                    <span style={s.infoLabel}>ล่วงหน้า</span>
                    <span style={s.infoValue}>ไม่เกิน 7 วัน</span>
                  </div>
                  <div style={s.infoDivider} />
                  <div style={s.infoItem}>
                    <span style={s.infoLabel}>โควตา</span>
                    <span style={s.infoValue}>4 ครั้ง / เดือน</span>
                  </div>
                </>
              )}
              {isAdmin && (
                <>
                  <div style={s.infoDivider} />
                  <div style={s.infoItem}>
                    <span style={s.infoLabel}>สิทธิ์</span>
                    <span style={s.infoValue}>Admin (ไม่จำกัดวัน/โควตา)</span>
                  </div>
                </>
              )}
            </div>

            <div style={s.field}>
              <label style={s.label}>หัวข้อการประชุม <span style={s.req}>*</span></label>
              <input
                style={s.input}
                placeholder="เช่น ประชุมกลุ่มวิชา CPE / สอบ Defense"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                maxLength={200}
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>วันที่ <span style={s.req}>*</span></label>
              <div style={s.dateWrap}>
                <input
                  style={{ ...s.input, paddingRight: 44 }}
                  type="text"
                  placeholder="DD/MM/YYYY"
                  inputMode="numeric"
                  maxLength={10}
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                />
                <button
                  type="button"
                  style={s.dateBtn}
                  className="ku-date-btn"
                  onClick={openDatePicker}
                  aria-label="เปิดปฏิทิน"
                >
                  <Calendar size={18} />
                </button>
                <input
                  ref={dateInputRef}
                  type="date"
                  value={dateAsISO}
                  onChange={handleDatePick}
                  style={s.dateHidden}
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </div>
            </div>

            <div style={s.row}>
              <div style={{ ...s.field, flex: 1 }}>
                <label style={s.label}>เวลาเริ่ม <span style={s.req}>*</span></label>
                <div style={s.dateWrap}>
                  <input
                    ref={startTimeRef}
                    style={{ ...s.input, paddingRight: 44 }}
                    type="time"
                    className="ku-time-input"
                    value={form.startTime}
                    onChange={e => setForm({ ...form, startTime: e.target.value })}
                  />
                  <button
                    type="button"
                    style={s.dateBtn}
                    className="ku-date-btn"
                    onClick={() => openPicker(startTimeRef)}
                    aria-label="เปิดเลือกเวลา"
                  >
                    <Clock size={18} />
                  </button>
                </div>
              </div>
              <div style={{ ...s.field, flex: 1 }}>
                <label style={s.label}>เวลาสิ้นสุด <span style={s.req}>*</span></label>
                <div style={s.dateWrap}>
                  <input
                    ref={endTimeRef}
                    style={{ ...s.input, paddingRight: 44 }}
                    type="time"
                    className="ku-time-input"
                    value={form.endTime}
                    onChange={e => setForm({ ...form, endTime: e.target.value })}
                  />
                  <button
                    type="button"
                    style={s.dateBtn}
                    className="ku-date-btn"
                    onClick={() => openPicker(endTimeRef)}
                    aria-label="เปิดเลือกเวลา"
                  >
                    <Clock size={18} />
                  </button>
                </div>
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>
                Co-host (อีเมล, คั่นด้วย comma) <span style={s.optional}>— ไม่บังคับ</span>
              </label>
              <input
                style={s.input}
                placeholder="email1@ku.th, email2@ku.th"
                value={form.coHosts}
                onChange={e => setForm({ ...form, coHosts: e.target.value })}
              />
            </div>

            {duration !== null && (
              <div style={{
                ...s.durationBox,
                background: overLimit ? '#fff0f0' : '#F0FBF6',
                color: overLimit ? '#c62828' : '#1FBA7C',
                borderColor: overLimit ? '#ffcccc' : '#B5E8D2',
              }}>
                <span style={{ fontWeight: 600 }}>ระยะเวลา:</span>
                <span>{duration} นาที</span>
                {overLimit && <span style={s.warnTag}>เกินขีดจำกัด</span>}
              </div>
            )}

            {error && (
              <div style={s.error} className="slide-in">
                <AlertCircle size={18} style={s.errorIcon} />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div style={s.success} className="slide-in">
                <div style={s.successCheck}><Check size={18} strokeWidth={3} /></div>
                <div>
                  <strong>จองสำเร็จ!</strong>
                  <p style={s.successText}>กรุณาตรวจสอบอีเมลของคุณเพื่อรับลิงก์ Zoom</p>
                </div>
              </div>
            )}

            <button
              style={{ ...s.btn, opacity: loading || overLimit ? 0.6 : 1 }}
              className="ku-submit"
              onClick={handleSubmit}
              disabled={loading || overLimit}
            >
              {loading ? (
                <>
                  <div style={s.btnSpinner} />
                  <span>กำลังสร้างห้องประชุม...</span>
                </>
              ) : (
                <span>ยืนยันการจอง</span>
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .ku-back {
          transition: background 0.2s var(--ease), color 0.2s var(--ease),
                      border-color 0.2s var(--ease), transform 0.15s var(--ease),
                      box-shadow 0.2s var(--ease);
        }
        .ku-back:hover {
          background: linear-gradient(135deg, #03A96B 0%, #1FBA7C 100%) !important;
          color: white !important;
          border-color: #03A96B !important;
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(1, 74, 50, 0.22) !important;
        }
        .ku-date-btn { transition: background 0.15s var(--ease), color 0.15s var(--ease); }
        .ku-date-btn:hover { background: #1FBA7C !important; color: white !important; }
        .ku-time-input::-webkit-calendar-picker-indicator { display: none; }
        .ku-time-input::-webkit-inner-spin-button { display: none; }
        .ku-submit { transition: transform 0.15s var(--ease), box-shadow 0.2s var(--ease); }
        .ku-submit:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(1, 74, 50, 0.3) !important;
        }
      `}</style>
    </div>
  )
}

const s = {
  root: { minHeight: '100vh', background: '#f4f6f4' },
  body: { display: 'flex', justifyContent: 'center', padding: '40px 24px' },
  container: { width: '100%', maxWidth: 540 },
  backBtn: {
    color: '#03A96B', fontSize: 13, fontWeight: 600, marginBottom: 16,
    padding: '9px 18px', display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'white',
    border: '1.5px solid #B5E8D2',
    borderRadius: 10,
    boxShadow: '0 2px 6px rgba(1, 74, 50, 0.06)',
  },
  card: {
    background: 'white', borderRadius: 20, padding: '36px 36px 28px',
    boxShadow: '0 8px 28px rgba(1, 74, 50, 0.08), 0 2px 8px rgba(1, 74, 50, 0.04)',
    border: '1px solid #e1e7e1',
  },
  cardHeader: { marginBottom: 24 },
  heading: { fontSize: 22, fontWeight: 700, color: '#014A32', margin: 0 },
  infoBox: {
    display: 'flex', alignItems: 'stretch', gap: 16,
    background: '#F0FBF6', borderRadius: 12, padding: '16px 20px',
    marginBottom: 24, border: '1px solid #B5E8D2',
  },
  infoItem: { flex: 1, display: 'flex', flexDirection: 'column', gap: 6, lineHeight: 1.3 },
  infoLabel: {
    fontSize: 11, color: '#888', fontWeight: 500,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  infoValue: { fontSize: 13, color: '#03A96B', fontWeight: 600 },
  infoDivider: { width: 1, background: '#B5E8D2', alignSelf: 'stretch' },
  field: { marginBottom: 18 },
  label: {
    display: 'block', fontSize: 13, fontWeight: 600,
    color: '#333', marginBottom: 8,
  },
  req: { color: '#c62828' },
  optional: { color: '#888', fontWeight: 400, fontSize: 11 },
  input: {
    width: '100%', padding: '12px 14px',
    border: '1.5px solid #dde3dd', borderRadius: 10,
    fontSize: 14, background: '#fff',
  },
  dateWrap: { position: 'relative' },
  dateBtn: {
    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
    width: 32, height: 32, borderRadius: 8,
    color: '#03A96B', background: '#F0FBF6',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  dateHidden: {
    position: 'absolute', right: 6, top: '50%',
    width: 32, height: 32, opacity: 0, pointerEvents: 'none',
    border: 'none', padding: 0,
  },
  row: { display: 'flex', gap: 14 },
  durationBox: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 14px', borderRadius: 10, border: '1px solid',
    fontSize: 13, marginBottom: 16,
  },
  warnTag: {
    marginLeft: 'auto', background: '#c62828', color: 'white',
    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
  },
  error: {
    background: '#fff0f0', border: '1px solid #ffcccc', color: '#cc3333',
    padding: '12px 14px', borderRadius: 10, fontSize: 13,
    marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
  },
  errorIcon: { color: '#cc3333', flexShrink: 0 },
  success: {
    background: 'linear-gradient(135deg, #F0FBF6 0%, #D9F5E7 100%)',
    border: '1px solid #88E0BB', color: '#03A96B',
    padding: '14px 16px', borderRadius: 12, fontSize: 13,
    marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14,
  },
  successCheck: {
    width: 32, height: 32, borderRadius: '50%',
    background: '#1FBA7C', color: 'white',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, fontWeight: 700, flexShrink: 0,
    animation: 'pulseGlow 1.5s var(--ease) infinite',
  },
  successText: { fontSize: 12, color: '#028152', margin: '2px 0 0' },
  btn: {
    width: '100%', padding: '14px 0',
    background: 'linear-gradient(135deg, #03A96B 0%, #028152 100%)',
    color: 'white', borderRadius: 12,
    fontSize: 15, fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    boxShadow: '0 4px 14px rgba(1, 74, 50, 0.25)',
  },
  btnSpinner: {
    width: 16, height: 16, borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white',
    animation: 'spin 0.6s linear infinite',
  },
}

export default Book
