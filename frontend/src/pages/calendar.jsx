import { useState, useEffect, useMemo } from 'react'
import { AlertCircle, Check, X } from 'lucide-react'
import api from '../api'
import { useUser } from '../useUser'
import { useIsMobile } from '../useIsMobile'
import Navbar from '../components/Navbar'

const FIRST_HOUR = 8
const LAST_HOUR = 24
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => i + FIRST_HOUR)
const PX_PER_HOUR = 64
const TOP_PAD = 14
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

function Calendar() {
  const { user, isAdmin } = useUser()
  const role = user?.role || 'student'
  const canPickPriorityRoom = role === 'admin' || role === 'priority'
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const today = new Date()

  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(today)
  const [bookedSlots, setBookedSlots] = useState([])
  const [loading, setLoading] = useState(false)

  const [rooms, setRooms] = useState([])
  // group rooms by capacity tier (Pro plan ในอนาคตจะมีหลายห้อง/tier → ดึง count มาแสดง)
  const tiers = useMemo(() => {
    const map = new Map()
    for (const r of rooms) {
      if (r.is_priority_only && !canPickPriorityRoom) continue
      const t = map.get(r.capacity) || {
        capacity: r.capacity, total: 0, anyReady: false, anyZoomAccount: false,
      }
      t.total += 1
      if (!r.needs_zoom_pro) t.anyReady = true
      if (r.has_zoom_account) t.anyZoomAccount = true
      map.set(r.capacity, t)
    }
    return Array.from(map.values()).sort((a, b) => a.capacity - b.capacity)
  }, [rooms, canPickPriorityRoom])

  const [selectedCapacity, setSelectedCapacity] = useState(null)
  const selectedTier = tiers.find(t => t.capacity === selectedCapacity) || null
  const [totalRooms, setTotalRooms] = useState(0)

  const [modalHour, setModalHour] = useState(null)
  const [modalForm, setModalForm] = useState({
    title: '', startTime: '', endTime: '', coHosts: '', notes: '',
    recurringEnabled: false, recurringFreq: 'weekly', recurringCount: 4,
  })
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState('')
  const [modalSuccess, setModalSuccess] = useState(false)

  // โหลด room list ครั้งเดียวตอน mount + default เลือก tier แรกที่ใช้งานได้
  useEffect(() => {
    api.get('/bookings/rooms')
      .then(res => setRooms(res.data || []))
      .catch(err => console.error('fetch rooms failed:', err))
  }, [])

  // default-select tier แรกที่พร้อมใช้ (capacity น้อยสุด)
  useEffect(() => {
    if (selectedCapacity == null && tiers.length > 0) {
      const firstReady = tiers.find(t => t.anyReady)
      if (firstReady) setSelectedCapacity(firstReady.capacity)
    }
  }, [tiers, selectedCapacity])

  useEffect(() => {
    if (selectedCapacity != null) fetchBookings(selectedDate)
  }, [selectedDate, selectedCapacity])

  const fetchBookings = async (date) => {
    setLoading(true)
    try {
      const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
      const res = await api.get('/bookings/available', {
        params: { date: dateStr, capacity: selectedCapacity },
      })
      setBookedSlots(res.data.bookings || [])
      setTotalRooms(res.data.total_rooms || 0)
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

  const slotToHours = (slot) => {
    const start = new Date(slot.start_time)
    const end = new Date(slot.end_time)
    return [
      start.getHours() + start.getMinutes() / 60,
      end.getHours() + end.getMinutes() / 60,
    ]
  }

  // นับจำนวน booking ที่ overlap [startHour, endHour) — รองรับ Pro plan ที่มีหลายห้อง/tier
  const countBookingsOverlap = (startHour, endHour) => bookedSlots.filter(slot => {
    const [s, e] = slotToHours(slot)
    return s < endHour && e > startHour
  }).length

  // slot เต็มเมื่อทุกห้องใน tier ถูกจอง (Free plan: total=1 → ใครจองก็เต็ม / Pro plan: ต้องครบ N)
  // หา "fully covered" = booking ครอบทั้ง [hour, hour+1) — นับเฉพาะตัวที่ครอบเต็ม
  const isHourFullyBooked = (hour) => {
    if (totalRooms <= 0) return false
    const fullyCovered = bookedSlots.filter(slot => {
      const [s, e] = slotToHours(slot)
      return s <= hour && e >= hour + 1
    }).length
    return fullyCovered >= totalRooms
  }

  // กระแสเดิมที่เคยใช้ overlapsBooking → เปลี่ยนเป็นนับ vs totalRooms
  const overlapsBooking = (startHour, endHour) => countBookingsOverlap(startHour, endHour) >= totalRooms

  const floatToHHMM = (f) => {
    const h = Math.floor(f)
    const m = Math.round((f - h) * 60)
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
  }

  const openModal = (hour) => {
    if (isHourFullyBooked(hour)) return

    // Free plan (1 ห้อง/tier): จำกัด earliest/latest โดยอิง booking ที่มี
    // Pro plan (หลายห้อง): ยังเหลือห้องอยู่ → ให้จองทั้งช่วง hour..hour+1 ได้เลย
    let earliest = hour
    let latestEnd = hour + 1
    if (totalRooms <= 1) {
      bookedSlots.forEach(slot => {
        const [s, e] = slotToHours(slot)
        if (s < hour + 1 && e > hour && e > earliest) earliest = e
      })
      if (earliest > hour) earliest += 1 / 60
      earliest = Math.ceil(earliest * 12) / 12
      if (earliest >= hour + 1) return

      bookedSlots.forEach(slot => {
        const [s] = slotToHours(slot)
        if (s >= earliest && s < latestEnd) latestEnd = s
      })
    }
    // default duration: Pro=30นาที, Free=ใช้เต็ม 40นาที (max)
    const maxBlock = selectedTier?.anyZoomAccount ? 1 : 40 / 60
    const defaultEnd = Math.min(earliest + 0.5, latestEnd, earliest + maxBlock)

    setModalHour(hour)
    setModalForm({
      title: '',
      startTime: floatToHHMM(earliest),
      endTime: floatToHHMM(defaultEnd),
      coHosts: '',
      notes: '',
      recurringEnabled: false, recurringFreq: 'weekly', recurringCount: 4,
    })
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
    if (!modalForm.startTime || !modalForm.endTime) {
      setModalError('กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด')
      return
    }
    if (modalForm.startTime < '08:00' || modalForm.startTime > '23:59' ||
        modalForm.endTime   < '08:00' || modalForm.endTime   > '23:59') {
      setModalError('เวลาจองอนุญาตเฉพาะ 08:00 - 24:00')
      return
    }
    // ห้อง Pro plan (capacity > 100) ต้องระบุเหตุผล
    if (selectedTier && selectedTier.capacity > 100 && !isAdmin && !modalForm.notes.trim()) {
      setModalError(`กรุณาระบุเหตุผลการจอง — ห้อง ${selectedTier.capacity} คนต้องรออนุมัติ`)
      return
    }

    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}-${String(selectedDate.getDate()).padStart(2,'0')}`
    const startTime = `${dateStr}T${modalForm.startTime}:00+07:00`
    const endTime   = `${dateStr}T${modalForm.endTime}:00+07:00`
    const coHostEmails = modalForm.coHosts
      .split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)

    try {
      setModalLoading(true)
      const payload = { title: modalForm.title, startTime, endTime, coHostEmails }
      if (selectedCapacity != null) payload.capacity = selectedCapacity
      if (modalForm.notes.trim()) payload.notes = modalForm.notes.trim()
      if (modalForm.recurringEnabled && modalForm.recurringCount > 1) {
        payload.recurring = {
          freq: modalForm.recurringFreq,
          count: parseInt(modalForm.recurringCount, 10),
        }
      }
      await api.post('/bookings', payload)
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

  const todayStart = new Date(today)
  todayStart.setHours(0, 0, 0, 0)
  const maxBookableDate = new Date(todayStart)
  maxBookableDate.setDate(todayStart.getDate() + 30)

  const isBookable = (day) => {
    const cellDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
    cellDate.setHours(0, 0, 0, 0)
    if (cellDate < todayStart) return false
    // admin จองล่วงหน้าได้ไม่จำกัด, student จำกัด 30 วัน
    return isAdmin || cellDate <= maxBookableDate
  }

  const totalBookedHours = bookedSlots.reduce((sum, slot) => {
    return sum + (new Date(slot.end_time) - new Date(slot.start_time)) / 3600000
  }, 0)
  const freeSlots = HOURS.slice(0, -1).filter(h => !overlapsBooking(h, h + 1)).length

  const isViewingToday = selectedDate.toDateString() === today.toDateString()
  const nowHourFloat = today.getHours() + today.getMinutes() / 60
  const showNow = isViewingToday && nowHourFloat >= FIRST_HOUR && nowHourFloat <= LAST_HOUR

  const calcModalDuration = () => {
    if (!modalForm.startTime || !modalForm.endTime) return null
    const [sh, sm] = modalForm.startTime.split(':').map(Number)
    const [eh, em] = modalForm.endTime.split(':').map(Number)
    return (eh * 60 + em) - (sh * 60 + sm)
  }
  const modalDuration = calcModalDuration()
  // ห้อง Pro plan ไม่จำกัด 40 นาที — Free plan จำกัด
  const maxDurationMin = selectedTier?.anyZoomAccount ? 24 * 60 : 40
  const modalOverLimit = modalDuration !== null && (modalDuration <= 0 || modalDuration > maxDurationMin)
  // ห้อง Pro plan ห้ามจอง recurring (กัน flood approval queue)
  const recurringBlocked = selectedTier && selectedTier.capacity > 100 && !isAdmin
  const needsApproval = selectedTier && selectedTier.capacity > 100 && !isAdmin

  const modalSeriesPreview = (() => {
    if (!modalForm.recurringEnabled) return null
    const count = parseInt(modalForm.recurringCount, 10)
    if (!count || count < 2 || !modalForm.startTime) return null
    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}-${String(selectedDate.getDate()).padStart(2,'0')}`
    const base = new Date(`${dateStr}T${modalForm.startTime}:00+07:00`)
    if (isNaN(base)) return null
    const intervalMs = (modalForm.recurringFreq === 'daily' ? 1 : 7) * 24 * 60 * 60 * 1000
    const last = new Date(base.getTime() + (count - 1) * intervalMs)
    const fmt = d => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' })
    const aheadDays = (last - new Date()) / (24 * 60 * 60 * 1000)
    return {
      count,
      firstLabel: fmt(base),
      lastLabel:  fmt(last),
      over: !isAdmin && aheadDays > 30,
    }
  })()

  return (
    <div style={s.root}>
      <Navbar />

      {user && user.has_calendar === false && (
        <div style={s.calendarBanner}>
          เพื่อให้ระบบเพิ่มการจองลง Google Calendar + เก็บข้อมูลการประชุมใน Google Drive ของคุณอัตโนมัติ
          กรุณา <strong>ออกจากระบบและ login ใหม่</strong>
          เพื่ออนุญาตสิทธิ์ Calendar + Drive (ครั้งเดียว)
        </div>
      )}
      <div style={{ ...s.body, flexDirection: isMobile ? 'column' : 'row' }}>
        {isMobile && (
          <button
            style={s.sidebarToggle}
            onClick={() => setSidebarOpen(o => !o)}
          >
            {sidebarOpen ? 'ซ่อนปฏิทินเดือน' : 'เลือกวัน / ดูปฏิทินเดือน'}
          </button>
        )}
        <aside
          style={{
            ...s.sidebar,
            ...(isMobile ? {
              width: '100%',
              borderRight: 'none',
              borderBottom: '1px solid #e1e7e1',
              display: sidebarOpen ? 'flex' : 'none',
            } : {}),
          }}
          className="fade-in"
        >
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
              const bookable = isBookable(day)
              return (
                <div
                  key={day}
                  style={{
                    ...s.dayCell,
                    ...(bookable ? {} : s.disabledCell),
                    ...(isSelected(day) && bookable ? s.selectedDay : {}),
                    ...(isToday(day) && !isSelected(day) ? s.todayCell : {}),
                  }}
                  className={bookable ? 'ku-day-cell' : ''}
                  onClick={() => {
                    if (!bookable) return
                    setSelectedDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))
                  }}
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
              <span style={{ ...s.statValue, color: '#1FBA7C' }}>{freeSlots} ชั่วโมง</span>
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
              <div style={{ ...s.legendDot, background: '#D9F5E7', border: '1.5px solid #B5E8D2' }} />
              <span>ช่วงเวลาว่าง</span>
            </div>
            <div style={s.legendRow}>
              <div style={{ ...s.legendDot, background: '#ffebee', border: '1.5px solid #ffcdd2' }} />
              <span>ถูกจองแล้ว</span>
            </div>
          </div>
        </aside>

        <main
          style={{
            ...s.main,
            padding: isMobile ? '20px 16px' : '32px 40px',
          }}
          className="fade-in"
        >
          <div style={s.mainHeader}>
            <div>
              <h2 style={s.mainTitle}>
                {selectedDate.getDate()} {MONTHS[selectedDate.getMonth()]} {selectedDate.getFullYear() + 543}
              </h2>
              <p style={s.mainSub}>
                <span style={s.dot} /> คลิกช่วงเวลาว่างเพื่อจองห้อง Zoom
              </p>
            </div>
            {tiers.length > 0 && (
              <div style={s.roomSelectWrap}>
                <label style={s.roomSelectLabel}>ขนาดห้องประชุม</label>
                <select
                  style={s.roomSelect}
                  value={selectedCapacity ?? ''}
                  onChange={e => setSelectedCapacity(parseInt(e.target.value, 10))}
                >
                  {tiers.map(t => (
                    <option key={t.capacity} value={t.capacity} disabled={!t.anyReady}>
                      {t.capacity} คน
                      {!t.anyReady ? ' · ยังไม่พร้อม' : (t.total > 1 ? ` · ${t.total} ห้อง` : '')}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {selectedTier && selectedTier.capacity > 100 && !isAdmin && (
            <div style={s.proWarnBanner}>
              ⚠ ห้อง {selectedTier.capacity} คน (Pro plan) <strong>ต้องรออนุมัติ</strong>จาก staff/admin
              ก่อนจึงจะได้รับลิงก์ Zoom — กรุณาระบุเหตุผลในการจอง
            </div>
          )}

          {loading ? (
            <div style={s.loadingBox}>
              <div style={s.spinner} />
              <span>กำลังโหลดข้อมูล...</span>
            </div>
          ) : (
            <div style={s.timeline}>
              <div style={s.gutter}>
                {HOURS.map((hour, i) => {
                  const isLast = i === HOURS.length - 1
                  return (
                    <div
                      key={hour}
                      style={{
                        ...s.gutterCell,
                        // cell สุดท้าย (24:00) ไม่มีพื้นที่ ใส่แค่ label
                        height: isLast ? 0 : PX_PER_HOUR,
                      }}
                    >
                      <span style={s.gutterTime}>
                        {String(hour).padStart(2,'0')}:00
                      </span>
                    </div>
                  )
                })}
              </div>

              <div style={s.tracks}>
                {HOURS.slice(0, -1).map(hour => {
                  const fullyBooked = isHourFullyBooked(hour)
                  return (
                    <div
                      key={hour}
                      style={{
                        ...s.hourRow,
                        cursor: fullyBooked ? 'default' : 'pointer',
                      }}
                      className={fullyBooked ? '' : 'ku-hour-row'}
                      onClick={() => !fullyBooked && openModal(hour)}
                    >
                      <span style={s.hourCue}>+ คลิกเพื่อจอง</span>
                    </div>
                  )
                })}
                {/* เส้นปิดที่ตำแหน่ง 24:00 — ไม่มี body, ไม่ clickable */}
                <div style={s.endLine} />

                {/* group bookings ที่มีเวลาเดียวกันเข้าด้วยกัน — แสดงเป็น block เดียวพร้อม count
                    (รองรับ Pro plan ที่มีหลายห้อง/tier — เห็น "เหลือ X/Y") */}
                {Object.values(bookedSlots.reduce((acc, slot) => {
                  const key = `${slot.start_time}_${slot.end_time}`
                  if (!acc[key]) acc[key] = { ...slot, count: 0, anyMine: false, anyCoHost: false }
                  acc[key].count += 1
                  if (slot.is_mine)    acc[key].anyMine = true
                  if (slot.is_co_host) acc[key].anyCoHost = true
                  return acc
                }, {})).map((slot, i) => {
                  const start = new Date(slot.start_time)
                  const end = new Date(slot.end_time)
                  const startFloat = start.getHours() + start.getMinutes() / 60
                  const endFloat = end.getHours() + end.getMinutes() / 60
                  const top = (startFloat - FIRST_HOUR) * PX_PER_HOUR
                  const rawHeight = (endFloat - startFloat) * PX_PER_HOUR
                  const height = Math.max(rawHeight - 2, 14)
                  const isCompact = height < 44
                  const timeLabel = `${start.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })} – ${end.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })}`

                  const variant = slot.anyMine    ? s.bookedVariantMine
                                : slot.anyCoHost  ? s.bookedVariantCoHost
                                : s.bookedVariantOther
                  const label = slot.anyMine    ? 'Your Reserving'
                              : slot.anyCoHost  ? 'Your Reserving (Co-Host)'
                              : 'Reserved'
                  const remaining = totalRooms - slot.count

                  return (
                    <div
                      key={i}
                      style={{
                        ...s.bookedBlock,
                        ...variant,
                        ...(isCompact ? s.bookedBlockCompact : {}),
                        top: top + 2 + TOP_PAD,
                        height,
                      }}
                    >
                      <span style={{
                        ...(isCompact ? s.bookedNameCompact : s.bookedName),
                        color: variant.nameColor,
                      }}>
                        {label}
                        {totalRooms > 1 && (
                          <span style={s.countBadge}>
                            {remaining > 0 ? `เหลือ ${remaining}/${totalRooms}` : `เต็ม ${totalRooms}/${totalRooms}`}
                          </span>
                        )}
                      </span>
                      <span style={isCompact ? s.bookedTimeCompact : s.bookedTime}>
                        {timeLabel}
                      </span>
                    </div>
                  )
                })}

                {showNow && (
                  <div
                    style={{
                      ...s.nowLine,
                      top: (nowHourFloat - FIRST_HOUR) * PX_PER_HOUR + TOP_PAD,
                    }}
                  >
                    <div style={s.nowDot} />
                    <div style={s.nowBar} />
                    <span style={s.nowLabel}>
                      {today.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
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
                  {selectedTier && (
                    <> · <strong>{selectedTier.capacity} คน</strong>
                    ({selectedTier.anyZoomAccount ? 'Pro' : 'Free'}
                    {selectedTier.total > 1 ? ` · ${selectedTier.total} ห้อง` : ''})</>
                  )}
                </p>
              </div>
              <button style={s.closeBtn} className="ku-close" onClick={closeModal}>
                <X size={18} />
              </button>
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

              <div>
                <div style={s.field}>
                  <label style={s.label}>เวลาเริ่ม <span style={s.req}>*</span></label>
                  <input
                    style={s.input}
                    type="time"
                    min="08:00"
                    max="23:59"
                    value={modalForm.startTime}
                    onChange={e => setModalForm({ ...modalForm, startTime: e.target.value })}
                    disabled={modalSuccess}
                  />
                </div>
                <div style={s.field}>
                  <label style={s.label}>เวลาสิ้นสุด <span style={s.req}>*</span></label>
                  <input
                    style={s.input}
                    type="time"
                    min="08:00"
                    max="23:59"
                    value={modalForm.endTime}
                    onChange={e => setModalForm({ ...modalForm, endTime: e.target.value })}
                    disabled={modalSuccess}
                  />
                </div>
              </div>

              <div style={s.field}>
                <label style={s.label}>
                  Co-host (อีเมล) <span style={{ color: '#888', fontWeight: 400, fontSize: 11 }}>— ไม่บังคับ</span>
                </label>
                <input
                  style={s.input}
                  placeholder="email1@ku.th, email2@ku.ac.th"
                  value={modalForm.coHosts}
                  onChange={e => setModalForm({ ...modalForm, coHosts: e.target.value })}
                  disabled={modalSuccess}
                />
              </div>

              <div style={s.field}>
                <label style={s.label}>
                  หมายเหตุ / เหตุผลการจอง
                  {needsApproval
                    ? <span style={s.req}> *</span>
                    : <span style={{ color: '#888', fontWeight: 400, fontSize: 11 }}> — ไม่บังคับ</span>}
                </label>
                <textarea
                  style={{ ...s.input, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }}
                  placeholder={needsApproval ? 'เช่น: สัมมนาคณะ / กิจกรรมหลักของภาควิชา' : 'เช่น: ประชุมโครงการ / สอบ Defense'}
                  value={modalForm.notes}
                  onChange={e => setModalForm({ ...modalForm, notes: e.target.value })}
                  disabled={modalSuccess}
                  maxLength={1000}
                />
              </div>

              <div style={s.field}>
                <label style={{
                  ...s.label, display: 'flex', alignItems: 'center', gap: 8,
                  cursor: recurringBlocked ? 'not-allowed' : 'pointer',
                  opacity: recurringBlocked ? 0.5 : 1,
                }}>
                  <input
                    type="checkbox"
                    checked={modalForm.recurringEnabled && !recurringBlocked}
                    onChange={e => setModalForm({ ...modalForm, recurringEnabled: e.target.checked })}
                    disabled={modalSuccess || recurringBlocked}
                  />
                  จองซ้ำ (ทำซ้ำหลายครั้ง)
                  {recurringBlocked && (
                    <span style={{ fontSize: 11, color: '#888', fontWeight: 400 }}>
                      — ห้อง Pro plan จองทีละครั้ง
                    </span>
                  )}
                </label>
                {modalForm.recurringEnabled && !recurringBlocked && (
                  <>
                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <select
                        style={{ ...s.input, flex: 1 }}
                        value={modalForm.recurringFreq}
                        onChange={e => setModalForm({ ...modalForm, recurringFreq: e.target.value })}
                        disabled={modalSuccess}
                      >
                        <option value="weekly">ทุกสัปดาห์</option>
                        <option value="daily">ทุกวัน</option>
                      </select>
                      <input
                        type="number"
                        min={2}
                        max={isAdmin ? 26 : (modalForm.recurringFreq === 'daily' ? 30 : 5)}
                        style={{ ...s.input, flex: 1 }}
                        value={modalForm.recurringCount}
                        onChange={e => setModalForm({ ...modalForm, recurringCount: e.target.value })}
                        disabled={modalSuccess}
                      />
                      <span style={{ alignSelf: 'center', color: '#888', fontSize: 12 }}>ครั้ง</span>
                    </div>
                    {modalSeriesPreview && (
                      <div style={{
                        marginTop: 8, padding: '8px 12px', borderRadius: 8,
                        background: modalSeriesPreview.over ? '#fff0f0' : '#F0FBF6',
                        border: `1px solid ${modalSeriesPreview.over ? '#ffcccc' : '#B5E8D2'}`,
                        color: modalSeriesPreview.over ? '#c62828' : '#03A96B',
                        fontSize: 12, lineHeight: 1.5,
                      }}>
                        จะจอง <strong>{modalSeriesPreview.count} ครั้ง</strong> ตั้งแต่ {modalSeriesPreview.firstLabel}
                        <br />ครั้งสุดท้าย: <strong>{modalSeriesPreview.lastLabel}</strong>
                        {modalSeriesPreview.over && !isAdmin && (
                          <><br />⚠ student จองล่วงหน้าได้ไม่เกิน 30 วัน — ลดจำนวนครั้ง</>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {modalDuration !== null && (
                <div style={{
                  ...s.durationBox,
                  background: modalOverLimit ? '#fff0f0' : '#F0FBF6',
                  color: modalOverLimit ? '#c62828' : '#1FBA7C',
                  borderColor: modalOverLimit ? '#ffcccc' : '#B5E8D2',
                }}>
                  <span style={{ fontWeight: 600 }}>ระยะเวลา:</span>
                  <span>{modalDuration} นาที</span>
                  {modalOverLimit && (
                    <span style={s.warnTag}>
                      {modalDuration <= 0
                        ? 'เวลาไม่ถูกต้อง'
                        : maxDurationMin === 40
                          ? 'เกิน 40 นาที (Free plan)'
                          : `เกิน ${maxDurationMin} นาที`}
                    </span>
                  )}
                </div>
              )}

              {modalError && (
                <div style={s.error}>
                  <AlertCircle size={16} style={s.errIcon} />
                  <span>{modalError}</span>
                </div>
              )}

              {modalSuccess && (
                <div style={s.success}>
                  <div style={s.successCheck}><Check size={16} strokeWidth={3} /></div>
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
                  opacity: modalLoading || modalOverLimit || modalSuccess || modalSeriesPreview?.over ? 0.6 : 1,
                }}
                className="ku-confirm-btn"
                onClick={submitBooking}
                disabled={modalLoading || modalOverLimit || modalSuccess || modalSeriesPreview?.over}
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
        .ku-hour-row:hover {
          background: #F0FBF6;
        }
        .ku-hour-row:hover > span {
          opacity: 1 !important;
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
          box-shadow: 0 8px 24px rgba(1, 74, 50, 0.3);
        }
      `}</style>
    </div>
  )
}

const s = {
  root: { minHeight: '100vh', background: '#f4f6f4' },
  body: { display: 'flex', minHeight: 'calc(100vh - 68px)' },
  calendarBanner: {
    background: '#fff8e1', borderBottom: '1px solid #fde68a',
    color: '#92400e', padding: '10px 20px',
    fontSize: 13, textAlign: 'center', lineHeight: 1.5,
  },
  sidebarToggle: {
    margin: '12px 16px 0',
    padding: '10px 14px',
    background: 'white', color: '#03A96B',
    border: '1.5px solid #B5E8D2', borderRadius: 10,
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  sidebar: {
    width: 320, background: 'white', padding: '28px 24px',
    borderRight: '1px solid #e1e7e1', display: 'flex',
    flexDirection: 'column', gap: 24,
  },
  monthNav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  arrow: {
    background: '#F0FBF6', width: 32, height: 32, borderRadius: 8,
    fontSize: 20, color: '#1FBA7C', fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  monthLabel: { fontSize: 16, fontWeight: 600, color: '#03A96B' },
  year: { color: '#888', fontWeight: 500, fontSize: 14, marginLeft: 4 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 },
  dayName: { textAlign: 'center', fontSize: 11, fontWeight: 600, padding: '6px 0', textTransform: 'uppercase', letterSpacing: 0.5 },
  dayCell: {
    textAlign: 'center', padding: '9px 0', borderRadius: 8,
    fontSize: 13, cursor: 'pointer', color: '#1a1a1a', fontWeight: 600,
    position: 'relative',
  },
  selectedDay: {
    background: 'linear-gradient(135deg, #1FBA7C 0%, #03A96B 100%)',
    color: 'white', fontWeight: 700,
    boxShadow: '0 2px 8px rgba(3, 169, 107, 0.3)',
  },
  todayCell: { background: '#fdf6dc', color: '#03A96B', fontWeight: 700 },
  disabledCell: {
    color: '#cfd4cf', cursor: 'not-allowed', fontWeight: 400,
  },
  todayDot: {
    position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)',
    width: 4, height: 4, borderRadius: '50%', background: '#c9a227',
  },
  statsBox: {
    background: '#F0FBF6', borderRadius: 12, padding: '14px 16px',
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
    marginBottom: 20, gap: 16, flexWrap: 'wrap',
  },
  roomSelectWrap: {
    display: 'flex', flexDirection: 'column', gap: 6,
    minWidth: 240,
  },
  roomSelectLabel: {
    fontSize: 11, fontWeight: 600, color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  roomSelect: {
    padding: '10px 12px',
    border: '1.5px solid #B5E8D2', borderRadius: 10,
    background: 'white', color: '#1a1a1a',
    fontSize: 13, fontWeight: 500,
    cursor: 'pointer',
  },
  proWarnBanner: {
    background: '#fef3c7', border: '1px solid #fde68a',
    color: '#92400e',
    padding: '10px 14px', borderRadius: 10,
    fontSize: 12, lineHeight: 1.5,
    marginBottom: 16,
  },
  mainTitle: {
    fontSize: 24, fontWeight: 700, color: '#014A32',
    margin: 0, letterSpacing: '-0.5px',
  },
  mainSub: {
    fontSize: 13, color: '#888', margin: '6px 0 0',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  dot: { display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#4DD9A2' },
  timeline: {
    background: 'white', borderRadius: 14,
    border: '1px solid #e6ebe6', overflow: 'hidden',
    display: 'flex',
    boxShadow: '0 1px 3px rgba(1, 74, 50, 0.04)',
  },
  gutter: {
    width: 76, flexShrink: 0,
    background: '#fafbfa',
    borderRight: '1px solid #e6ebe6',
    paddingTop: TOP_PAD,
  },
  gutterCell: {
    height: 64, position: 'relative',
    paddingRight: 12, paddingTop: 0,
    display: 'flex', justifyContent: 'flex-end',
  },
  gutterTime: {
    fontSize: 11, fontWeight: 600, color: '#94a3a3',
    letterSpacing: 0.4,
    transform: 'translateY(-7px)',
  },
  tracks: {
    flex: 1, position: 'relative',
    paddingRight: 14, paddingLeft: 14,
    paddingTop: TOP_PAD, paddingBottom: TOP_PAD,
    minHeight: PX_PER_HOUR * (HOURS.length - 1) + TOP_PAD * 2,
  },
  hourRow: {
    height: PX_PER_HOUR, position: 'relative',
    borderTop: '1px dashed #eef2ee',
    display: 'flex', alignItems: 'center',
    transition: 'background 0.15s var(--ease)',
  },
  hourCue: {
    fontSize: 12, color: '#03A96B', fontWeight: 600,
    opacity: 0, transition: 'opacity 0.15s var(--ease)',
    pointerEvents: 'none',
    paddingLeft: 12,
  },
  endLine: {
    height: 0,
    borderTop: '1px dashed #eef2ee',
  },
  bookedBlock: {
    position: 'absolute', left: 8, right: 8,
    background: '#fff5f5',
    border: '1px solid #fecaca',
    borderLeft: '3px solid #dc2626',
    borderRadius: 8, padding: '6px 12px',
    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
    boxShadow: '0 1px 2px rgba(220, 38, 38, 0.06), 0 4px 10px rgba(15, 23, 42, 0.04)',
    overflow: 'hidden', cursor: 'default',
    zIndex: 2,
    minWidth: 0,
  },
  bookedBlockCompact: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    padding: '0 8px',
  },
  // คนอื่นจอง — แดง (เดิม)
  bookedVariantOther: {
    background: '#fff5f5',
    border: '1px solid #fecaca',
    borderLeft: '3px solid #dc2626',
    nameColor: '#9f1239',
  },
  // เราเป็น co-host — น้ำเงิน
  bookedVariantCoHost: {
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderLeft: '3px solid #2563eb',
    nameColor: '#1e40af',
  },
  // เราเป็นเจ้าของ — เขียว
  bookedVariantMine: {
    background: '#ecfdf5',
    border: '1px solid #a7f3d0',
    borderLeft: '3px solid #059669',
    nameColor: '#065f46',
  },
  bookedName: {
    fontSize: 13, fontWeight: 600, color: '#9f1239',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    flexShrink: 0,
  },
  countBadge: {
    marginLeft: 8, padding: '1px 8px', borderRadius: 10,
    background: 'rgba(255,255,255,0.7)', fontSize: 10,
    fontWeight: 600, color: '#475569',
  },
  bookedNameCompact: {
    fontSize: 11, fontWeight: 700, color: '#9f1239',
    whiteSpace: 'nowrap', flexShrink: 0,
    letterSpacing: 0.2,
  },
  bookedTime: {
    fontSize: 11, color: '#94a3b8', fontWeight: 500,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  bookedTimeCompact: {
    fontSize: 10, color: '#94a3b8', fontWeight: 500,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    minWidth: 0,
  },
  nowLine: {
    position: 'absolute', left: 0, right: 0,
    pointerEvents: 'none', zIndex: 3,
    display: 'flex', alignItems: 'center',
    height: 0,
  },
  nowDot: {
    width: 9, height: 9, borderRadius: '50%',
    background: '#f59e0b',
    boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.18)',
    flexShrink: 0,
    marginLeft: -4,
  },
  nowBar: {
    flex: 1, height: 1.5, background: '#f59e0b',
    opacity: 0.85,
  },
  nowLabel: {
    background: '#f59e0b', color: 'white',
    fontSize: 10, fontWeight: 700,
    padding: '2px 7px', borderRadius: 10,
    marginLeft: 6, letterSpacing: 0.3, flexShrink: 0,
    boxShadow: '0 1px 4px rgba(245, 158, 11, 0.35)',
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
  modal: {
    background: 'white', borderRadius: 18, width: '100%', maxWidth: 480,
    boxShadow: '0 24px 60px rgba(1, 74, 50, 0.35), 0 8px 24px rgba(1, 74, 50, 0.15)',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '24px 28px 20px',
    borderBottom: '1px solid #f0f0f0',
  },
  modalTitle: { fontSize: 20, fontWeight: 700, color: '#014A32', margin: 0 },
  modalSub: { fontSize: 13, color: '#666', margin: '4px 0 0' },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8,
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
    fontSize: 14, background: '#fff', boxSizing: 'border-box',
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
  errIcon: { color: '#cc3333', flexShrink: 0 },
  success: {
    background: 'linear-gradient(135deg, #F0FBF6 0%, #D9F5E7 100%)',
    border: '1px solid #88E0BB', color: '#03A96B',
    padding: '14px 16px', borderRadius: 12, fontSize: 13,
    marginTop: 12, display: 'flex', alignItems: 'center', gap: 14,
  },
  successCheck: {
    width: 30, height: 30, borderRadius: '50%',
    background: '#1FBA7C', color: 'white',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 15, fontWeight: 700, flexShrink: 0,
    animation: 'pulseGlow 1.5s var(--ease) infinite',
  },
  successText: { fontSize: 12, color: '#028152', margin: '2px 0 0' },
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
    background: 'linear-gradient(135deg, #03A96B 0%, #028152 100%)',
    color: 'white', borderRadius: 10,
    fontSize: 14, fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    boxShadow: '0 4px 14px rgba(1, 74, 50, 0.25)',
  },
  btnSpinner: {
    width: 14, height: 14, borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white',
    animation: 'spin 0.6s linear infinite',
  },
}

export default Calendar
