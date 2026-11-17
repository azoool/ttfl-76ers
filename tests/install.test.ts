import { describe, expect, it } from 'vitest'
import { detectPlatform, platformOverride } from '../src/lib/install'

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0.0',
  iphoneWebView:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  androidSamsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  desktopEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  ipadAsMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
}

describe('detectPlatform', () => {
  it.each([
    ['iphoneSafari', 'ios', 'safari'],
    ['iphoneChrome', 'ios', 'chrome'],
    ['iphoneInstagram', 'ios', 'inapp'],
    ['iphoneWebView', 'ios', 'inapp'],
    ['androidChrome', 'android', 'chrome'],
    ['androidSamsung', 'android', 'samsung'],
    ['androidFirefox', 'android', 'firefox'],
    ['androidWebView', 'android', 'inapp'],
    ['desktopChrome', 'desktop', 'chrome'],
    ['desktopEdge', 'desktop', 'edge'],
  ] as const)('%s → %s / %s', (name, os, browser) => {
    expect(detectPlatform({ ua: UA[name] })).toMatchObject({ os, browser, standalone: false })
  })

  it('reconnaît un iPad qui se présente comme un Mac', () => {
    expect(detectPlatform({ ua: UA.ipadAsMac, platform: 'MacIntel', maxTouchPoints: 5 })).toMatchObject({
      os: 'ios',
      browser: 'safari',
    })
    // un vrai Mac (sans écran tactile) reste "desktop"
    expect(detectPlatform({ ua: UA.ipadAsMac, platform: 'MacIntel', maxTouchPoints: 0 }).os).toBe('desktop')
  })

  it('permet de forcer un parcours pour la prévisualisation (?platform=…)', () => {
    expect(platformOverride('?platform=ios')).toMatchObject({ os: 'ios', browser: 'safari' })
    expect(platformOverride('?platform=ios-inapp')).toMatchObject({ os: 'ios', browser: 'inapp' })
    expect(platformOverride('?platform=installed')?.standalone).toBe(true)
    expect(platformOverride('?platform=nimporte')).toBeUndefined()
    expect(platformOverride('')).toBeUndefined()
  })

  it('repère l’appli déjà installée', () => {
    expect(detectPlatform({ ua: UA.iphoneSafari, standalone: true }).standalone).toBe(true)
  })
})
