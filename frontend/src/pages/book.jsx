import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

function Book() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ title: '', date: '', startTime: '', endTime: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const token = localStorage.getItem('token')

  const handleSubmit = async () => {
    setError('')
    setSuccess('')

    if (!form.title || !form.date || !form.startTime || !form.endTime) {
      setError('กรุณากรอกข้อมูลให้ครบทุกช่อง')
      return
    }

    const startTime = `${form.date}T${form.startTime}:00+07:00`
    const endTime   = `${form.date}T${form.endTime}:00+07:00`

    try {
      setLoading(true)
      await axios.post('http://localhost:3000/bookings',
        { title: form.title, startTime, endTime },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setSuccess('จองสำเร็จ กรุณาตรวจสอบอีเมลของคุณ')
      setForm({ title: '', date: '', startTime: '', endTime: '' })
    } catch (err) {
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div style={s.root}>
      <nav style={s.nav}>
        <span style={s.navBrand}>KU Zoom Booking</span>
        <div style={s.navLinks}>
          <span style={s.navLink} onClick={() => navigate('/my-bookings')}>การจองของฉัน</span>
          <span style={s.navBtn} onClick={handleLogout}>ออกจากระบบ</span>
        </div>
      </nav>

      <div style={s.body}>
        <div style={s.card}>
          <h2 style={s.heading}>จองห้องประชุม Zoom</h2>
          <p style={s.sub}>สูงสุด 40 นาที / ล่วงหน้าไม่เกิน 7 วัน</p>

          <div style={s.field}>
            <label style={s.label}>หัวข้อการประชุม</label>
            <input
              style={s.input}
              placeholder="เช่น ประชุมกลุ่มวิชา CPE"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div style={s.field}>
            <label style={s.label}>วันที่</label>
            <input
              style={s.input}
              type="date"
              value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })}
            />
          </div>

          <div style={s.row}>
            <div style={{ ...s.field, flex: 1 }}>
              <label style={s.label}>เวลาเริ่ม</label>
              <input
                style={s.input}
                type="time"
                value={form.startTime}
                onChange={e => setForm({ ...form, startTime: e.target.value })}
              />
            </div>
            <div style={{ ...s.field, flex: 1 }}>
              <label style={s.label}>เวลาสิ้นสุด</label>
              <input
                style={s.input}
                type="time"
                value={form.endTime}
                onChange={e => setForm({ ...form, endTime: e.target.value })}
              />
            </div>
          </div>

          {error   && <div style={s.error}>{error}</div>}
          {success && <div style={s.success}>{success}</div>}

          <button
            style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'กำลังจอง...' : 'ยืนยันการจอง'}
          </button>
        </div>
      </div>
    </div>
  )
}

const s = {
  root: { minHeight: '100vh', background: '#f7f9f7', fontFamily: "'Sarabun', sans-serif" },
  nav: {
    background: '#2d7a3e', padding: '0 40px', height: 60,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
  },
  navBrand: { color: 'white', fontWeight: 700, fontSize: 18 },
  navLinks: { display: 'flex', alignItems: 'center', gap: 24 },
  navLink: { color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontSize: 14 },
  navBtn: {
    color: 'white', cursor: 'pointer', fontSize: 14,
    background: 'rgba(255,255,255,0.15)', padding: '6px 14px', borderRadius: 6
  },
  body: { display: 'flex', justifyContent: 'center', padding: '48px 24px' },
  card: {
    background: 'white', borderRadius: 16, padding: '40px',
    width: '100%', maxWidth: 480, boxShadow: '0 2px 16px rgba(0,0,0,0.07)'
  },
  heading: { fontSize: 22, fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' },
  sub: { fontSize: 13, color: '#888', margin: '0 0 32px' },
  field: { marginBottom: 20 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 6 },
  input: {
    width: '100%', padding: '10px 12px', border: '1.5px solid #e0e0e0',
    borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box',
    fontFamily: "'Sarabun', sans-serif"
  },
  row: { display: 'flex', gap: 16 },
  error: {
    background: '#fff0f0', border: '1px solid #ffcccc', color: '#cc3333',
    padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16
  },
  success: {
    background: '#f0faf3', border: '1px solid #b3dfc0', color: '#2d7a3e',
    padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16
  },
  btn: {
    width: '100%', padding: '13px 0', background: '#2d7a3e',
    color: 'white', border: 'none', borderRadius: 8, fontSize: 15,
    fontWeight: 600, cursor: 'pointer', fontFamily: "'Sarabun', sans-serif"
  }
}

export default Book 
