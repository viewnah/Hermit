import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
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

const sliderFill = (value: number, min: number, max: number) =>
  `${((value - min) / (max - min)) * 100}%`

export const SliderRow = ({
  label, value, min, max, step, onChange, format,
  start, end, compact,
}: {
  label?: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
  /** 滑块左侧元素：字母端点（如 A）或图标 */
  start?: ReactNode
  /** 滑块右端元素（如 B） */
  end?: ReactNode
  /** 紧凑模式：用于并排两列布局 */
  compact?: boolean
}) => (
  <div className={compact ? 'slider-cell compact' : 'slider-cell'}>
    {label && <div className="slider-title">{label}</div>}
    <div className="slider-main">
      {start && <span className="slider-edge">{start}</span>}
      <input
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--fill': sliderFill(value, min, max) } as CSSProperties}
        onChange={e => onChange(parseFloat(e.target.value))}
      />
      <span className="slider-value">{format ? format(value) : value}</span>
      {end && <span className="slider-edge end">{end}</span>}
    </div>
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
