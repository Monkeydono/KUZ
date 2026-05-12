import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Calendar, Clock, CalendarX2, AlertCircle, X, Users as UsersIcon } from 'lucide-react'
import api from '../api'
import Navbar from '../components/Navbar'

function MyBookings() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const focusBookingId = searchParams.get('bookingId')
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [confirmBooking, setConfirmBooking] = useState(null)
  const [cancelScope, setCancelScope] = useState('this')
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const focusRef = useRef(null)
  const [highlightId, setHighlightId] = useState(focusBookingId)

  useEffect(() => {
    fetchBookings()
  }, [])

  // sync เมื่อ URL ?bookingId= เปลี่ยน (คลิก notification ตัวอื่นทั้งที่อยู่หน้านี้)
  useEffect(() => {
    if (focusBookingId) setHighlightId(focusBookingId)
  }, [focusBookingId])

  // scroll → highlight booking จาก ?bookingId= (มาจาก notification click)
  useEffect(() => {
    if (!highlightId || loading) return
    const timer = setTimeout(() => {
      if (focusRef.current) {
        focusRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 150)
    const fade = setTimeout(() => setHighlightId(null), 4000)
    return () => { clearTimeout(timer); clearTimeout(fade) }
  }, [highlightId, loading, bookings])

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

  const handleCancel = (booking) => {
    setCancelError('')
    setCancelScope('this')
    setConfirmBooking(booking)
  }

  const closeConfirm = () => {
    if (cancelLoading) return
    setConfirmBooking(null)
    setCancelError('')
  }

  const doCancel = async () => {
    setCancelError('')
    setCancelLoading(true)
    try {
      await api.delete(`/bookings/${confirmBooking.id}?scope=${cancelScope}`)
      setConfirmBooking(null)
      await fetchBookings()
    } catch (err) {
      setCancelError(err.response?.data?.error || 'ยกเลิกไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setCancelLoading(false)
    }
  }

  const formatDate = (iso) => new Date(iso).toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Bangkok',
  })

  const formatTime = (iso) => new Date(iso).toLocaleTimeString('th-TH', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok',
  })

  const statusLabel = (status) => ({
    confirmed:        { text: 'กำลังจะมาถึง',  color: '#1FBA7C', bg: '#D9F5E7' },
    pending_approval: { text: 'รออนุมัติ',     color: '#b45309', bg: '#fef3c7' },
    cancelled:        { text: 'ยกเลิกแล้ว',    color: '#c62828', bg: '#ffebee' },
    completed:        { text: 'เสร็จสิ้น',     color: '#666',    bg: '#f0f0f0' },
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
        <button style={s.backBtn} onClick={() => navigate('/calendar')} className="ku-back">
          กลับไปหน้าปฏิทิน
        </button>

        <div style={s.header}>
          <div>
            <h2 style={s.heading}>การจองของฉัน</h2>
          </div>
        </div>

        <div style={s.statsGrid}>
          <div style={s.statCard}>
            <span style={s.statNum}>{stats.total}</span>
            <span style={s.statLbl}>ทั้งหมด</span>
          </div>
          <div style={{ ...s.statCard, borderColor: '#B5E8D2' }}>
            <span style={{ ...s.statNum, color: '#1FBA7C' }}>{stats.confirmed}</span>
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
            <div style={s.emptyIcon}><CalendarX2 size={48} strokeWidth={1.5} /></div>
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
            const isFocus = highlightId === b.id
            return (
              <div
                key={b.id}
                ref={isFocus ? focusRef : null}
                style={{
                  ...s.card,
                  ...(isFocus ? { boxShadow: '0 0 0 3px #fde68a, 0 8px 24px rgba(180, 83, 9, 0.25)' } : {}),
                  transition: 'box-shadow 0.5s',
                }}
                className="ku-booking-card"
              >
                <div style={{ ...s.statusBar, background: st.color }} />
                <div style={s.cardInner}>
                  <div style={s.cardTop}>
                    <div style={{ flex: 1 }}>
                      <div style={s.titleRow}>
                        <h3 style={s.title}>{b.title}</h3>
                        <span style={{ ...s.badge, color: st.color, background: st.bg }}>
                          {st.text}
                        </span>
                        {b.is_co_host && (
                          <span style={{ ...s.badge, color: '#0369a1', background: '#e0f2fe' }}>
                            Co-host
                          </span>
                        )}
                      </div>
                      {b.is_co_host && (
                        <div style={{ ...s.dateRow, color: '#888', fontSize: 12 }}>
                          ผู้จอง: {b.owner_name} ({b.owner_email})
                        </div>
                      )}
                      <div style={s.dateRow}>
                        <Calendar size={14} style={s.dateIcon} />
                        <span style={s.date}>{formatDate(b.start_time)}</span>
                      </div>
                      <div style={s.dateRow}>
                        <Clock size={14} style={s.dateIcon} />
                        <span style={s.time}>
                          {formatTime(b.start_time)} – {formatTime(b.end_time)}
                        </span>
                      </div>
                      {b.room_name && (
                        <div style={s.dateRow}>
                          <UsersIcon size={14} style={s.dateIcon} />
                          <span style={s.time}>
                            {b.room_name} · {b.room_capacity} คน
                          </span>
                        </div>
                      )}
                      {b.notes && (
                        <div style={{
                          marginTop: 8, padding: '8px 10px', borderRadius: 8,
                          background: '#fafbfa', border: '1px solid #e6ebe6',
                          fontSize: 12, color: '#555', lineHeight: 1.5,
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}>
                          <span style={{ fontWeight: 600, color: '#888' }}>หมายเหตุ: </span>
                          {b.notes}
                        </div>
                      )}
                    </div>
                  </div>

                  {b.status === 'confirmed' && !isPast && (
                    <div style={s.cardBottom}>
                      <button
                        onClick={() => navigate(`/join/${b.id}`)}
                        style={s.zoomBtn}
                        className="ku-zoom-btn"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <rect x="3" y="6" width="14" height="12" rx="2" fill="white"/>
                          <path d="M17 10l4-2v8l-4-2v-4z" fill="white"/>
                        </svg>
                        เข้าร่วม Zoom
                      </button>
                      {b.zoom_password && (
                        <div style={s.passBox}>
                          <span style={s.passLabel}>รหัส</span>
                          <code style={s.passCode}>{b.zoom_password}</code>
                        </div>
                      )}
                      {!b.is_co_host && (
                        <button
                          style={s.cancelBtn}
                          className="ku-cancel"
                          onClick={() => handleCancel(b)}
                        >
                          ยกเลิก
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {confirmBooking && (
        <div style={s.overlay} onClick={closeConfirm}>
          <div style={s.confirmModal} className="slide-in" onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>ยืนยันการยกเลิก</h3>
              <button style={s.closeBtn} onClick={closeConfirm} disabled={cancelLoading}>
                <X size={18} />
              </button>
            </div>
            <div style={s.modalBody}>
              <p style={s.modalText}>
                ยกเลิกการจอง <strong>{confirmBooking.title}</strong>?<br />
                <span style={s.modalSubText}>การยกเลิกจะคืนโควตา</span>
              </p>
              {confirmBooking.series_id && (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, color: '#888', textAlign: 'center' }}>
                    การจองนี้เป็นส่วนหนึ่งของชุด — เลือกขอบเขต
                  </div>
                  {[
                    { v: 'this',   label: 'เฉพาะครั้งนี้' },
                    { v: 'future', label: 'ครั้งนี้และอนาคต' },
                    { v: 'all',    label: 'ทั้งหมดของชุด (ที่ยังไม่เริ่ม)' },
                  ].map(opt => (
                    <label
                      key={opt.v}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', borderRadius: 8,
                        border: `1.5px solid ${cancelScope === opt.v ? '#03A96B' : '#e1e7e1'}`,
                        background: cancelScope === opt.v ? '#F0FBF6' : 'white',
                        cursor: 'pointer', fontSize: 13,
                      }}
                    >
                      <input
                        type="radio"
                        name="scope"
                        value={opt.v}
                        checked={cancelScope === opt.v}
                        onChange={e => setCancelScope(e.target.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              )}
              {cancelError && (
                <div style={s.modalError}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{cancelError}</span>
                </div>
              )}
            </div>
            <div style={s.modalFooter}>
              <button
                style={s.modalCancelBtn}
                onClick={closeConfirm}
                disabled={cancelLoading}
              >
                ไม่ใช่
              </button>
              <button
                style={{ ...s.modalConfirmBtn, opacity: cancelLoading ? 0.6 : 1 }}
                onClick={doCancel}
                disabled={cancelLoading}
              >
                {cancelLoading ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}
              </button>
            </div>
          </div>
        </div>
      )}

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

        .ku-new-btn { transition: transform 0.15s var(--ease), box-shadow 0.2s var(--ease); }
        .ku-new-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(13,61,24,0.25); }

        .ku-filter { transition: all 0.15s var(--ease); }
        .ku-filter:hover { background: #F0FBF6 !important; }

        .ku-booking-card { transition: transform 0.15s var(--ease), box-shadow 0.2s var(--ease); }
        .ku-booking-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(13,61,24,0.1) !important; }

        .ku-zoom-btn { transition: background 0.15s var(--ease), transform 0.15s var(--ease); }
        .ku-zoom-btn:hover { background: #028152 !important; transform: translateY(-1px); }

        .ku-cancel { transition: background 0.15s var(--ease), color 0.15s var(--ease); }
        .ku-cancel:hover { background: #ffebee !important; color: #b71c1c !important; }
      `}</style>
    </div>
  )
}

const s = {
  root: { minHeight: '100vh', background: '#f4f6f4' },
  body: { maxWidth: 760, margin: '0 auto', padding: '40px 24px' },
  backBtn: {
    color: '#03A96B', fontSize: 13, fontWeight: 600, marginBottom: 16,
    padding: '9px 18px', display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'white',
    border: '1.5px solid #B5E8D2',
    borderRadius: 10,
    boxShadow: '0 2px 6px rgba(1, 74, 50, 0.06)',
  },
  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 24, gap: 16,
  },
  heading: { fontSize: 26, fontWeight: 700, color: '#014A32', margin: 0 },
  sub: { fontSize: 13, color: '#888', margin: '6px 0 0' },
  newBtn: {
    background: 'linear-gradient(135deg, #03A96B 0%, #1FBA7C 100%)',
    color: 'white', padding: '11px 22px', borderRadius: 10,
    fontSize: 14, fontWeight: 600,
    boxShadow: '0 4px 12px rgba(1, 74, 50, 0.2)',
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
    background: 'linear-gradient(135deg, #03A96B 0%, #1FBA7C 100%)',
    color: 'white', borderColor: '#03A96B',
    boxShadow: '0 2px 8px rgba(1, 74, 50, 0.2)',
  },
  filterCount: {
    background: '#F0FBF6', color: '#666',
    fontSize: 11, fontWeight: 600,
    padding: '1px 8px', borderRadius: 10, minWidth: 20, textAlign: 'center',
  },
  filterCountActive: {
    background: 'rgba(255,255,255,0.25)', color: 'white',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: {
    background: 'white', borderRadius: 14, overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(1, 74, 50, 0.04), 0 1px 3px rgba(1, 74, 50, 0.04)',
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
  dateIcon: { color: '#888', flexShrink: 0 },
  date: { color: '#555' },
  time: { color: '#555', fontWeight: 500 },
  cardBottom: {
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0',
  },
  zoomBtn: {
    background: '#03A96B', color: 'white',
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
    border: '1px dashed #B5E8D2',
  },
  emptyIcon: {
    color: '#88E0BB', marginBottom: 16,
    display: 'flex', justifyContent: 'center',
  },
  emptyTitle: { color: '#1a1a1a', fontSize: 16, fontWeight: 600, margin: '0 0 6px' },
  emptyDesc: { color: '#888', fontSize: 13, margin: '0 0 20px' },
  btnSm: {
    background: 'linear-gradient(135deg, #03A96B 0%, #1FBA7C 100%)',
    color: 'white', padding: '11px 24px', borderRadius: 10,
    fontSize: 14, fontWeight: 600,
    boxShadow: '0 4px 12px rgba(1, 74, 50, 0.2)',
  },
  loadingBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    padding: 60, color: '#888', fontSize: 14,
  },
  spinner: {
    width: 28, height: 28, borderRadius: '50%',
    border: '3px solid #e1e7e1', borderTopColor: '#1FBA7C',
    animation: 'spin 0.8s linear infinite',
  },
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(1, 74, 50, 0.45)',
    backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, padding: 20,
    animation: 'fadeIn 0.2s var(--ease)',
  },
  confirmModal: {
    background: 'white', borderRadius: 18, width: '100%', maxWidth: 420,
    boxShadow: '0 24px 60px rgba(1, 74, 50, 0.35), 0 8px 24px rgba(1, 74, 50, 0.15)',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0',
  },
  modalTitle: { fontSize: 18, fontWeight: 700, color: '#014A32', margin: 0 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8,
    color: '#888', background: 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modalBody: { padding: '20px 24px' },
  modalText: { fontSize: 14, color: '#333', margin: 0, lineHeight: 1.6 },
  modalSubText: { fontSize: 12, color: '#888' },
  modalError: {
    marginTop: 12,
    background: '#fff0f0', border: '1px solid #ffcccc', color: '#cc3333',
    padding: '10px 12px', borderRadius: 10, fontSize: 13,
    display: 'flex', alignItems: 'center', gap: 8,
  },
  modalFooter: {
    display: 'flex', gap: 10, padding: '12px 24px 20px',
    borderTop: '1px solid #f0f0f0',
  },
  modalCancelBtn: {
    flex: 1, padding: '11px 0',
    border: '1.5px solid #dde3dd', borderRadius: 10,
    fontSize: 14, fontWeight: 600, color: '#666',
    background: 'white',
  },
  modalConfirmBtn: {
    flex: 1, padding: '11px 0',
    background: '#c62828', color: 'white', borderRadius: 10,
    fontSize: 14, fontWeight: 600,
  },
}

export default MyBookings
