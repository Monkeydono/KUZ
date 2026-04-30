import { useState, useEffect } from 'react'
import api from '../api'
import Navbar from '../components/Navbar'

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8)
const DAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

function Calendar() {
  const today = new Date()

  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(today)
  const [bookedSlots, setBookedSlots] = useState([])
  const [loading, setLoading] = useState(false)

  const [modalHour, setModalHour] = useState(null)
  const [modalForm, setModalForm] = useState({ title: '', endTime: '' })
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState('')
  const [modalSuccess, setModalSuccess] = useState(false)

  useEffect(() => {
    fetchBookings(selectedDate)
  }, [selectedDate])

  const fetchBookings = async (date) => {
    setLoading(true)
    try {
      const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
      const res = await api.get(`/bookings/available?date=${dateStr}`)
      setBookedSlots(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getDaysInMonth = (date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    return { firstDay, daysInMonth }
  }

  const { firstDay, daysInMonth } = getDaysInMonth(currentDate)

  const isBooked = (hour) => {
    return bookedSlots.some(slot => {
      const start = new Date(slot.start_time)
      const end = new Date(slot.end_time)
      const slotStart = start.getHours() + start.getMinutes() / 60
      const slotEnd = end.getHours() + end.getMinutes() / 60
      return hour >= slotStart && hour < slotEnd
    })
  }

  const getSlotInfo = (hour) => {
    return bookedSlots.find(slot => {
      const start = new Date(slot.start_time)
      const end = new Date(slot.end_time)
      const slotStart = start.getHours() + start.getMinutes() / 60
      const slotEnd = end.getHours() + end.getMinutes() / 60
      return hour >= slotStart && hour < slotEnd
    })
  }

  const openModal = (hour) => {
    if (isBooked(hour)) return
    setModalHour(hour)
    setModalForm({ title: '', endTime: `${String(hour).padStart(2,'0')}:30` })
    setModalError('')
    setModalSuccess(false)
  }

  const closeModal = () => {
    setModalHour(null)
    setModalError('')
    setModalSuccess(false)
  }

  const submitBooking = async () => {
    setModalError('')
    if (!modalForm.title.trim()) {
      setModalError('กรุณากรอกหัวข้อการประชุม')
      return
    }
    if (!modalForm.endTime) {
      setModalError('กรุณาระบุเวลาสิ้นสุด')
      return
    }

    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}-${String(selectedDate.getDate()).padStart(2,'0')}`
    const startStr = `${String(modalHour).padStart(2,'0')}:00`
    const startTime = `${dateStr}T${startStr}:00+07:00`
    const endTime   = `${dateStr}T${modalForm.endTime}:00+07:00`

    try {
      setModalLoading(true)
      await api.post('/bookings', { title: modalForm.title, startTime, endTime })
      setModalSuccess(true)
      await fetchBookings(selectedDate)
      setTimeout(() => closeModal(), 1500)
    } catch (err) {
      setModalError(err.response?.data?.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setModalLoading(false)
    }
  }

  const isToday = (day) => {
    return today.getDate() === day &&
      today.getMonth() === currentDate.getMonth() &&
      today.getFullYear() === currentDate.getFullYear()
  }

  const isSelected = (day) => {
    return selectedDate.getDate() === day &&
      selectedDate.getMonth() === currentDate.getMonth() &&
      selectedDate.getFullYear() === currentDate.getFullYear()
  }

  const isPast = (day) => {
    const cellDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
    cellDate.setHours(23, 59, 59, 999)
    return cellDate < today && !isToday(day)
  }

  const totalBookedHours = bookedSlots.reduce((sum, slot) => {
    return sum + (new Date(slot.end_time) - new Date(slot.start_time)) / 3600000
  }, 0)
  const freeSlots = HOURS.filter(h => !isBooked(h)).length

  const calcModalDuration = () => {
    if (modalHour === null || !modalForm.endTime) return null
    const [eh, em] = modalForm.endTime.split(':').map(Number)
    const mins = (eh * 60 + em) - modalHour * 60
    return mins
  }
  const modalDuration = calcModalDuration()
  const modalOverLimit = modalDuration !== null && (modalDuration <= 0 || modalDuration > 40)

  return (
    <div style={s.root}>
      <Navbar />

      <div style={s.body}>
        <aside style={s.sidebar} className="fade-in">
          <div style={s.monthNav}>
            <button
              style={s.arrow}
              className="ku-arrow"
              onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()-1, 1))}
            >‹</button>
            <span style={s.monthLabel}>
              {MONTHS[currentDate.getMonth()]} <span style={s.year}>{currentDate.getFullYear() + 543}</span>
            </span>
            <button
              style={s.arrow}
              className="ku-arrow"
              onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()+1, 1))}
            >›</button>
          </div>

          <div style={s.grid}>
            {DAYS.map((d, i) => (
              <div key={d} style={{
                ...s.dayName,
                color: i === 0 || i === 6 ? '#c62828' : '#888'
              }}>{d}</div>
            ))}
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const past = isPast(day)
              return (
                <div
                  key={day}
                  style={{
                    ...s.dayCell,
                    ...(isSelected(day) ? s.selectedDay : {}),
                    ...(isToday(day) && !isSelected(day) ? s.todayCell : {}),
                    ...(past ? s.pastCell : {}),
                  }}
                  className="ku-day-cell"
                  onClick={() => setSelectedDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))}
                >
                  {day}
                  {isToday(day) && !isSelected(day) && <div style={s.todayDot} />}
                </div>
              )
            })}
          </div>

          <div style={s.statsBox}>
            <div style={s.statRow}>
              <span style={s.statLabel}>ช่วงเวลาว่าง</span>
              <span style={{ ...s.statValue, color: '#2e7d32' }}>{freeSlots} ชั่วโมง</span>
            </div>
            <div style={s.statRow}>
              <span style={s.statLabel}>มีการจอง</span>
              <span style={{ ...s.statValue, color: '#c62828' }}>
                {totalBookedHours.toFixed(1)} ชั่วโมง
              </span>
            </div>
          </div>

          <div style={s.legend}>
            <div style={s.legendRow}>
              <div style={{ ...s.legendDot, background: '#e8f5e9', border: '1.5px solid #c8e6c9' }} />
              <span>ช่วงเวลาว่าง</span>
            </div>
            <div style={s.legendRow}>
              <div style={{ ...s.legendDot, background: '#ffebee', border: '1.5px solid #ffcdd2' }} />
              <span>ถูกจองแล้ว</span>
            </div>
          </div>
        </aside>

        <main style={s.main} className="fade-in">
          <div style={s.mainHeader}>
            <div>
              <h2 style={s.mainTitle}>
                {selectedDate.getDate()} {MONTHS[selectedDate.getMonth()]} {selectedDate.getFullYear() + 543}
              </h2>
              <p style={s.mainSub}>
                <span style={s.dot} /> คลิกช่วงเวลาว่างเพื่อจองห้อง Zoom
              </p>
            </div>
          </div>

          <div style={s.timeline}>
            {loading ? (
              <div style={s.loadingBox}>
                <div style={s.spinner} />
                <span>กำลังโหลดข้อมูล...</span>
              </div>
            ) : (
              HOURS.map(hour => {
                const booked = isBooked(hour)
                const slot = getSlotInfo(hour)
                return (
                  <div
                    key={hour}
                    style={{
                      ...s.slot,
                      ...(booked ? s.slotBooked : s.slotFree),
                    }}
                    className={booked ? '' : 'ku-slot-free'}
                    onClick={() => openModal(hour)}
                  >
                    <div style={s.slotTimeBox}>
                      <span style={s.slotTime}>{String(hour).padStart(2,'0')}:00</span>
                    </div>
                    <div style={s.slotContent}>
                      {booked && slot ? (
                        <>
                          <div style={s.slotTitleBox}>
                            <span style={s.slotBadge}>จองแล้ว</span>
                            <span style={s.slotTitle}>{slot.title}</span>
                          </div>
                          <span style={s.slotDuration}>
                            {new Date(slot.start_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                            {' – '}
                            {new Date(slot.end_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </>
                      ) : (
                        <span style={s.slotAvail}>ว่าง - คลิกเพื่อจอง</span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </main>
      </div>

      {modalHour !== null && (
        <div style={s.overlay} onClick={closeModal}>
          <div style={s.modal} className="slide-in" onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <div>
                <h3 style={s.modalTitle}>จองห้องประชุม</h3>
                <p style={s.modalSub}>
                  {selectedDate.getDate()} {MONTHS[selectedDate.getMonth()]} {selectedDate.getFullYear() + 543}
                  {' · '}
                  เริ่ม {String(modalHour).padStart(2,'0')}:00
                </p>
              </div>
              <button style={s.closeBtn} className="ku-close" onClick={closeModal}>✕</button>
            </div>

            <div style={s.modalBody}>
              <div style={s.field}>
                <label style={s.label}>หัวข้อการประชุม <span style={s.req}>*</span></label>
                <input
                  style={s.input}
                  placeholder="เช่น ประชุมกลุ่มวิชา CPE"
                  value={modalForm.title}
                  onChange={e => setModalForm({ ...modalForm, title: e.target.value })}
                  maxLength={200}
                  autoFocus
                  disabled={modalSuccess}
                />
              </div>

              <div style={s.row}>
                <div style={{ ...s.field, flex: 1 }}>
                  <label style={s.label}>เวลาเริ่ม</label>
                  <div style={s.staticTime}>{String(modalHour).padStart(2,'0')}:00</div>
                </div>
                <div style={{ ...s.field, flex: 1 }}>
                  <label style={s.label}>เวลาสิ้นสุด <span style={s.req}>*</span></label>
                  <input
                    style={s.input}
                    type="time"
                    value={modalForm.endTime}
                    min={`${String(modalHour).padStart(2,'0')}:00`}
                    max={`${String(modalHour).padStart(2,'0')}:40`}
                    onChange={e => setModalForm({ ...modalForm, endTime: e.target.value })}
                    disabled={modalSuccess}
                  />
                </div>
              </div>

              {modalDuration !== null && (
                <div style={{
                  ...s.durationBox,
                  background: modalOverLimit ? '#fff0f0' : '#f1f8f1',
                  color: modalOverLimit ? '#c62828' : '#2e7d32',
                  borderColor: modalOverLimit ? '#ffcccc' : '#c8e6c9',
                }}>
                  <span style={{ fontWeight: 600 }}>ระยะเวลา:</span>
                  <span>{modalDuration} นาที</span>
                  {modalOverLimit && (
                    <span style={s.warnTag}>
                      {modalDuration <= 0 ? 'เวลาไม่ถูกต้อง' : 'เกิน 40 นาที'}
                    </span>
                  )}
                </div>
              )}

              {modalError && (
                <div style={s.error}>
                  <span style={s.errIcon}>⚠</span>
                  <span>{modalError}</span>
                </div>
              )}

              {modalSuccess && (
                <div style={s.success}>
                  <div style={s.successCheck}>✓</div>
                  <div>
                    <strong>จองสำเร็จ!</strong>
                    <p style={s.successText}>กรุณาตรวจสอบอีเมลของคุณ</p>
                  </div>
                </div>
              )}
            </div>

            <div style={s.modalFooter}>
              <button
                style={s.cancelBtn}
                className="ku-cancel-btn"
                onClick={closeModal}
                disabled={modalLoading}
              >
                ยกเลิก
              </button>
              <button
                style={{
                  ...s.confirmBtn,
                  opacity: modalLoading || modalOverLimit || modalSuccess ? 0.6 : 1,
                }}
                className="ku-confirm-btn"
                onClick={submitBooking}
                disabled={modalLoading || modalOverLimit || modalSuccess}
              >
                {modalLoading ? (
                  <>
                    <div style={s.btnSpinner} />
                    <span>กำลังจอง...</span>
                  </>
                ) : (
                  <span>ยืนยันการจอง</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .ku-arrow {
          transition: background 0.15s var(--ease), color 0.15s var(--ease);
        }
        .ku-arrow:hover {
          background: var(--ku-green-100);
          color: var(--ku-green-800);
        }
        .ku-day-cell {
          transition: background 0.15s var(--ease), transform 0.15s var(--ease);
        }
        .ku-day-cell:hover:not([data-past]) {
          background: var(--ku-green-100);
        }
        .ku-slot-free {
          transition: transform 0.15s var(--ease), box-shadow 0.2s var(--ease), border-color 0.15s var(--ease);
        }
        .ku-slot-free:hover {
          transform: translateX(4px);
          border-color: #2e7d32 !important;
          box-shadow: 0 4px 16px rgba(46, 125, 50, 0.15);
        }
        .ku-close {
          transition: background 0.15s var(--ease), color 0.15s var(--ease);
        }
        .ku-close:hover {
          background: #f5f5f5;
          color: #c62828;
        }
        .ku-cancel-btn {
          transition: background 0.15s var(--ease);
        }
        .ku-cancel-btn:hover:not(:disabled) {
          background: #f5f5f5;
        }
        .ku-confirm-btn {
          transition: transform 0.15s var(--ease), box-shadow 0.2s var(--ease);
        }
        .ku-confirm-btn:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(13, 61, 24, 0.3);
        }
      `}</style>
    </div>
  )
}

const s = {
  root: { minHeight: '100vh', background: '#f4f6f4' },
  body: { display: 'flex', minHeight: 'calc(100vh - 68px)' },
  sidebar: {
    width: 320, background: 'white', padding: '28px 24px',
    borderRight: '1px solid #e1e7e1', display: 'flex',
    flexDirection: 'column', gap: 24,
  },
  monthNav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  arrow: {
    background: '#f1f8f1', width: 32, height: 32, borderRadius: 8,
    fontSize: 20, color: '#2e7d32', fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  monthLabel: { fontSize: 16, fontWeight: 600, color: '#1b5e20' },
  year: { color: '#888', fontWeight: 500, fontSize: 14, marginLeft: 4 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 },
  dayName: { textAlign: 'center', fontSize: 11, fontWeight: 600, padding: '6px 0', textTransform: 'uppercase', letterSpacing: 0.5 },
  dayCell: {
    textAlign: 'center', padding: '9px 0', borderRadius: 8,
    fontSize: 13, cursor: 'pointer', color: '#333', fontWeight: 500,
    position: 'relative',
  },
  selectedDay: {
    background: 'linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%)',
    color: 'white', fontWeight: 700,
    boxShadow: '0 2px 8px rgba(46, 125, 50, 0.3)',
  },
  todayCell: { background: '#fdf6dc', color: '#1b5e20', fontWeight: 700 },
  pastCell: { color: '#ccc', cursor: 'pointer' },
  todayDot: {
    position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)',
    width: 4, height: 4, borderRadius: '50%', background: '#c9a227',
  },
  statsBox: {
    background: '#f1f8f1', borderRadius: 12, padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  statRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  statLabel: { fontSize: 12, color: '#666' },
  statValue: { fontSize: 13, fontWeight: 600 },
  legend: { display: 'flex', flexDirection: 'column', gap: 10 },
  legendRow: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#555' },
  legendDot: { width: 16, height: 16, borderRadius: 5 },
  main: { flex: 1, padding: '32px 40px', overflowY: 'auto' },
  mainHeader: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 28, gap: 16,
  },
  mainTitle: {
    fontSize: 24, fontWeight: 700, color: '#0d3d18',
    margin: 0, letterSpacing: '-0.5px',
  },
  mainSub: {
    fontSize: 13, color: '#888', margin: '6px 0 0',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  dot: { display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#43a047' },
  timeline: { display: 'flex', flexDirection: 'column', gap: 8 },
  slot: {
    display: 'flex', alignItems: 'stretch',
    borderRadius: 12, overflow: 'hidden',
    border: '1.5px solid', minHeight: 64,
  },
  slotFree: { background: '#f1f8f1', borderColor: '#c8e6c9', cursor: 'pointer' },
  slotBooked: { background: '#fff5f5', borderColor: '#ffcdd2', cursor: 'default' },
  slotTimeBox: {
    width: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRight: '1.5px solid currentColor', borderColor: 'inherit',
    background: 'rgba(255,255,255,0.5)',
  },
  slotTime: { fontSize: 15, fontWeight: 700, color: '#1b5e20' },
  slotContent: {
    flex: 1, padding: '12px 20px',
    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4,
  },
  slotTitleBox: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  slotBadge: {
    background: '#c62828', color: 'white',
    fontSize: 10, fontWeight: 700, padding: '2px 8px',
    borderRadius: 10, letterSpacing: 0.5,
  },
  slotTitle: { fontSize: 14, fontWeight: 600, color: '#c62828' },
  slotDuration: { fontSize: 12, color: '#a64545' },
  slotAvail: {
    fontSize: 13, color: '#388e3c', fontWeight: 500,
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

  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(13, 61, 24, 0.45)',
    backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, padding: 20,
    animation: 'fadeIn 0.2s var(--ease)',
  },
  modal: {
    background: 'white', borderRadius: 18, width: '100%', maxWidth: 480,
    boxShadow: '0 24px 60px rgba(13, 61, 24, 0.35), 0 8px 24px rgba(13, 61, 24, 0.15)',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '24px 28px 20px',
    borderBottom: '1px solid #f0f0f0',
  },
  modalTitle: { fontSize: 20, fontWeight: 700, color: '#0d3d18', margin: 0 },
  modalSub: { fontSize: 13, color: '#666', margin: '4px 0 0' },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8, fontSize: 16,
    color: '#888', background: 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modalBody: { padding: '20px 28px' },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 8 },
  req: { color: '#c62828' },
  input: {
    width: '100%', padding: '12px 14px',
    border: '1.5px solid #dde3dd', borderRadius: 10,
    fontSize: 14, background: '#fff',
  },
  staticTime: {
    padding: '12px 14px', border: '1.5px solid #dde3dd', borderRadius: 10,
    fontSize: 14, background: '#f9faf9', color: '#555', fontWeight: 600,
  },
  row: { display: 'flex', gap: 12 },
  durationBox: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 14px', borderRadius: 10, border: '1px solid',
    fontSize: 13, marginTop: 4,
  },
  warnTag: {
    marginLeft: 'auto', background: '#c62828', color: 'white',
    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
  },
  error: {
    background: '#fff0f0', border: '1px solid #ffcccc', color: '#cc3333',
    padding: '12px 14px', borderRadius: 10, fontSize: 13,
    marginTop: 12, display: 'flex', alignItems: 'center', gap: 10,
  },
  errIcon: { fontSize: 16 },
  success: {
    background: 'linear-gradient(135deg, #f1f8f1 0%, #e8f5e9 100%)',
    border: '1px solid #b3dfc0', color: '#1b5e20',
    padding: '14px 16px', borderRadius: 12, fontSize: 13,
    marginTop: 12, display: 'flex', alignItems: 'center', gap: 14,
  },
  successCheck: {
    width: 30, height: 30, borderRadius: '50%',
    background: '#2e7d32', color: 'white',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 15, fontWeight: 700, flexShrink: 0,
    animation: 'pulseGlow 1.5s var(--ease) infinite',
  },
  successText: { fontSize: 12, color: '#2d7a3e', margin: '2px 0 0' },
  modalFooter: {
    display: 'flex', gap: 10, padding: '16px 28px 24px',
    borderTop: '1px solid #f0f0f0',
  },
  cancelBtn: {
    flex: 1, padding: '12px 0',
    border: '1.5px solid #dde3dd', borderRadius: 10,
    fontSize: 14, fontWeight: 600, color: '#666',
    background: 'white',
  },
  confirmBtn: {
    flex: 2, padding: '12px 0',
    background: 'linear-gradient(135deg, #1b5e20 0%, #134d20 100%)',
    color: 'white', borderRadius: 10,
    fontSize: 14, fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    boxShadow: '0 4px 14px rgba(13, 61, 24, 0.25)',
  },
  btnSpinner: {
    width: 14, height: 14, borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white',
    animation: 'spin 0.6s linear infinite',
  },
}

export default Calendar
