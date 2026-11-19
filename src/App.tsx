import { useCallback, useEffect, useState } from 'react'
import type { Member } from './lib/availability'
import type { Pick } from './lib/parseHistory'
import { loadMembers, removeMember, saveMembers, upsertMember } from './lib/storage'
import { currentPlatform } from './lib/install'
import { parseRoute, TABS, type Route, type Tab } from './lib/team'
import { useTeam } from './hooks/useTeam'
import { DisposTab } from './components/DisposTab'
import { ImportTab } from './components/ImportTab'
import { InstallTab } from './components/InstallTab'
import { TeamTab } from './components/TeamTab'

const DISMISS_KEY = 'ttfl76.installBannerDismissed'

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash))
  const [localMembers, setLocalMembers] = useState<Member[]>(loadMembers)
  const team = useTeam()
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => saveMembers(localMembers), [localMembers])

  const tab = route.tab
  const go = useCallback((t: Tab) => {
    location.hash = `/${t}`
    setRoute({ tab: t })
    window.scrollTo(0, 0)
  }, [])

  const inTeam = team.link !== null
  const members: Member[] = inTeam ? team.members : localMembers
  const myName = team.members.find((m) => m.me)?.name
  // « Profil » : le membre de l'équipe qui correspond à cet appareil, et la clé où mémoriser son choix de membres comptés.
  const meId = inTeam ? team.members.find((m) => m.me)?.id : undefined
  const countedScope = team.link ? `team:${team.link.teamId}:${team.link.memberId}` : 'local'

  const { importPicks } = team
  const onImport = useCallback(
    async (name: string, picks: Pick[]) => {
      if (inTeam) await importPicks(name, picks)
      else setLocalMembers((ms) => upsertMember(ms, name, picks))
    },
    [inTeam, importPicks],
  )
  const onRemove = useCallback((id: string) => setLocalMembers((ms) => removeMember(ms, id)), [])

  const showBanner = !bannerDismissed && tab !== 'installer' && !currentPlatform().standalone
  const dismissBanner = () => {
    setBannerDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // sans importance
    }
  }

  const syncedAt = team.syncedAt
    ? new Date(team.syncedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : undefined

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

        {tab === 'dispos' && (
          <>
            {inTeam && (
              <p className="syncbar">
                👥 {team.teamName}
                {' · '}
                {team.status === 'loading' ? 'synchronisation…' : syncedAt ? `à jour à ${syncedAt}` : 'pas encore synchronisé'}
                {' · '}
                <button className="link" onClick={() => void team.refresh()}>
                  Actualiser
                </button>
                {team.error && <span className="syncbar-error"> — {team.error}</span>}
              </p>
            )}
            <DisposTab members={members} goImport={() => go('import')} meId={meId} scope={countedScope} />
          </>
        )}
        {tab === 'import' && (
          <ImportTab
            members={members}
            onImport={onImport}
            onRemove={inTeam ? undefined : onRemove}
            teamName={inTeam ? team.teamName : undefined}
            myName={myName}
          />
        )}
        {tab === 'equipe' && <TeamTab team={team} joinCode={route.joinCode} localMembers={localMembers} />}
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
