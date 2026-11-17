import { useCallback, useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Chrome/Edge/Samsung Internet sur Android déclenchent `beforeinstallprompt` une seule fois, parfois
// avant que React ne démarre : on l'écoute dès le chargement du module et on le garde en mémoire.
let deferred: BeforeInstallPromptEvent | null = null
let installedFlag = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    installedFlag = true
    deferred = null
    notify()
  })
}

/** Installation en un tap sur Android (Chrome, Edge, Samsung Internet). iOS n'a pas d'équivalent. */
export function useInstallPrompt() {
  const [, force] = useState(0)

  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])

  const install = useCallback(async () => {
    if (!deferred) return
    const evt = deferred
    await evt.prompt()
    const { outcome } = await evt.userChoice
    if (outcome === 'accepted') installedFlag = true
    deferred = null // l'événement ne peut servir qu'une fois
    notify()
  }, [])

  return { canInstall: deferred !== null, installed: installedFlag, install }
}
