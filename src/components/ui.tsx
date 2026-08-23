import { useEffect, useState, type ReactNode } from 'react'
import { pushBackHandler } from '../lib/backButton'

export const Sheet = ({
  open, onClose, children, title,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
}) => {
  if (!open) return null
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={title}>
        <div className="sheet-grip" />
        {children}
      </div>
    </>
  )
}

export const SheetTabs = ({
  tabs, active, onChange,
}: {
  tabs: { id: string; label: string }[]
  active: string
  onChange: (id: string) => void
}) => (
  <div className="sheet-tabs">
    {tabs.map(t => (
      <button
        key={t.id}
        className={`sheet-tab ${t.id === active ? 'active' : ''}`}
        onClick={() => onChange(t.id)}
      >
        {t.label}
      </button>
    ))}
  </div>
)

export const SliderRow = ({
  label, value, min, max, step, onChange, format,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) => (
  <div className="setting-group">
    <div className="setting-label">
      <span>{label}</span>
      <span className="value">{format ? format(value) : value}</span>
    </div>
    <input
      className="slider"
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
    />
  </div>
)

export const Segmented = <T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) => (
  <div className="segmented">
    {options.map(o => (
      <button
        key={o.value}
        className={o.value === value ? 'active' : ''}
        onClick={() => onChange(o.value)}
      >
        {o.label}
      </button>
    ))}
  </div>
)

export const ToggleRow = ({
  title, sub, on, onChange,
}: {
  title: string
  sub?: string
  on: boolean
  onChange: (v: boolean) => void
}) => (
  <button className="row-card" style={{ width: '100%', textAlign: 'left' }} onClick={() => onChange(!on)}>
    <div className="grow">
      <div className="title">{title}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
    <span className={`toggle ${on ? 'on' : ''}`} />
  </button>
)

let toastTimer: ReturnType<typeof setTimeout> | null = null
let setToastImpl: ((msg: string) => void) | null = null

export const toast = (msg: string) => setToastImpl?.(msg)

export const ToastHost = () => {
  const [msg, setMsg] = useState('')
  useEffect(() => {
    setToastImpl = (m: string) => {
      setMsg(m)
      if (toastTimer) clearTimeout(toastTimer)
      toastTimer = setTimeout(() => setMsg(''), 2600)
    }
    return () => { setToastImpl = null }
  }, [])
  if (!msg) return null
  return (
    <div className="toast-wrap">
      <div className="toast">{msg}</div>
    </div>
  )
}

interface ConfirmState {
  title: string
  body?: string
  confirmLabel: string
  danger: boolean
  resolve: (ok: boolean) => void
}

let setConfirmImpl: ((s: ConfirmState | null) => void) | null = null

// 原生 confirm() 的按钮文字跟随系统语言，无法保证中文，改用应用内对话框
export const confirmDialog = (title: string, opts?: {
  body?: string
  confirmLabel?: string
  danger?: boolean
}): Promise<boolean> =>
  new Promise(resolve => {
    if (!setConfirmImpl) {
      resolve(window.confirm(title))
      return
    }
    setConfirmImpl({
      title,
      body: opts?.body,
      confirmLabel: opts?.confirmLabel ?? '确定',
      danger: opts?.danger ?? true,
      resolve,
    })
  })

export const ConfirmHost = () => {
  const [state, setState] = useState<ConfirmState | null>(null)
  useEffect(() => {
    setConfirmImpl = setState
    return () => { setConfirmImpl = null }
  }, [])
  // Android 返回键取消确认框（栈顶优先于阅读页的处理器）
  useEffect(() => {
    if (!state) return
    return pushBackHandler(() => {
      state.resolve(false)
      setState(null)
      return true
    })
  }, [state])
  if (!state) return null
  const close = (ok: boolean) => {
    state.resolve(ok)
    setState(null)
  }
  return (
    <div className="confirm-overlay" onClick={() => close(false)}>
      <div className="confirm-card" role="alertdialog" aria-label={state.title} onClick={e => e.stopPropagation()}>
        <div className="confirm-title">{state.title}</div>
        {state.body && <div className="confirm-body">{state.body}</div>}
        <div className="confirm-actions">
          <button className="confirm-btn" onClick={() => close(false)}>取消</button>
          <button className={`confirm-btn primary ${state.danger ? 'danger' : ''}`} onClick={() => close(true)}>
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
