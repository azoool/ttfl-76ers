import { useCallback, useEffect, useState } from 'react'
import type { Member } from './lib/availability'
import { loadMembers, removeMember, saveMembers, upsertMember } from './lib/storage'
import { currentPlatform } from './lib/install'
import { DisposTab } from './components/DisposTab'
import { ImportTab } from './components/ImportTab'
import { InstallTab } from './components/InstallTab'

type Tab = 'dispos' | 'import' | 'installer'
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dispos', label: 'Disponibles', icon: '🏀' },
  { id: 'import', label: 'Importer', icon: '📋' },
  { id: 'installer', label: 'Installer', icon: '📲' },
]

function tabFromHash(): Tab {
  const h = location.hash.replace(/^#\/?/, '')
  return TABS.some((t) => t.id === h) ? (h as Tab) : 'dispos'
}

const DISMISS_KEY = 'ttfl76.installBannerDismissed'

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash)
  const [members, setMembers] = useState<Member[]>(loadMembers)
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => saveMembers(members), [members])

  const go = useCallback((t: Tab) => {
    location.hash = `/${t}`
    setTab(t)
    window.scrollTo(0, 0)
  }, [])

  const onImport = useCallback(
    (name: string, picks: { date: string; player: string }[]) => setMembers((ms) => upsertMember(ms, name, picks)),
    [],
  )
  const onRemove = useCallback((id: string) => setMembers((ms) => removeMember(ms, id)), [])

  const showBanner = !bannerDismissed && tab !== 'installer' && !currentPlatform().standalone
  const dismissBanner = () => {
    setBannerDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // sans importance
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>TTFL 76ersFR</h1>
      </header>

      <main className="content">
        {showBanner && (
          <div className="banner">
            <span>📲 Installe l’appli sur ton écran d’accueil</span>
            <span className="banner-actions">
              <button className="btn small primary" onClick={() => go('installer')}>
                Comment ?
              </button>
              <button className="btn small" onClick={dismissBanner} aria-label="Masquer">
                ✕
              </button>
            </span>
          </div>
        )}
        {tab === 'dispos' && <DisposTab members={members} goImport={() => go('import')} />}
        {tab === 'import' && <ImportTab members={members} onImport={onImport} onRemove={onRemove} />}
        {tab === 'installer' && <InstallTab />}
      </main>

      <nav className="tabbar" aria-label="Navigation">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
