import { describe, expect, it } from 'vitest'
import { chunkReply, DISCORD_MESSAGE_LIMIT } from '../src/chunk.ts'

describe('chunkReply', () => {
  it('returns nothing for empty text', () => {
    expect(chunkReply('')).toEqual([])
    expect(chunkReply('   \n ')).toEqual([])
  })

  it('keeps a short reply as one chunk', () => {
    expect(chunkReply('short reply')).toEqual(['short reply'])
  })

  it('splits long text and every chunk fits the Discord limit', () => {
    const text = Array.from({ length: 300 }, (_, index) => `paragraph ${String(index)} with enough text to be long.`).join('\n\n')
    const chunks = chunkReply(text, 10)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(DISCORD_MESSAGE_LIMIT)
    // No content lost when under the chunk cap.
    expect(chunks.join('\n').replaceAll(/\s+/g, '')).toContain('paragraph299')
  })

  it('prefers paragraph boundaries', () => {
    const paragraph = 'x'.repeat(1200)
    const chunks = chunkReply(`${paragraph}\n\n${paragraph}`, 10)
    expect(chunks.length).toBe(2)
    expect(chunks[0]).toBe(paragraph)
    expect(chunks[1]).toBe(paragraph)
  })

  it('re-opens a code fence split across chunks', () => {
    const code = Array.from({ length: 200 }, (_, index) => `const line${String(index)} = ${String(index)}`).join('\n')
    const text = `intro text\n\`\`\`ts\n${code}\n\`\`\`\nthe end`
    const chunks = chunkReply(text, 10)
    expect(chunks.length).toBeGreaterThan(1)
    for (const [index, chunk] of chunks.entries()) {
      const fences = (chunk.match(/```/g) ?? []).length
      // Every chunk is fence-balanced, so Discord renders each as code.
      expect(fences % 2, `chunk ${String(index)} has unbalanced fences`).toBe(0)
    }
    expect(chunks[1]?.startsWith('```ts')).toBe(true)
  })

  it('truncates with a notice when exceeding the chunk cap', () => {
    const text = Array.from({ length: 500 }, () => 'y'.repeat(100)).join('\n')
    const chunks = chunkReply(text, 2)
    expect(chunks.length).toBe(2)
    expect(chunks[1]).toContain('truncated')
  })
})
