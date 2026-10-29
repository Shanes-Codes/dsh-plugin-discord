import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Language gate.
 *
 * This plugin is installed from upstream, whose user-facing text is Chinese,
 * and the English build is maintained on top of it. Any upstream update can
 * therefore reintroduce CJK, so the suite fails rather than trusting that
 * whoever merged last noticed. Every entry in ALLOWED is a deliberate
 * exception; any other line containing CJK is text to translate.
 *
 * lib/ is scanned alongside src/ because lib/ is what the dsh profile
 * actually loads, so a bundle that drifted out of sync with the sources is
 * just as broken as Chinese source. tests/ is not scanned: the specs keep
 * Chinese fixtures on purpose, to prove the plugin copes with Chinese input.
 *
 * Adding upstream functionality that genuinely needs CJK in shipped text
 * means adding a pattern below, with the reason written out.
 */

/** CJK unified ideographs, plus CJK punctuation and fullwidth forms. */
const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/

/** CJK that is functional rather than user-facing prose. */
const ALLOWED: { readonly pattern: RegExp; readonly why: string }[] = [
  { pattern: /一-鿿/, why: 'the CJK range inside the attachment filename slug' },
]

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Directories walked recursively, and single files scanned as-is. */
const DIRECTORIES = ['src', 'scripts', 'lib', '.github']
const FILES = ['README.md', 'cordis.patch.yml']
const EXTENSIONS = new Set(['.ts', '.mts', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml'])

function targets(): string[] {
  const found: string[] = []
  for (const dir of DIRECTORIES) {
    const walk = (path: string): void => {
      for (const entry of readdirSync(path)) {
        const full = join(path, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (EXTENSIONS.has(full.slice(full.lastIndexOf('.')))) found.push(full)
      }
    }
    try {
      walk(join(ROOT, dir))
    } catch {
      // A missing optional directory simply narrows the scan.
    }
  }
  for (const file of FILES) {
    try {
      statSync(join(ROOT, file))
      found.push(join(ROOT, file))
    } catch {
      // Same: absent file, nothing to check.
    }
  }
  return found.sort()
}

function offenders(): string[] {
  const bad: string[] = []
  for (const file of targets()) {
    const lines = readFileSync(file, 'utf8').split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? ''
      if (!CJK.test(line)) continue
      if (ALLOWED.some(entry => entry.pattern.test(line))) continue
      bad.push(`${relative(ROOT, file)}:${index + 1}: ${line.trim().slice(0, 120)}`)
    }
  }
  return bad
}

describe('language gate', () => {
  it('scans the sources, the built bundle and the docs', () => {
    // Guards the gate itself: a broken walk would silently pass everything.
    const scanned = targets()
    expect(scanned.some(file => file.endsWith(`${join('src', 'index.ts')}`))).toBe(true)
    expect(scanned.some(file => file.endsWith(`${join('lib', 'index.js')}`))).toBe(true)
    expect(scanned.some(file => file.endsWith('README.md'))).toBe(true)
  })

  it('keeps shipped text English, apart from the documented exceptions', () => {
    const found = offenders()
    expect(found, `stray CJK, translate it or add a deliberate exception:\n${found.join('\n')}`).toEqual([])
  })
})
