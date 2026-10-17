import { beforeAll, describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RENDERER_SRC, readSource } from './helpers/repo'
import { MISSIONS } from '../src/renderer/src/app/tour/steps'
import { WELCOME_TILES } from '../src/renderer/src/app/tour/Tour'

describe('F3b integrity guards', () => {
  const fileEntries: { path: string; content: string }[] = []
  let combinedCode = ''

  beforeAll(() => {
    function walk(dir: string): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue
        const p = join(dir, entry.name)
        if (entry.isDirectory()) walk(p)
        else if (/\.(ts|tsx|html|json|pqjson)$/.test(entry.name)) {
          fileEntries.push({ path: p, content: readFileSync(p, 'utf8') })
        }
      }
    }
    walk(RENDERER_SRC)
    combinedCode = fileEntries
      .filter((e) => e.path.endsWith('.ts') || e.path.endsWith('.tsx') || e.path.endsWith('.html'))
      .map((e) => e.content)
      .join('\n')
  }, 30000)

  it('no file in renderer src or README ever contains "Shapes & Geometry"', () => {
    expect(fileEntries.length).toBeGreaterThan(50)
    for (const f of fileEntries) {
      expect(f.content.includes('Shapes & Geometry'), `Found "Shapes & Geometry" in ${f.path}`).toBe(false)
    }
    expect(readSource('README.md').includes('Shapes & Geometry')).toBe(false)
  })

  it('every mission anchor exists as a data-tour attribute in renderer src', () => {
    expect(MISSIONS.length).toBe(6)
    for (const m of MISSIONS) {
      if (/^tool-/.test(m.anchor)) {
        expect(combinedCode, `Mission ${m.id} tool anchor ${m.anchor}`).toContain('data-tour={`tool-${id}`}')
      } else {
        expect(combinedCode, `Mission ${m.id} anchor ${m.anchor}`).toContain(`data-tour="${m.anchor}"`)
      }
    }
  })

  it('WELCOME_TILES Geometry tile is labelled "Geometry", never "Shapes & Geometry"', () => {
    const shapeTile = WELCOME_TILES.find((t) => t.mode === 'shapes')
    expect(shapeTile).toBeDefined()
    expect(shapeTile?.label).toBe('Geometry')
    expect(shapeTile?.label).not.toContain('Shapes')
    const tourSource = readSource('src/renderer/src/app/tour/Tour.tsx')
    expect(tourSource).not.toContain('Shapes & Geometry')
  })
})
