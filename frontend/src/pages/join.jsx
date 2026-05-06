import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Clock, AlertCircle, Video } from 'lucide-react'
import api from '../api'
import Navbar from '../components/Navbar'

function Join() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState({ status: 'loading' })
  const [now, setNow] = useState(Date.now())
  const pollTimer = useRef(null)
  const tickTimer = useRef(null)

  // tick ทุกวินาทีเพื่อ countdown
  useEffect(() => {
    tickTimer.current = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tickTimer.current)
  }, [])

  const fetchJoin = async () => {
    try {
      const res = await api.get(`/bookings/${id}/join`)
      setState({ status: 'ready', data: res.data })
    } catch (err) {
      const status = err.response?.status
      if (status === 425) {
        setState({
          status: 'waiting',
          startsAt: err.response.data.startsAt,
          message: err.response.data.error,
        })
      } else if (status === 403) {
        setState({ status: 'forbidden', message: err.response.data.error })
      } else if (status === 404 || status === 410) {
        setState({ status: 'gone', message: err.response.data.error })
      } else {
        setState({ status: 'error', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
      }
    }
  }

  useEffect(() => { fetchJoin() }, [id])

  // poll ทุก 10 วิ ขณะรอเวลา
  useEffect(() => {
    if (state.status !== 'waiting') return
    pollTimer.current = setInterval(() => {
      const remaining = new Date(state.startsAt).getTime() - Date.now()
      if (remaining <= 1000) fetchJoin()
    }, 10000)
    return () => clearInterval(pollTimer.current)
  }, [state.status, state.startsAt])

  // auto-redirect เมื่อพร้อม
  useEffect(() => {
    if (state.status === 'ready' && state.data?.joinUrl) {
      window.location.href = state.data.joinUrl
    }
  }, [state.status, state.data])

  const remainingMs = state.status === 'waiting'
    ? Math.max(0, new Date(state.startsAt).getTime() - now)
    : 0
  const remainingSec = Math.ceil(remainingMs / 1000)
  const hh = Math.floor(remainingSec / 3600)
  const mm = Math.floor((remainingSec % 3600) / 60)
  const ss = remainingSec % 60
  const countdown = hh > 0
    ? `${hh}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
    : `${mm}:${String(ss).padStart(2,'0')}`

  return (
    <div style={s.root}>
      <Navbar />
      <div style={s.body}>
        <div style={s.card} className="fade-in">
          {state.status === 'loading' && (
            <>
              <div style={s.spinner} />
              <p style={s.heading}>กำลังตรวจสอบสิทธิ์...</p>
            </>
          )}

          {state.status === 'waiting' && (
            <>
              <div style={s.iconWrap}><Clock size={42} /></div>
              <h2 style={s.heading}>ห้องยังไม่เปิด</h2>
              <p style={s.sub}>ห้องประชุมจะเปิดในอีก</p>
              <div style={s.countdown}>{countdown}</div>
              <p style={s.subSmall}>
                เริ่ม {new Date(state.startsAt).toLocaleString('th-TH', {
                  dateStyle: 'medium', timeStyle: 'short'
                })}
              </p>
              <p style={s.note}>หน้านี้จะพาคุณเข้าห้องอัตโนมัติเมื่อถึงเวลา</p>
            </>
          )}

          {state.status === 'ready' && (
            <>
              <div style={{ ...s.iconWrap, color: '#1FBA7C' }}><Video size={42} /></div>
              <h2 style={s.heading}>กำลังพาเข้าห้อง...</h2>
              <p style={s.sub}>{state.data?.title}</p>
              <a href={state.data?.joinUrl} style={s.btn}>เข้าร่วม Zoom ทันที</a>
            </>
          )}

          {(state.status === 'forbidden' || state.status === 'gone' || state.status === 'error') && (
            <>
              <div style={{ ...s.iconWrap, color: '#c62828' }}><AlertCircle size={42} /></div>
              <h2 style={s.heading}>ไม่สามารถเข้าห้องได้</h2>
              <p style={s.sub}>{state.message}</p>
              <button style={s.btn} onClick={() => navigate('/my-bookings')}>
                กลับไปการจองของฉัน
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const s = {
  root: { minHeight: '100vh', background: '#f4f6f4' },
  body: {
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    padding: '60px 24px', minHeight: 'calc(100vh - 68px)',
  },
  card: {
    background: 'white', borderRadius: 18, padding: '40px 32px',
    boxShadow: '0 8px 28px rgba(1, 74, 50, 0.08), 0 2px 8px rgba(1, 74, 50, 0.04)',
    border: '1px solid #e1e7e1',
    width: '100%', maxWidth: 440,
    textAlign: 'center',
  },
  iconWrap: {
    color: '#03A96B', marginBottom: 16,
    display: 'flex', justifyContent: 'center',
  },
  heading: { fontSize: 22, fontWeight: 700, color: '#014A32', margin: '0 0 8px' },
  sub: { fontSize: 14, color: '#555', margin: '0 0 4px' },
  subSmall: { fontSize: 12, color: '#888', margin: '6px 0 0' },
  countdown: {
    fontSize: 48, fontWeight: 800, color: '#03A96B',
    margin: '14px 0 4px', fontVariantNumeric: 'tabular-nums',
    letterSpacing: 1,
  },
  note: {
    fontSize: 12, color: '#888', margin: '20px 0 0',
    background: '#F0FBF6', padding: '10px 14px', borderRadius: 10,
    border: '1px solid #B5E8D2',
  },
  btn: {
    display: 'inline-block', marginTop: 14,
    background: 'linear-gradient(135deg, #03A96B 0%, #028152 100%)',
    color: 'white', padding: '12px 24px', borderRadius: 10,
    fontSize: 14, fontWeight: 600, textDecoration: 'none',
    boxShadow: '0 4px 14px rgba(1, 74, 50, 0.25)',
    border: 'none', cursor: 'pointer',
  },
  spinner: {
    width: 36, height: 36, borderRadius: '50%',
    border: '3px solid #e1e7e1', borderTopColor: '#1FBA7C',
    animation: 'spin 0.8s linear infinite',
    margin: '0 auto 16px',
  },
}

export default Join
