import { useEffect, useState } from 'react'
import { useSettings, resolveTheme } from './store/settings'
import { Library } from './pages/Library'
import { Reader } from './pages/Reader'
import { ToastHost, ConfirmHost } from './components/ui'
import { ensureLibraryMigrated } from './lib/librarySources'
import { ensureSyncMigrated } from './lib/syncSources'

export default function App() {
  const { settings, loaded, load } = useSettings()
  const [screen, setScreen] = useState<'library' | 'reader'>('library')
  const [bookId, setBookId] = useState<number | null>(null)

  useEffect(() => { void load() }, [load])

  // 一次性迁移旧 kv → 新的 sources 列表
  useEffect(() => {
    void ensureLibraryMigrated()
    void ensureSyncMigrated()
  }, [])

  useEffect(() => {
    document.body.classList.toggle('dark', resolveTheme(settings).dark)
  }, [settings])

  if (!loaded) {
    return (
      <div className="loading-screen">
        <div className="seal-spin" />
        <div>夹 页</div>
      </div>
    )
  }

  return (
    <>
      {screen === 'library' ? (
        <Library
          onOpen={id => {
            setBookId(id)
            setScreen('reader')
          }}
        />
      ) : (
        bookId != null && (
          <Reader
            bookId={bookId}
            onBack={() => {
              setScreen('library')
              setBookId(null)
            }}
          />
        )
      )}
      <ToastHost />
      <ConfirmHost />
    </>
  )
}
