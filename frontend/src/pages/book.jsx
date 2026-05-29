import { useState, useRef, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { AlertCircle, Check, Calendar, Clock, Users as UsersIcon } from 'lucide-react'
import api from '../api'
import { useUser } from '../useUser'
import { useIsMobile } from '../useIsMobile'
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
  const { user, isAdmin } = useUser()
  const isMobile = useIsMobile()
  const role = user?.role || 'student'
  const canPickPriorityRoom = role === 'admin' || role === 'priority'
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [rooms, setRooms] = useState([])
  const [form, setForm] = useState({
    title: '',
    date: formatToDDMMYYYY(searchParams.get('date')) || '',
    startTime: searchParams.get('startTime') || '',
    endTime: '',
    coHosts: '',
    capacity: '',
    notes: '',
    recurringEnabled: false,
    recurringFreq: 'weekly',
    recurringCount: 4,
  })

  // group rooms ตาม capacity tier — Pro plan ในอนาคตจะมีหลายห้อง/tier → รวมเป็น 1 option
  const tiers = useMemo(() => {
    const map = new Map()
    for (const r of rooms) {
      if (r.is_priority_only && !canPickPriorityRoom) continue
      const t = map.get(r.capacity) || {
        capacity: r.capacity, total: 0, anyReady: false, anyZoomAccount: false,
        isPriorityOnly: r.is_priority_only,
      }
      t.total += 1
      if (!r.needs_zoom_pro) t.anyReady = true
      if (r.has_zoom_account) t.anyZoomAccount = true
      map.set(r.capacity, t)
    }
    return Array.from(map.values()).sort((a, b) => a.capacity - b.capacity)
  }, [rooms, canPickPriorityRoom])

  useEffect(() => {
    api.get('/bookings/rooms')
      .then(res => setRooms(res.data || []))
      .catch(() => {})
  }, [])

  // default-select tier แรกที่พร้อมใช้ (capacity น้อยสุด)
  useEffect(() => {
    if (!form.capacity && tiers.length > 0) {
      const firstReady = tiers.find(t => t.anyReady)
      if (firstReady) setForm(f => ({ ...f, capacity: firstReady.capacity }))
    }
  }, [tiers, form.capacity])

  const selectedTier = tiers.find(t => t.capacity === Number(form.capacity)) || null
  const roomMaxMin = selectedTier?.anyZoomAccount ? 24 * 60 : 40
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isPending, setIsPending] = useState(false)
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

    // จำกัดเวลาจอง 08:00 - 24:00 (string compare ok เพราะ HH:mm zero-padded)
    if (form.startTime < '08:00' || form.startTime > '23:59') {
      setError('เวลาเริ่มต้องอยู่ระหว่าง 08:00 - 23:59')
      return
    }
    if (form.endTime < '08:00' || form.endTime > '23:59') {
      setError('เวลาสิ้นสุดต้องอยู่ระหว่าง 08:00 - 24:00')
      return
    }

    // ห้อง Pro plan (capacity > 100) ต้อง approve → ต้องระบุเหตุผล (ช่วย staff ตัดสินใจ)
    if (selectedTier && selectedTier.capacity > 100 && !isAdmin && !form.notes.trim()) {
      setError('กรุณาระบุเหตุผลการจอง — ห้อง ' + selectedTier.capacity + ' คนต้องรออนุมัติ')
      return
    }

    const startTime = `${dateISO}T${form.startTime}:00+07:00`
    const endTime   = `${dateISO}T${form.endTime}:00+07:00`
    const coHostEmails = form.coHosts
      .split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)

    const payload = { title: form.title, startTime, endTime, coHostEmails }
    if (form.capacity) payload.capacity = Number(form.capacity)
    if (form.notes.trim()) payload.notes = form.notes.trim()
    if (form.recurringEnabled && form.recurringCount > 1) {
      payload.recurring = { freq: form.recurringFreq, count: parseInt(form.recurringCount, 10) }
    }

    try {
      setLoading(true)
      const res = await api.post('/bookings', payload)
      const created = res.data
      setIsPending(created.status === 'pending_approval')
      setSuccess(true)
      setForm({
        title: '', date: '', startTime: '', endTime: '', coHosts: '',
        capacity: form.capacity,  // คงค่า tier เดิม
        notes: '',
        recurringEnabled: false, recurringFreq: 'weekly', recurringCount: 4,
      })
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
  const overLimit = duration && duration > roomMaxMin

  // คำนวณ preview สำหรับ recurring series
  const seriesPreview = (() => {
    if (!form.recurringEnabled) return null
    const count = parseInt(form.recurringCount, 10)
    if (!count || count < 2) return null
    const dateISO = parseDDMMYYYY(form.date)
    if (!dateISO || !form.startTime) return null
    const base = new Date(`${dateISO}T${form.startTime}:00+07:00`)
    if (isNaN(base)) return null
    const intervalMs = (form.recurringFreq === 'daily' ? 1 : 7) * 24 * 60 * 60 * 1000
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
                <span style={s.infoValue}>
                  สูงสุด {roomMaxMin >= 1440 ? '24 ชม.' : `${roomMaxMin} นาที`} / ครั้ง
                </span>
              </div>
              {role === 'student' && (
                <>
                  <div style={s.infoDivider} />
                  <div style={s.infoItem}>
                    <span style={s.infoLabel}>ล่วงหน้า</span>
                    <span style={s.infoValue}>ไม่เกิน 30 วัน</span>
                  </div>
                  <div style={s.infoDivider} />
                  <div style={s.infoItem}>
                    <span style={s.infoLabel}>โควตา</span>
                    <span style={s.infoValue}>4 ครั้ง / เดือน</span>
                  </div>
                </>
              )}
              {role === 'priority' && (
                <>
                  <div style={s.infoDivider} />
                  <div style={s.infoItem}>
                    <span style={s.infoLabel}>สิทธิ์</span>
                    <span style={s.infoValue}>Priority (ไม่จำกัดโควตา · จองห้อง premium ได้)</span>
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

            {tiers.length >= 1 && (
              <div style={s.field}>
                <label style={s.label}>
                  ขนาดห้องประชุม <span style={s.req}>*</span>
                </label>
                <select
                  style={s.input}
                  value={form.capacity}
                  onChange={e => setForm({ ...form, capacity: parseInt(e.target.value, 10) })}
                >
                  {tiers.map(t => {
                    const suffix = !t.anyReady ? ' · ยังไม่พร้อม'
                                 : t.isPriorityOnly ? ' · Priority'
                                 : (t.total > 1 ? ` · ${t.total} ห้อง` : '')
                    return (
                      <option
                        key={t.capacity}
                        value={t.capacity}
                        disabled={!t.anyReady}
                      >
                        {t.capacity} คน{suffix}
                      </option>
                    )
                  })}
                </select>
                {selectedTier && (
                  <div style={{
                    marginTop: 8, padding: '8px 12px', borderRadius: 8,
                    background: !selectedTier.anyReady ? '#fff0f0' : '#F0FBF6',
                    border: `1px solid ${!selectedTier.anyReady ? '#ffcccc' : '#B5E8D2'}`,
                    color: !selectedTier.anyReady ? '#c62828' : '#03A96B',
                    fontSize: 12,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                    <UsersIcon size={14} />
                    รองรับ {selectedTier.capacity} คน
                    {!selectedTier.anyReady
                      ? ' · admin ยังไม่ได้ตั้งค่า Zoom Pro — เลือกห้องอื่น'
                      : selectedTier.anyZoomAccount
                        ? ' · Pro plan (ไม่จำกัด 40 นาที)'
                        : ' · Free plan (จำกัด 40 นาที)'}
                    {selectedTier.total > 1 && ` · ${selectedTier.total} ห้องใน tier นี้`}
                  </div>
                )}
                {selectedTier && selectedTier.capacity > 100 && !isAdmin && (
                  <div style={{
                    marginTop: 8, padding: '10px 12px', borderRadius: 8,
                    background: '#fef3c7', border: '1px solid #fde68a',
                    color: '#92400e', fontSize: 12, lineHeight: 1.5,
                  }}>
                    ⚠ ห้อง {selectedTier.capacity} คน (Pro plan) <strong>ต้องรออนุมัติ</strong>จาก staff/admin
                    ก่อนจึงจะได้รับลิงก์ Zoom — ระบบจะแจ้งทางอีเมลเมื่อ approve แล้ว
                  </div>
                )}
              </div>
            )}

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

            <div style={{ ...s.row, flexDirection: isMobile ? 'column' : 'row' }}>
              <div style={{ ...s.field, flex: 1, minWidth: 0 }}>
                <label style={s.label}>เวลาเริ่ม <span style={s.req}>*</span></label>
                <div style={s.dateWrap}>
                  <input
                    ref={startTimeRef}
                    style={{ ...s.input, paddingRight: 44 }}
                    type="time"
                    className="ku-time-input"
                    min="08:00"
                    max="23:59"
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
              <div style={{ ...s.field, flex: 1, minWidth: 0 }}>
                <label style={s.label}>เวลาสิ้นสุด <span style={s.req}>*</span></label>
                <div style={s.dateWrap}>
                  <input
                    ref={endTimeRef}
                    style={{ ...s.input, paddingRight: 44 }}
                    type="time"
                    className="ku-time-input"
                    min="08:00"
                    max="23:59"
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
                placeholder="email1@ku.th, email2@ku.ac.th"
                value={form.coHosts}
                onChange={e => setForm({ ...form, coHosts: e.target.value })}
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>
                หมายเหตุ / เหตุผลการจอง
                {selectedTier && selectedTier.capacity > 100 && !isAdmin
                  ? <span style={s.req}> *</span>
                  : <span style={s.optional}> — ไม่บังคับ</span>}
              </label>
              <textarea
                style={{ ...s.input, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="เช่น: ประชุมโครงการ X / สอบ Defense / รายวิชา CPE..."
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                maxLength={1000}
              />
              <div style={{ fontSize: 11, color: '#888', marginTop: 4, textAlign: 'right' }}>
                {form.notes.length} / 1000
              </div>
            </div>

            <div style={s.field}>
              <label style={{ ...s.label, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.recurringEnabled}
                  onChange={e => setForm({ ...form, recurringEnabled: e.target.checked })}
                />
                จองซ้ำ (ทำซ้ำหลายครั้ง)
              </label>
              {form.recurringEnabled && (
                <>
                  <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                    <select
                      style={{ ...s.input, flex: 1 }}
                      value={form.recurringFreq}
                      onChange={e => setForm({ ...form, recurringFreq: e.target.value })}
                    >
                      <option value="weekly">ทุกสัปดาห์</option>
                      <option value="daily">ทุกวัน</option>
                    </select>
                    <input
                      type="number"
                      min={2}
                      max={isAdmin ? 26 : (form.recurringFreq === 'daily' ? 30 : 5)}
                      style={{ ...s.input, flex: 1 }}
                      value={form.recurringCount}
                      onChange={e => setForm({ ...form, recurringCount: e.target.value })}
                    />
                    <span style={{ alignSelf: 'center', color: '#888', fontSize: 12 }}>ครั้ง</span>
                  </div>
                  {seriesPreview && (
                    <div style={{
                      marginTop: 8, padding: '8px 12px', borderRadius: 8,
                      background: seriesPreview.over ? '#fff0f0' : '#F0FBF6',
                      border: `1px solid ${seriesPreview.over ? '#ffcccc' : '#B5E8D2'}`,
                      color: seriesPreview.over ? '#c62828' : '#03A96B',
                      fontSize: 12, lineHeight: 1.5,
                    }}>
                      จะจอง <strong>{seriesPreview.count} ครั้ง</strong> ตั้งแต่ {seriesPreview.firstLabel}
                      <br />ครั้งสุดท้าย: <strong>{seriesPreview.lastLabel}</strong>
                      {seriesPreview.over && !isAdmin && (
                        <><br />⚠ student จองล่วงหน้าได้ไม่เกิน 30 วัน — ลดจำนวนครั้ง</>
                      )}
                    </div>
                  )}
                </>
              )}
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
                {overLimit && (
                  <span style={s.warnTag}>
                    เกิน {roomMaxMin >= 1440 ? '24 ชม.' : `${roomMaxMin} นาที`}
                  </span>
                )}
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
                  <strong>{isPending ? 'ส่งคำขอแล้ว — รออนุมัติ' : 'จองสำเร็จ!'}</strong>
                  <p style={s.successText}>
                    {isPending
                      ? 'staff/admin จะตรวจสอบและแจ้งผลทางอีเมล'
                      : 'กรุณาตรวจสอบอีเมลของคุณเพื่อรับลิงก์ Zoom'}
                  </p>
                </div>
              </div>
            )}

            <button
              style={{ ...s.btn, opacity: loading || overLimit || seriesPreview?.over ? 0.6 : 1 }}
              className="ku-submit"
              onClick={handleSubmit}
              disabled={loading || overLimit || seriesPreview?.over}
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
    fontSize: 14, background: '#fff', boxSizing: 'border-box',
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
