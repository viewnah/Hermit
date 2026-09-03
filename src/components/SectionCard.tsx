import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from 'react'

export interface SectionCardProps {
  /** 折叠态左侧图标节点 */
  icon: ReactNode
  /** 折叠态主标题 */
  title: string
  /** 折叠态副标题（状态摘要） */
  subtitle?: ReactNode
  /** 折叠态右侧主操作（开关/进入按钮/加号）；点击会触发 onPrimaryClick */
  primaryAction?: ReactNode
  /** 自定义折叠态主操作点击；未提供时使用默认折叠态卡片点击行为 */
  onPrimaryClick?: () => void
  /** 折叠态点击主体（非 primaryAction 区） */
  onCollapsedClick?: () => void
  /** 展开态内容 */
  children?: ReactNode
  /** 展开态底部按钮（保存/测试连接/删除等） */
  footerActions?: ReactNode
  /** 展开态标题（默认与 title 相同） */
  expandedTitle?: string
  /** 是否处于展开态（受控） */
  expanded: boolean
  /** 展开回调（点击 primaryAction / 折叠态主体 / 长按都会触发） */
  onExpand: () => void
  /** 收起回调（点击顶部返回按钮） */
  onCollapse: () => void
  /** 长按触发：默认与 onExpand 一致 */
  onLongPress?: () => void
  /** 长按阈值（毫秒），默认 500 */
  longPressMs?: number
  /** 折叠态卡片整体是否可点击（默认 true） */
  clickable?: boolean
  /** 折叠态 active 态背景（按下时） */
  className?: string
}

/**
 * 通用"服务栏目"卡片：折叠态展示概要+主操作，长按/点击展开配置面板。
 * 复用了现有的 row-card / field / btn / sub-panel 视觉风格。
 */
export const SectionCard = ({
  icon, title, subtitle, primaryAction, onPrimaryClick,
  onCollapsedClick, children, footerActions, expandedTitle,
  expanded, onExpand, onCollapse, onLongPress,
  longPressMs = 500, clickable = true, className,
}: SectionCardProps) => {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)

  // 卸载时清理定时器
  useEffect(() => () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
  }, [])

  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (expanded || !clickable) return
    // preventDefault 阻止 WebView 长按文本选择抢占手势
    e.preventDefault()
    longPressFired.current = false
    clearPress()
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null
      longPressFired.current = true
      // 震动反馈（如果可用）
      try { navigator.vibrate?.(10) } catch { /* ignore */ }
      if (onLongPress) onLongPress()
      else onExpand()
    }, longPressMs)
  }
  const handlePointerUp = () => clearPress()
  const handlePointerLeave = () => clearPress()
  const handlePointerCancel = () => clearPress()
  const handleContextMenu = (e: MouseEvent) => e.preventDefault()

  // 折叠态点击主操作
  const handlePrimaryClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    // 如果刚刚触发了长按，则不响应点击
    if (longPressFired.current) {
      longPressFired.current = false
      return
    }
    clearPress()
    if (onPrimaryClick) onPrimaryClick()
    else onExpand()
  }

  // 折叠态点击主体
  const handleCollapsedClick = () => {
    if (longPressFired.current) {
      longPressFired.current = false
      return
    }
    clearPress()
    if (onCollapsedClick) onCollapsedClick()
    else onExpand()
  }

  if (expanded) {
    return (
      <div className={`section-card expanded ${className ?? ''}`}>
        <div className="section-card-header">
          <button className="sub-back" onClick={onCollapse} aria-label="收起">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <span className="section-card-expanded-title">{expandedTitle ?? title}</span>
        </div>
        <div className="section-card-body">
          {children}
        </div>
        {footerActions && (
          <div className="section-card-footer">{footerActions}</div>
        )}
      </div>
    )
  }

  return (
    <button
      className={`section-card collapsed ${className ?? ''}`}
      onClick={clickable ? handleCollapsedClick : undefined}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerCancel}
      onContextMenu={handleContextMenu}
      type="button"
    >
      <span className="section-card-icon">{icon}</span>
      <span className="section-card-main">
        <span className="section-card-title">{title}</span>
        {subtitle != null && (
          <span className="section-card-subtitle">{subtitle}</span>
        )}
      </span>
      {primaryAction && (
        <span className="section-card-action" onClick={handlePrimaryClick}>
          {primaryAction}
        </span>
      )}
    </button>
  )
}