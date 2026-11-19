import { useCallback, useEffect, useRef, useState } from 'react'
import { parisToday } from '../lib/dates'
import {
  createTeam,
  fetchTeam,
  joinTeam,
  leaveTeam,
  loadTeamCache,
  loadTeamLink,
  previewTeam,
  pushPicks,
  rotateInviteCode,
  saveTeamCache,
  saveTeamLink,
  SyncError,
  type PushPick,
  type TeamData,
  type TeamLink,
} from '../lib/sync'
import { friendlyError, type SyncMember } from '../lib/team'

export type SyncStatus = 'idle' | 'loading' | 'error'

/** Évite de redemander le serveur à chaque retour sur l'appli. */
const MIN_GAP_MS = 20_000

export function useTeam() {
  const [link, setLink] = useState<TeamLink | null>(loadTeamLink)
  const [data, setData] = useState<TeamData | null>(loadTeamCache)
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [error, setError] = useState<string>()
  const [syncedAt, setSyncedAt] = useState<number>()
  const lastFetch = useRef(0)
  const busy = useRef(false)

  const forget = useCallback(() => {
    saveTeamLink(null)
    saveTeamCache(null)
    setLink(null)
    setData(null)
    setSyncedAt(undefined)
  }, [])

  const adopt = useCallback((l: TeamLink) => {
    saveTeamLink(l)
    saveTeamCache(null)
    setLink(l)
    setData(null)
    setError(undefined)
  }, [])

  const refresh = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!link || busy.current) return
      if (!opts?.force && Date.now() - lastFetch.current < MIN_GAP_MS) return
      busy.current = true
      lastFetch.current = Date.now()
      setStatus('loading')
      try {
        const d = await fetchTeam(link, parisToday())
        setData(d)
        saveTeamCache(d)
        setSyncedAt(Date.now())
        setError(undefined)
        setStatus('idle')
      } catch (e) {
        if (e instanceof SyncError && e.kind === 'not-member') forget()
        setError(friendlyError(e))
        setStatus('error')
      } finally {
        busy.current = false
      }
    },
    [link, forget],
  )

  // Au démarrage, puis chaque fois que l'appli revient au premier plan ou retrouve Internet.
  useEffect(() => {
    void refresh({ force: true })
  }, [refresh])
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    const onOnline = () => void refresh({ force: true })
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [refresh])

  /** Crée l'équipe ; `mine` : historique déjà importé sur cet appareil, envoyé dans la foulée. */
  const create = useCallback(
    async (teamName: string, pseudo: string, mine?: PushPick[]) => {
      const l = await createTeam(teamName, pseudo)
      adopt(l)
      if (mine?.length) await pushPicks(l, pseudo, mine)
    },
    [adopt],
  )

  const join = useCallback(
    async (code: string, pseudo: string, mine?: PushPick[]) => {
      const l = await joinTeam(code, pseudo)
      adopt(l)
      if (mine?.length) await pushPicks(l, pseudo, mine)
    },
    [adopt],
  )

  const importPicks = useCallback(
    async (memberName: string, picks: PushPick[]) => {
      if (!link) return
      await pushPicks(link, memberName, picks)
      await refresh({ force: true })
    },
    [link, refresh],
  )

  const leave = useCallback(
    async (deleteData: boolean) => {
      if (!link) return
      await leaveTeam(link, deleteData)
      forget()
    },
    [link, forget],
  )

  const rotate = useCallback(async () => {
    if (!link) return
    await rotateInviteCode(link)
    await refresh({ force: true })
  }, [link, refresh])

  const members: SyncMember[] = data?.members ?? []
  return {
    link,
    teamName: data?.teamName ?? link?.teamName,
    inviteCode: data?.inviteCode ?? link?.inviteCode,
    members,
    status,
    error,
    syncedAt,
    refresh: () => refresh({ force: true }),
    create,
    join,
    preview: previewTeam,
    importPicks,
    leave,
    rotate,
  }
}

export type TeamApi = ReturnType<typeof useTeam>
