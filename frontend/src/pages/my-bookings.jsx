 
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

function MyBookings() {
  const navigate = useNavigate()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const token = localStorage.getItem('token')

  useEffect(() => {
    fetchBookings()
  }, [])

  const fetchBookings = async () => {
    try {
      const res = await axios.get('http://localhost:3000/bookings', {
        headers: { Authorization: `Bearer ${token}` }
      })
      setBookings(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async (id) => {
    if (!confirm('ยืนยันการยกเลิกการจองนี้?')) return
    try {
      await axios.delete(`http://localhost:3000/bookings/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      fetchBookings()
    } catch (err) {
      alert('ยกเลิกไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    navigate('/login')
  }

  const formatDate = (iso) => new Date(iso).toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  const formatTime = (iso) => new Date(iso).toLocaleTimeString('th-TH', {
    hour: '2-digit', minute: '2-digit'
  })

  const statusLabel = (status) => ({
    confirmed:  { text: 'กำลังจอง',  color: '#2d7a3e', bg: '#f0faf3' },
    cancelled:  { text: 'ยกเลิกแล้ว', color: '#cc3333', bg: '#fff0f0' },
    completed:  { text: 'เสร็จสิ้น',  color: '#888',    bg: '#f5f5f5' },
  }[status] || { text: status, color: '#888', bg: '#f5f5f5' })

  return (
    <div style={s.root}>
      <nav style={s.nav}>
        <span style={s.navBrand}>KU Zoom Booking</span>
        <div style={s.navLinks}>
          <span style={s.navLink} onClick={() => navigate('/book')}>จองห้อง</span>
          <span style={s.navBtn} onClick={handleLogout}>ออกจากระบบ</span>
        </div>
      </nav>

      <div style={s.body}>
        <h2 style={s.heading}>การจองของฉัน</h2>

        {loading && <p style={s.empty}>กำลังโหลด...</p>}

        {!loading && bookings.length === 0 && (
          <div style={s.emptyBox}>
            <p style={s.empty}>ยังไม่มีการจอง</p>
            <button style={s.btnSm} onClick={() => navigate('/book')}>จองห้องเลย</button>
          </div>
        )}

        <div style={s.list}>
          {bookings.map(b => {
            const st = statusLabel(b.status)
            return (
              <div key={b.id} style={s.card}>
                <div style={s.cardTop}>
                  <div>
                    <div style={s.title}>{b.title}</div>
                    <div style={s.date}>{formatDate(b.start_time)}</div>
                    <div style={s.time}>
                      {formatTime(b.start_time)} - {formatTime(b.end_time)}
                    </div>
                  </div>
                  <span style={{ ...s.badge, color: st.color, background: st.bg }}>
                    {st.text}
                  </span>
                </div>

                {b.status === 'confirmed' && (
                  <div style={s.cardBottom}>
                    <a href={b.zoom_join_url} target="_blank" style={s.link}>
                      เข้าร่วม Zoom
                    </a>
                    <span style={s.pass}>รหัส: {b.zoom_password}</span>
                    <button style={s.cancelBtn} onClick={() => handleCancel(b.id)}>
                      ยกเลิก
                    </button>
                  </div>
                )}
              </div>
            )
          })}
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
  body: { maxWidth: 600, margin: '0 auto', padding: '48px 24px' },
  heading: { fontSize: 22, fontWeight: 700, color: '#1a1a1a', margin: '0 0 24px' },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: {
    background: 'white', borderRadius: 12, padding: '20px 24px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 16, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 },
  date: { fontSize: 13, color: '#666', marginBottom: 2 },
  time: { fontSize: 13, color: '#666' },
  badge: {
    fontSize: 12, fontWeight: 600, padding: '4px 10px',
    borderRadius: 20, whiteSpace: 'nowrap'
  },
  cardBottom: {
    display: 'flex', alignItems: 'center', gap: 16,
    marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0'
  },
  link: { color: '#2d7a3e', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  pass: { fontSize: 12, color: '#888', flex: 1 },
  cancelBtn: {
    background: 'none', border: '1px solid #ffcccc', color: '#cc3333',
    padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer'
  },
  emptyBox: { textAlign: 'center', padding: '48px 0' },
  empty: { color: '#888', fontSize: 14, marginBottom: 16 },
  btnSm: {
    background: '#2d7a3e', color: 'white', border: 'none',
    padding: '10px 24px', borderRadius: 8, fontSize: 14,
    cursor: 'pointer', fontFamily: "'Sarabun', sans-serif"
  }
}

export default MyBookings