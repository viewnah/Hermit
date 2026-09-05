import { useState, type InputHTMLAttributes } from 'react'

const IconEye = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const IconEyeOff = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <line x1="3" y1="3" x2="21" y2="21" />
  </svg>
)

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** 输入框上方标签 */
  label?: string
}

/**
 * 带“显示/隐藏明文”切换的密码输入框。
 * 复用了现有 .field 的样式（label + 输入框），右侧附一个小眼睛按钮。
 */
export const PasswordField = ({ label, className, ...rest }: PasswordFieldProps) => {
  const [show, setShow] = useState(false)
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      <span className="pwd-field">
        <input
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          className={className}
          {...rest}
        />
        <button
          type="button"
          className="pwd-toggle"
          onClick={() => setShow(v => !v)}
          aria-label={show ? '隐藏密码' : '显示密码'}
          tabIndex={-1}
        >
          {show ? <IconEyeOff /> : <IconEye />}
        </button>
      </span>
    </label>
  )
}
