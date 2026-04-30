import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '../api'
import Navbar from '../components/Navbar'

function Book() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    title: '',
    date: searchParams.get('date') || '',
    startTime: searchParams.get('startTime') || '',
    endTime: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async () => {
    setError('')
    setSuccess(false)

    if (!form.title || !form.date || !form.startTime || !form.endTime) {
      setError('กรุณากรอกข้อมูลให้ครบทุกช่อง')
      return
    }

    const startTime = `${form.date}T${form.startTime}:00+07:00`
    const endTime   = `${form.date}T${form.endTime}:00+07:00`

    try {
      setLoading(true)
      await api.post('/bookings', { title: form.title, startTime, endTime })
      setSuccess(true)
      setForm({ title: '', date: '', startTime: '', endTime: '' })
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
            ← กลับไปหน้าปฏิทิน
          </button>

          <div style={s.card} className="fade-in">
            <div style={s.cardHeader}>
              <div style={s.headerIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <path d="M3 8C3 6.34 4.34 5 6 5h12c1.66 0 3 1.34 3 3v8c0 1.66-1.34 3-3 3H6c-1.66 0-3-1.34-3-3V8z" stroke="#1b5e20" strokeWidth="1.8"/>
                  <path d="M16 11l4-2v6l-4-2v-2z" fill="#1b5e20"/>
                </svg>
              </div>
              <div>
                <h2 style={s.heading}>จองห้องประชุม Zoom</h2>
                <p style={s.sub}>กรอกข้อมูลให้ครบถ้วนเพื่อสร้างห้องประชุมอัตโนมัติ</p>
              </div>
            </div>

            <div style={s.infoBox}>
              <div style={s.infoItem}>
                <span style={s.infoLabel}>⏱ ระยะเวลา</span>
                <span style={s.infoValue}>สูงสุด 40 นาที / ครั้ง</span>
              </div>
              <div style={s.infoDivider} />
              <div style={s.infoItem}>
                <span style={s.infoLabel}>📅 ล่วงหน้า</span>
                <span style={s.infoValue}>ไม่เกิน 7 วัน</span>
              </div>
              <div style={s.infoDivider} />
              <div style={s.infoItem}>
                <span style={s.infoLabel}>🎟 โควตา</span>
                <span style={s.infoValue}>4 ครั้ง / เดือน</span>
              </div>
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
              <input
                style={s.input}
                type="date"
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
              />
            </div>

            <div style={s.row}>
              <div style={{ ...s.field, flex: 1 }}>
                <label style={s.label}>เวลาเริ่ม <span style={s.req}>*</span></label>
                <input
                  style={s.input}
                  type="time"
                  value={form.startTime}
                  onChange={e => setForm({ ...form, startTime: e.target.value })}
                />
              </div>
              <div style={{ ...s.field, flex: 1 }}>
                <label style={s.label}>เวลาสิ้นสุด <span style={s.req}>*</span></label>
                <input
                  style={s.input}
                  type="time"
                  value={form.endTime}
                  onChange={e => setForm({ ...form, endTime: e.target.value })}
                />
              </div>
            </div>

            {duration !== null && (
              <div style={{
                ...s.durationBox,
                background: overLimit ? '#fff0f0' : '#f1f8f1',
                color: overLimit ? '#c62828' : '#2e7d32',
                borderColor: overLimit ? '#ffcccc' : '#c8e6c9',
              }}>
                <span style={{ fontWeight: 600 }}>ระยะเวลา:</span>
                <span>{duration} นาที</span>
                {overLimit && <span style={s.warnTag}>เกินขีดจำกัด</span>}
              </div>
            )}

            {error && (
              <div style={s.error} className="slide-in">
                <span style={s.errorIcon}>⚠</span>
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div style={s.success} className="slide-in">
                <div style={s.successCheck}>✓</div>
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
                <>
                  <span>ยืนยันการจอง</span>
                  <span style={s.btnArrow}>→</span>
                </>
              )}
            </button>

            <p style={s.disclaimer}>
              เมื่อกดยืนยัน ระบบจะสร้าง Zoom Meeting ส่งให้ทาง email อัตโนมัติ
            </p>
          </div>
        </div>
      </div>

      <style>{`
        .ku-back { transition: color 0.15s var(--ease), transform 0.15s var(--ease); }
        .ku-back:hover { color: #134d20; transform: translateX(-2px); }
        .ku-submit { transition: transform 0.15s var(--ease), box-shadow 0.2s var(--ease); }
        .ku-submit:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(13, 61, 24, 0.3) !important;
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
    color: '#1b5e20', fontSize: 13, fontWeight: 500, marginBottom: 16,
    padding: '6px 0', display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  card: {
    background: 'white', borderRadius: 20, padding: '36px 36px 28px',
    boxShadow: '0 8px 28px rgba(13, 61, 24, 0.08), 0 2px 8px rgba(13, 61, 24, 0.04)',
    border: '1px solid #e1e7e1',
  },
  cardHeader: {
    display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 24,
  },
  headerIcon: {
    width: 48, height: 48, borderRadius: 12,
    background: 'linear-gradient(135deg, #f1f8f1 0%, #e8f5e9 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  heading: { fontSize: 22, fontWeight: 700, color: '#0d3d18', margin: '4px 0 4px' },
  sub: { fontSize: 13, color: '#777', margin: 0 },
  infoBox: {
    display: 'flex', alignItems: 'center',
    background: '#f1f8f1', borderRadius: 12, padding: '12px 16px',
    marginBottom: 24, border: '1px solid #d4e7d6',
  },
  infoItem: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 },
  infoLabel: { fontSize: 11, color: '#666', fontWeight: 500 },
  infoValue: { fontSize: 12, color: '#1b5e20', fontWeight: 600 },
  infoDivider: { width: 1, height: 28, background: '#c8e6c9' },
  field: { marginBottom: 18 },
  label: {
    display: 'block', fontSize: 13, fontWeight: 600,
    color: '#333', marginBottom: 8,
  },
  req: { color: '#c62828' },
  input: {
    width: '100%', padding: '12px 14px',
    border: '1.5px solid #dde3dd', borderRadius: 10,
    fontSize: 14, background: '#fff',
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
  errorIcon: { fontSize: 18 },
  success: {
    background: 'linear-gradient(135deg, #f1f8f1 0%, #e8f5e9 100%)',
    border: '1px solid #b3dfc0', color: '#1b5e20',
    padding: '14px 16px', borderRadius: 12, fontSize: 13,
    marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14,
  },
  successCheck: {
    width: 32, height: 32, borderRadius: '50%',
    background: '#2e7d32', color: 'white',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, fontWeight: 700, flexShrink: 0,
    animation: 'pulseGlow 1.5s var(--ease) infinite',
  },
  successText: { fontSize: 12, color: '#2d7a3e', margin: '2px 0 0' },
  btn: {
    width: '100%', padding: '14px 0',
    background: 'linear-gradient(135deg, #1b5e20 0%, #134d20 100%)',
    color: 'white', borderRadius: 12,
    fontSize: 15, fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    boxShadow: '0 4px 14px rgba(13, 61, 24, 0.25)',
  },
  btnArrow: { fontSize: 18 },
  btnSpinner: {
    width: 16, height: 16, borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white',
    animation: 'spin 0.6s linear infinite',
  },
  disclaimer: {
    textAlign: 'center', fontSize: 11, color: '#999',
    margin: '14px 0 0',
  },
}

export default Book
