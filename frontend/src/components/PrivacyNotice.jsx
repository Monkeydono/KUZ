import { useState } from 'react'
import { PRIVACY_NOTICE_URL } from '../links'

// ประกาศความเป็นส่วนตัวแบบ popup กลางจอ ขึ้นเมื่อเข้าเว็บครั้งแรก (feedback Rev.1 ข้อ 14)
// ต้องกดรับทราบก่อนใช้งาน — จำไว้ในเครื่องด้วย localStorage
// เนื้อหาเป็นสรุปจากสิ่งที่ระบบเก็บจริงในโค้ด ฉบับเต็มอยู่ที่ PRIVACY_NOTICE_URL
// ถ้าแก้เนื้อหาประกาศอย่างมีนัยสำคัญ ให้เปลี่ยน STORAGE_KEY เพื่อให้ทุกคนเห็น popup อีกครั้ง
const STORAGE_KEY = 'privacy_notice_ack_v1'

function readAck() {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

function PrivacyNotice() {
  const [acked, setAcked] = useState(readAck)
  if (acked) return null

  const accept = () => {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* ignore */ }
    setAcked(true)
  }

  return (
    <div style={s.overlay}>
      <div style={s.modal} role="dialog" aria-modal="true" aria-labelledby="privacy-title" className="slide-in">
        <div style={s.header}>
          <h2 id="privacy-title" style={s.title}>ประกาศความเป็นส่วนตัว</h2>
          <p style={s.subtitle}>ระบบจองห้องประชุม Zoom มหาวิทยาลัยเกษตรศาสตร์</p>
        </div>

        <div style={s.body}>
          <h3 style={s.h3}>ข้อมูลที่ระบบเก็บ</h3>
          <ul style={s.ul}>
            <li>จาก KU ALL-Login: ชื่อ นามสกุล อีเมล ประเภทบุคคล คณะ ภาควิชาหรือหน่วยงาน และวิทยาเขต</li>
            <li>จากบัญชี Google @ku.th: อีเมล ชื่อ และสิทธิ์เพิ่มนัดหมายลง Google Calendar กับสิทธิ์จัดการเฉพาะไฟล์ที่ระบบสร้างใน Google Drive</li>
            <li>ข้อมูลการจอง: หัวข้อ วันเวลา ห้อง หมายเหตุ อีเมลผู้ร่วมดูแลห้อง และประวัติการใช้งานห้องประชุม</li>
          </ul>

          <h3 style={s.h3}>นำไปใช้เพื่อ</h3>
          <ul style={s.ul}>
            <li>ยืนยันตัวตนและตรวจสิทธิ์การใช้งาน</li>
            <li>สร้างห้องประชุม Zoom ส่งอีเมลแจ้งเตือน บันทึกนัดหมายลงปฏิทิน และเก็บไฟล์บันทึกการประชุมไว้ใน Google Drive ของผู้จอง</li>
            <li>จัดทำสถิติการใช้งานของมหาวิทยาลัย</li>
          </ul>

          <h3 style={s.h3}>ข้อมูลที่ผู้อื่นมองเห็น</h3>
          <ul style={s.ul}>
            <li>หัวข้อการประชุมและช่วงเวลาที่จอง แสดงในปฏิทินให้ทุกคนเห็น รวมถึงผู้ที่ไม่ได้เข้าสู่ระบบ ไม่ควรใส่ข้อมูลลับในหัวข้อการประชุม</li>
            <li>ชื่อ อีเมล และลิงก์ห้อง Zoom ของผู้จอง ไม่แสดงต่อผู้อื่น</li>
          </ul>

          <p style={s.more}>
            อ่านรายละเอียดฉบับเต็มได้ที่{' '}
            <a style={s.link} href={PRIVACY_NOTICE_URL} target="_blank" rel="noopener noreferrer">
              ประกาศความเป็นส่วนตัว Privacy Notice
            </a>
          </p>
        </div>

        <div style={s.footer}>
          <button style={s.btn} onClick={accept} autoFocus>รับทราบ</button>
        </div>
      </div>
    </div>
  )
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 2000,
    background: 'rgba(1, 74, 50, 0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
  },
  modal: {
    background: 'white', borderRadius: 18, width: '100%', maxWidth: 560,
    maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 60px rgba(1, 74, 50, 0.3)', overflow: 'hidden',
  },
  header: {
    padding: '22px 26px 14px',
    borderBottom: '1px solid #e1e7e1',
  },
  title: { margin: 0, fontSize: 20, fontWeight: 700, color: '#014A32' },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#666' },
  body: {
    padding: '14px 26px', overflowY: 'auto',
    fontSize: 14, lineHeight: 1.7, color: '#333',
  },
  h3: { margin: '8px 0 4px', fontSize: 14, fontWeight: 700, color: '#028152' },
  ul: { margin: '0 0 8px', paddingLeft: 20 },
  more: { margin: '10px 0 0', fontSize: 13, color: '#555' },
  link: { color: '#028152', fontWeight: 600, textDecoration: 'underline' },
  footer: {
    padding: '14px 26px 20px', borderTop: '1px solid #e1e7e1',
    display: 'flex', justifyContent: 'flex-end',
  },
  btn: {
    background: 'linear-gradient(135deg, #03A96B 0%, #028152 100%)', color: 'white',
    border: 'none', borderRadius: 10, padding: '11px 28px',
    fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
}

export default PrivacyNotice
