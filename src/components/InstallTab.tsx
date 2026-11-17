import { useEffect, useState, type ReactNode } from 'react'
import QRCode from 'qrcode'
import { currentPlatform, type PlatformInfo } from '../lib/install'
import { useInstallPrompt } from '../hooks/useInstallPrompt'

const ShareIcon = () => (
  <svg className="inline-icon" viewBox="0 0 24 24" aria-label="Partager" role="img">
    <path d="M12 3v12M8 7l4-4 4 4M6 11v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const PlusIcon = () => (
  <svg className="inline-icon" viewBox="0 0 24 24" aria-label="Plus" role="img">
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)
const MenuIcon = () => (
  <svg className="inline-icon" viewBox="0 0 24 24" aria-label="Menu" role="img">
    <circle cx="12" cy="5" r="1.8" fill="currentColor" />
    <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    <circle cx="12" cy="19" r="1.8" fill="currentColor" />
  </svg>
)

function Steps({ children }: { children: ReactNode }) {
  return <ol className="steps">{children}</ol>
}

/** Parcours d'installation adapté à l'appareil du joueur. */
export function InstallCard({ platform }: { platform: PlatformInfo }) {
  const { canInstall, installed, install } = useInstallPrompt()

  if (platform.standalone || installed) {
    return (
      <section className="card">
        <h2>✅ Appli installée</h2>
        <p>Tu l’utilises déjà depuis ton écran d’accueil.</p>
      </section>
    )
  }

  if (platform.browser === 'inapp') {
    return (
      <section className="card warn">
        <h2>Ouvre ce lien dans ton navigateur</h2>
        <p>
          Les navigateurs intégrés (WhatsApp, Instagram, Messenger…) ne permettent pas d’installer l’appli.
          {platform.os === 'ios' ? (
            <> Touche <MenuIcon /> ou <ShareIcon /> puis <strong>« Ouvrir dans Safari »</strong>.</>
          ) : (
            <> Touche <MenuIcon /> puis <strong>« Ouvrir dans Chrome »</strong> (ou « Ouvrir dans le navigateur »).</>
          )}
        </p>
      </section>
    )
  }

  if (platform.os === 'android') {
    return (
      <section className="card">
        <h2>Installer sur Android</h2>
        {canInstall ? (
          <>
            <p>Un seul tap, sans passer par le Play Store.</p>
            <button className="btn primary big" onClick={install}>
              Installer l’appli
            </button>
          </>
        ) : (
          <Steps>
            <li>Touche <MenuIcon /> en haut à droite du navigateur.</li>
            <li>Choisis <strong>« Installer l’application »</strong> (ou « Ajouter à l’écran d’accueil »).</li>
            <li>Confirme : l’icône apparaît sur ton écran d’accueil.</li>
          </Steps>
        )}
      </section>
    )
  }

  if (platform.os === 'ios') {
    const safari = platform.browser === 'safari'
    return (
      <section className="card">
        <h2>Installer sur iPhone</h2>
        <Steps>
          <li>
            Touche <ShareIcon /> <strong>Partager</strong>
            {safari ? ' en bas de l’écran' : ' (barre d’adresse ou menu du navigateur)'}.
          </li>
          <li>
            Fais défiler et choisis <PlusIcon /> <strong>« Sur l’écran d’accueil »</strong>.
          </li>
          <li>
            Touche <strong>« Ajouter »</strong> : l’icône apparaît sur ton écran d’accueil.
          </li>
        </Steps>
        {!safari && <p className="muted">Si l’option est absente, ouvre ce lien dans Safari.</p>}
      </section>
    )
  }

  return (
    <section className="card">
      <h2>Installer sur ton téléphone</h2>
      <p>Scanne le QR code ci-dessous avec l’appareil photo de ton téléphone, ou envoie-toi le lien.</p>
    </section>
  )
}

/** Lien d'invitation : QR code (en présentiel) et bouton Partager (WhatsApp, Messenger…). */
export function ShareCard() {
  const url = `${location.origin}${location.pathname}`
  const [qr, setQr] = useState<string>()
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator.share === 'function'

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: '#0b1f3a', light: '#ffffff' } })
      .then((d) => !cancelled && setQr(d))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [url])

  const share = async () => {
    try {
      await navigator.share({
        title: 'TTFL 76ersFR',
        text: 'Les joueurs disponibles de toute l’équipe pour chaque soirée TTFL :',
        url,
      })
    } catch {
      // partage annulé par l'utilisateur
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copie ce lien :', url)
    }
  }

  return (
    <section className="card">
      <h2>Inviter l’équipe</h2>
      <p>Envoie ce lien dans le groupe : il s’ouvre directement, sans compte ni téléchargement.</p>
      <div className="row-actions">
        {canShare && (
          <button className="btn primary" onClick={share}>
            Partager le lien
          </button>
        )}
        <button className="btn" onClick={copy}>
          {copied ? 'Lien copié ✓' : 'Copier le lien'}
        </button>
      </div>
      {qr && <img className="qr" src={qr} width={240} height={240} alt="QR code du lien de l’appli" />}
      <p className="muted small">{url}</p>
    </section>
  )
}

export function InstallTab() {
  const [platform] = useState(currentPlatform)
  return (
    <>
      <InstallCard platform={platform} />
      <ShareCard />
    </>
  )
}
