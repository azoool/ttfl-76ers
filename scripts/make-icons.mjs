// Génère les icônes PWA (PNG) à partir des SVG. Usage : npm run icons
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fullBleed = await readFile(join(root, 'scripts', 'icon-full-bleed.svg'))
const rounded = await readFile(join(root, 'public', 'icon.svg'))

const jobs = [
  ['pwa-192.png', rounded, 192],
  ['pwa-512.png', rounded, 512],
  // Android "maskable" : fond plein, le système applique son propre masque.
  ['pwa-maskable-512.png', fullBleed, 512],
  // iOS applique lui-même les coins arrondis : fond plein également.
  ['apple-touch-icon.png', fullBleed, 180],
]

for (const [name, svg, size] of jobs) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(join(root, 'public', name))
  console.log('✓', name)
}
