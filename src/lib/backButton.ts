// Android 返回键桥：原生 MainActivity 拦截返回键后调用 window.__androidBack()，
// 由 JS 决定行为。处理器按栈组织，后注册者优先（如确认框盖在阅读页之上）。
// 返回 false 表示无人处理，原生侧收到后将应用退到后台。
type BackHandler = () => boolean

const stack: BackHandler[] = []

declare global {
  interface Window {
    __androidBack?: () => boolean
  }
}

export const pushBackHandler = (fn: BackHandler) => {
  stack.push(fn)
  return () => {
    const i = stack.indexOf(fn)
    if (i >= 0) stack.splice(i, 1)
  }
}

window.__androidBack = () => {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]()) return true
  }
  return false
}
