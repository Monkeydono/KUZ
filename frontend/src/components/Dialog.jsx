import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// popup ยืนยันและแจ้งเตือนของเว็บไซต์เอง ใช้แทน window.confirm / window.alert ของ browser
// ใช้งาน:
//   const { confirm, alert } = useDialog()
//   if (!await confirm({ title: 'อนุมัติการจอง', message: '...', confirmText: 'อนุมัติ' })) return
//   await alert({ title: 'ไม่สำเร็จ', message: err, tone: 'danger' })
const DialogContext = createContext(null)

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const resolveRef = useRef(null)

  const open = useCallback((opts, kind) => new Promise(resolve => {
    resolveRef.current = resolve
    setDialog({ ...opts, kind })
  }), [])

  const close = useCallback((result) => {
    resolveRef.current?.(result)
    resolveRef.current = null
    setDialog(null)
  }, [])

  const confirm = useCallback((opts) => open(opts, 'confirm'), [open])
  const alert = useCallback((opts) => open(typeof opts === 'string' ? { message: opts } : opts, 'alert'), [open])

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      {dialog && <DialogBox dialog={dialog} onClose={close} />}
    </DialogContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDialog() {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used inside <DialogProvider>')
  return ctx
}

function DialogBox({ dialog, onClose }) {
  const { kind, title, message, confirmText, cancelText, tone } = dialog
  const danger = tone === 'danger'
  const isConfirm = kind === 'confirm'

  // Esc = ยกเลิก / ปิด
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(isConfirm ? false : undefined) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, isConfirm])

  return (
    <div style={s.overlay} onClick={() => onClose(isConfirm ? false : undefined)}>
      <div
        style={s.modal}
        className="slide-in"
        role={isConfirm ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="ku-dialog-title"
        onClick={e => e.stopPropagation()}
      >
        <div style={s.header}>
          <h3 id="ku-dialog-title" style={{ ...s.title, color: danger ? '#c62828' : '#014A32' }}>
            {title || (isConfirm ? 'ยืนยันการดำเนินการ' : 'แจ้งเตือน')}
          </h3>
        </div>
        {message && <div style={s.body}>{message}</div>}
        <div style={s.footer}>
          {isConfirm && (
            <button style={s.cancelBtn} onClick={() => onClose(false)}>
              {cancelText || 'ยกเลิก'}
            </button>
          )}
          <button
            style={{ ...s.confirmBtn, ...(danger ? s.dangerBtn : {}) }}
            onClick={() => onClose(isConfirm ? true : undefined)}
            autoFocus
          >
            {confirmText || (isConfirm ? 'ยืนยัน' : 'ตกลง')}
          </button>
        </div>
      </div>
    </div>
  )
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 3000,
    background: 'rgba(1, 74, 50, 0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  modal: {
    background: 'white', borderRadius: 16, width: '100%', maxWidth: 420,
    boxShadow: '0 20px 50px rgba(1, 74, 50, 0.25)', overflow: 'hidden',
  },
  header: { padding: '20px 24px 8px' },
  title: { margin: 0, fontSize: 18, fontWeight: 700 },
  body: {
    padding: '4px 24px 18px', fontSize: 14, lineHeight: 1.7, color: '#444',
    whiteSpace: 'pre-line',
  },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: 10,
    padding: '14px 24px 20px', borderTop: '1px solid #eef2ee',
  },
  cancelBtn: {
    padding: '10px 20px', borderRadius: 10, border: '1px solid #d5ddd5',
    background: 'white', color: '#333', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  confirmBtn: {
    padding: '10px 22px', borderRadius: 10, border: 'none',
    background: 'linear-gradient(135deg, #03A96B 0%, #028152 100%)', color: 'white',
    fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
  dangerBtn: { background: '#c62828' },
}
