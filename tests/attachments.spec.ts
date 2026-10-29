import { describe, expect, it } from 'vitest'
import { capabilityNotice, extractFileMarkers, isPathUnder, sanitizeFilename } from '../src/attachments.ts'

describe('extractFileMarkers', () => {
  it('leaves markerless text untouched', () => {
    expect(extractFileMarkers('plain reply')).toEqual({ text: 'plain reply', paths: [] })
  })

  it('extracts one marker and strips its line', () => {
    const input = 'The document is ready.\n\n[discord-file: /tmp/report.md]\n\nA few more notes as well.'
    const result = extractFileMarkers(input)
    expect(result.paths).toEqual(['/tmp/report.md'])
    expect(result.text).toBe('The document is ready.\n\nA few more notes as well.')
    expect(result.text).not.toContain('discord-file')
  })

  it('extracts several markers in order', () => {
    const input = '[discord-file: /a/x.png]\n[discord-file: /b/y.pdf]\nDone'
    const result = extractFileMarkers(input)
    expect(result.paths).toEqual(['/a/x.png', '/b/y.pdf'])
    expect(result.text).toBe('Done')
  })

  it('tolerates surrounding whitespace, keeps inline mentions as text', () => {
    const result = extractFileMarkers('  [discord-file:  /tmp/a.txt ]  \na mention like [discord-file: not alone on its own line] does not count')
    expect(result.paths).toEqual(['/tmp/a.txt'])
    expect(result.text).toContain('does not count')
  })
})

describe('isPathUnder', () => {
  it('accepts the root itself and its children', () => {
    expect(isPathUnder('/a/b', '/a/b')).toBe(true)
    expect(isPathUnder('/a/b/c.txt', '/a/b')).toBe(true)
  })

  it('rejects siblings and prefix look-alikes', () => {
    expect(isPathUnder('/a/bc/file', '/a/b')).toBe(false)
    expect(isPathUnder('/etc/passwd', '/a/b')).toBe(false)
  })
})

describe('sanitizeFilename', () => {
  it('keeps ordinary and Chinese names', () => {
    expect(sanitizeFilename('report-v2.md')).toBe('report-v2.md')
    expect(sanitizeFilename('工作原理.md')).toBe('工作原理.md')
  })

  it('strips directories and odd characters', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd')
    expect(sanitizeFilename('a b/c:d.txt')).toBe('c_d.txt')
    expect(sanitizeFilename('...')).toBe('file')
  })
})

describe('capabilityNotice', () => {
  it('names the marker and the size cap', () => {
    const notice = capabilityNotice(8_000_000)
    expect(notice).toContain('[discord-file:')
    expect(notice).toContain('8MB')
    expect(notice).toContain('.discord-uploads')
  })

  it('teaches the containment rule, aiming tools at the cwd, and the copy-in fallback', () => {
    const bare = capabilityNotice(8_000_000)
    expect(bare).toContain('Only files inside the session working directory')
    expect(bare).toContain('output-directory option')
    expect(bare).toContain('copy it into the session working directory')
    const withRoots = capabilityNotice(8_000_000, ['/Users/x/Downloads', '/tmp'])
    expect(withRoots).toContain('/Users/x/Downloads')
    expect(withRoots).toContain('/tmp')
  })
})
