import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import Navbar from '../components/Navbar'

function MyBookings() {
  const navigate = useNavigate()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    fetchBookings()
  }, [])

  const fetchBookings = async () => {
    try {
      const res = await api.get('/bookings')
      setBookings(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async (id) => {
    if (!confirm('ยืนยันการยกเลิกการจองนี้?\n\nการยกเลิกจะคืนโควตา 1 ครั้ง')) return
    try {
      await api.delete(`/bookings/${id}`)
      fetchBookings()
    } catch (err) {
      alert('ยกเลิกไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  const formatDate = (iso) => new Date(iso).toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  const formatTime = (iso) => new Date(iso).toLocaleTimeString('th-TH', {
    hour: '2-digit', minute: '2-digit',
  })

  const statusLabel = (status) => ({
    confirmed: { text: 'กำลังจะมาถึง', color: '#2e7d32', bg: '#e8f5e9' },
    cancelled: { text: 'ยกเลิกแล้ว',    color: '#c62828', bg: '#ffebee' },
    completed: { text: 'เสร็จสิ้น',     color: '#666',    bg: '#f0f0f0' },
  }[status] || { text: status, color: '#888', bg: '#f5f5f5' })

  const stats = useMemo(() => ({
    total:     bookings.length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    completed: bookings.filter(b => b.status === 'completed').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length,
  }), [bookings])

  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter)

  const filters = [
    { key: 'all',       label: 'ทั้งหมด',     count: stats.total },
    { key: 'confirmed', label: 'กำลังจะมาถึง', count: stats.confirmed },
    { key: 'completed', label: 'เสร็จสิ้น',    count: stats.completed },
    { key: 'cancelled', label: 'ยกเลิก',       count: stats.cancelled },
  ]

  return (
    <div style={s.root}>
      <Navbar />

      <div style={s.body}>
        <div style={s.header}>
          <div>
            <h2 style={s.heading}>การจองของฉัน</h2>
            <p style={s.sub}>ประวัติการจองห้อง Zoom ทั้งหมดของคุณ</p>
          </div>
          <button style={s.newBtn} className="ku-new-btn" onClick={() => navigate('/book')}>
            + จองใหม่
          </button>
        </div>

        <div style={s.statsGrid}>
          <div style={s.statCard}>
            <span style={s.statNum}>{stats.total}</span>
            <span style={s.statLbl}>ทั้งหมด</span>
          </div>
          <div style={{ ...s.statCard, borderColor: '#c8e6c9' }}>
            <span style={{ ...s.statNum, color: '#2e7d32' }}>{stats.confirmed}</span>
            <span style={s.statLbl}>กำลังจะมาถึง</span>
          </div>
          <div style={{ ...s.statCard, borderColor: '#e0e0e0' }}>
            <span style={{ ...s.statNum, color: '#666' }}>{stats.completed}</span>
            <span style={s.statLbl}>เสร็จสิ้น</span>
          </div>
          <div style={{ ...s.statCard, borderColor: '#ffcdd2' }}>
            <span style={{ ...s.statNum, color: '#c62828' }}>{stats.cancelled}</span>
            <span style={s.statLbl}>ยกเลิก</span>
          </div>
        </div>

        <div style={s.filterRow}>
          {filters.map(f => (
            <button
              key={f.key}
              style={{
                ...s.filterBtn,
                ...(filter === f.key ? s.filterBtnActive : {}),
              }}
              className="ku-filter"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span style={{
                ...s.filterCount,
                ...(filter === f.key ? s.filterCountActive : {}),
              }}>{f.count}</span>
            </button>
          ))}
        </div>

        {loading && (
          <div style={s.loadingBox}>
            <div style={s.spinner} />
            <span>กำลังโหลด...</span>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={s.emptyBox}>
            <div style={s.emptyIcon}>📅</div>
            <p style={s.emptyTitle}>ยังไม่มีการจอง</p>
            <p style={s.emptyDesc}>เริ่มจองห้องประชุม Zoom ของคุณวันนี้</p>
            <button style={s.btnSm} className="ku-new-btn" onClick={() => navigate('/book')}>
              จองห้องเลย
            </button>
          </div>
        )}

        <div style={s.list}>
          {filtered.map(b => {
            const st = statusLabel(b.status)
            const isPast = new Date(b.end_time) < new Date()
            return (
              <div key={b.id} style={s.card} className="ku-booking-card">
                <div style={{ ...s.statusBar, background: st.color }} />
                <div style={s.cardInner}>
                  <div style={s.cardTop}>
                    <div style={{ flex: 1 }}>
                      <div style={s.titleRow}>
                        <h3 style={s.title}>{b.title}</h3>
                        <span style={{ ...s.badge, color: st.color, background: st.bg }}>
                          {st.text}
                        </span>
                      </div>
                      <div style={s.dateRow}>
                        <span style={s.dateIcon}>📅</span>
                        <span style={s.date}>{formatDate(b.start_time)}</span>
                      </div>
                      <div style={s.dateRow}>
                        <span style={s.dateIcon}>🕐</span>
                        <span style={s.time}>
                          {formatTime(b.start_time)} – {formatTime(b.end_time)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {b.status === 'confirmed' && !isPast && (
                    <div style={s.cardBottom}>
                      <a
                        href={b.zoom_join_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={s.zoomBtn}
                        className="ku-zoom-btn"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <rect x="3" y="6" width="14" height="12" rx="2" fill="white"/>
                          <path d="M17 10l4-2v8l-4-2v-4z" fill="white"/>
                        </svg>
                        เข้าร่วม Zoom
                      </a>
                      {b.zoom_password && (
                        <div style={s.passBox}>
                          <span style={s.passLabel}>รหัส</span>
                          <code style={s.passCode}>{b.zoom_password}</code>
                        </div>
                      )}
                      <button
                        style={s.cancelBtn}
                        className="ku-cancel"
                        onClick={() => handleCancel(b.id)}
                      >
                        ยกเลิก
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <style>{`
        .ku-new-btn { transition: transform 0.15s var(--ease), box-shadow 0.2s var(--ease); }
        .ku-new-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(13,61,24,0.25); }

        .ku-filter { transition: all 0.15s var(--ease); }
        .ku-filter:hover { background: #f1f8f1 !important; }

        .ku-booking-card { transition: transform 0.15s var(--ease), box-shadow 0.2s var(--ease); }
        .ku-booking-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(13,61,24,0.1) !important; }

        .ku-zoom-btn { transition: background 0.15s var(--ease), transform 0.15s var(--ease); }
        .ku-zoom-btn:hover { background: #134d20 !important; transform: translateY(-1px); }

        .ku-cancel { transition: background 0.15s var(--ease), color 0.15s var(--ease); }
        .ku-cancel:hover { background: #ffebee !important; color: #b71c1c !important; }
      `}</style>
    </div>
  )
}

const s = {
  root: { minHeight: '100vh', background: '#f4f6f4' },
  body: { maxWidth: 760, margin: '0 auto', padding: '40px 24px' },
  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 24, gap: 16,
  },
  heading: { fontSize: 26, fontWeight: 700, color: '#0d3d18', margin: 0 },
  sub: { fontSize: 13, color: '#888', margin: '6px 0 0' },
  newBtn: {
    background: 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%)',
    color: 'white', padding: '11px 22px', borderRadius: 10,
    fontSize: 14, fontWeight: 600,
    boxShadow: '0 4px 12px rgba(13, 61, 24, 0.2)',
  },
  statsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12, marginBottom: 24,
  },
  statCard: {
    background: 'white', border: '1px solid #e1e7e1', borderRadius: 12,
    padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 2,
  },
  statNum: { fontSize: 22, fontWeight: 700, color: '#1a1a1a', lineHeight: 1 },
  statLbl: { fontSize: 11, color: '#888', fontWeight: 500 },
  filterRow: {
    display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap',
  },
  filterBtn: {
    background: 'white', border: '1px solid #e1e7e1',
    padding: '8px 14px', borderRadius: 20,
    fontSize: 13, fontWeight: 500, color: '#666',
    display: 'flex', alignItems: 'center', gap: 8,
  },
  filterBtnActive: {
    background: 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%)',
    color: 'white', borderColor: '#1b5e20',
    boxShadow: '0 2px 8px rgba(13, 61, 24, 0.2)',
  },
  filterCount: {
    background: '#f1f8f1', color: '#666',
    fontSize: 11, fontWeight: 600,
    padding: '1px 8px', borderRadius: 10, minWidth: 20, textAlign: 'center',
  },
  filterCountActive: {
    background: 'rgba(255,255,255,0.25)', color: 'white',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: {
    background: 'white', borderRadius: 14, overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(13, 61, 24, 0.04), 0 1px 3px rgba(13, 61, 24, 0.04)',
    border: '1px solid #e1e7e1',
    display: 'flex',
  },
  statusBar: { width: 4, flexShrink: 0 },
  cardInner: { flex: 1, padding: '20px 22px' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  titleRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' },
  title: { fontSize: 16, fontWeight: 600, color: '#1a1a1a', margin: 0 },
  badge: {
    fontSize: 11, fontWeight: 600, padding: '4px 10px',
    borderRadius: 20, whiteSpace: 'nowrap', letterSpacing: 0.3,
  },
  dateRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 13, color: '#555', marginTop: 4,
  },
  dateIcon: { fontSize: 12 },
  date: { color: '#555' },
  time: { color: '#555', fontWeight: 500 },
  cardBottom: {
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0',
  },
  zoomBtn: {
    background: '#1b5e20', color: 'white',
    padding: '8px 16px', borderRadius: 8,
    fontSize: 13, fontWeight: 600,
    display: 'inline-flex', alignItems: 'center', gap: 8,
    textDecoration: 'none',
  },
  passBox: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: '#f5f5f5', padding: '6px 12px', borderRadius: 8,
  },
  passLabel: { fontSize: 11, color: '#888', fontWeight: 500 },
  passCode: {
    fontFamily: 'monospace', fontSize: 13,
    color: '#1a1a1a', fontWeight: 600, letterSpacing: 1,
  },
  cancelBtn: {
    marginLeft: 'auto', background: 'transparent',
    border: '1px solid #ffcdd2', color: '#c62828',
    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
  },
  emptyBox: {
    textAlign: 'center', padding: '60px 24px',
    background: 'white', borderRadius: 16,
    border: '1px dashed #c8e6c9',
  },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#1a1a1a', fontSize: 16, fontWeight: 600, margin: '0 0 6px' },
  emptyDesc: { color: '#888', fontSize: 13, margin: '0 0 20px' },
  btnSm: {
    background: 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%)',
    color: 'white', padding: '11px 24px', borderRadius: 10,
    fontSize: 14, fontWeight: 600,
    boxShadow: '0 4px 12px rgba(13, 61, 24, 0.2)',
  },
  loadingBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    padding: 60, color: '#888', fontSize: 14,
  },
  spinner: {
    width: 28, height: 28, borderRadius: '50%',
    border: '3px solid #e1e7e1', borderTopColor: '#2e7d32',
    animation: 'spin 0.8s linear infinite',
  },
}

export default MyBookings
