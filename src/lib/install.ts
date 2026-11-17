// Détection de la plateforme pour afficher le bon parcours d'installation (Android / iPhone).

export type Os = 'ios' | 'android' | 'desktop'
export type Browser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'samsung' | 'inapp' | 'other'

export interface PlatformInfo {
  os: Os
  browser: Browser
  /** L'appli est déjà lancée depuis l'écran d'accueil. */
  standalone: boolean
}

export interface PlatformEnv {
  ua: string
  platform?: string
  maxTouchPoints?: number
  standalone?: boolean
}

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|BytedanceWebview|Twitter|LinkedInApp|GSA\//i

export function detectPlatform(env: PlatformEnv): PlatformInfo {
  const { ua } = env
  // iPadOS 13+ se présente comme un Mac : on le reconnaît à son écran tactile.
  const ios = /iPhone|iPad|iPod/.test(ua) || (env.platform === 'MacIntel' && (env.maxTouchPoints ?? 0) > 1)
  const android = /Android/i.test(ua)
  const os: Os = ios ? 'ios' : android ? 'android' : 'desktop'

  let browser: Browser = 'other'
  if (IN_APP.test(ua) || (android && /; wv\)/.test(ua))) browser = 'inapp'
  else if (/EdgA|EdgiOS|Edg\//.test(ua)) browser = 'edge'
  else if (/Firefox|FxiOS/.test(ua)) browser = 'firefox'
  else if (/SamsungBrowser/.test(ua)) browser = 'samsung'
  else if (/CriOS|Chrome/.test(ua)) browser = 'chrome'
  else if (ios && /Safari\//.test(ua)) browser = 'safari'
  else if (ios) browser = 'inapp' // WebView iOS : pas de jeton "Safari/" dans l'user-agent
  else if (/Safari\//.test(ua)) browser = 'safari'

  return { os, browser, standalone: !!env.standalone }
}

const OVERRIDES: Record<string, PlatformInfo> = {
  ios: { os: 'ios', browser: 'safari', standalone: false },
  'ios-chrome': { os: 'ios', browser: 'chrome', standalone: false },
  'ios-inapp': { os: 'ios', browser: 'inapp', standalone: false },
  android: { os: 'android', browser: 'chrome', standalone: false },
  'android-firefox': { os: 'android', browser: 'firefox', standalone: false },
  'android-inapp': { os: 'android', browser: 'inapp', standalone: false },
  desktop: { os: 'desktop', browser: 'chrome', standalone: false },
  installed: { os: 'android', browser: 'chrome', standalone: true },
}

/**
 * Permet de prévisualiser un parcours d'installation depuis n'importe quel appareil :
 * ajouter `?platform=ios` (ou ios-chrome, ios-inapp, android, android-firefox, android-inapp, desktop, installed)
 * à l'adresse, avant le `#`.
 */
export function platformOverride(search: string): PlatformInfo | undefined {
  return OVERRIDES[new URLSearchParams(search).get('platform') ?? '']
}

/** Lit l'environnement réel du navigateur (à n'appeler que côté client). */
export function currentPlatform(): PlatformInfo {
  const forced = platformOverride(location.search)
  if (forced) return forced
  const nav = navigator as Navigator & { standalone?: boolean }
  const standalone =
    nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true
  return detectPlatform({
    ua: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone,
  })
}
