/**
 * File-transfer helpers for both directions of the bridge.
 *
 * Outgoing: the agent asks for an upload by writing a marker line in its
 * reply — `[discord-file: /absolute/path]` — which the bridge strips from the
 * text and turns into a Discord attachment. Incoming: files the user attaches
 * on Discord are saved under the session's working directory and announced to
 * the agent as paths.
 *
 * @module dsh-plugin-discord/attachments
 */

import { basename, resolve, sep } from 'node:path'

/** One marker line the agent wrote; the path is taken verbatim. */
const FILE_MARKER = /^[ \t]*\[discord-file:[ \t]*([^\]\n]+?)[ \t]*\][ \t]*$/gm

/**
 * Pull `[discord-file: …]` markers out of a reply.
 * @param text - the assistant's reply text.
 * @returns the text with marker lines removed, and the marked paths in order.
 */
export function extractFileMarkers(text: string): { text: string; paths: string[] } {
  const paths: string[] = []
  const cleaned = text.replace(FILE_MARKER, (_line, path: string) => {
    paths.push(path)
    return ''
  })
  return { text: cleaned.replace(/\n{3,}/g, '\n\n').trim(), paths }
}

/**
 * Whether `child` lies at or under `root` (lexical, after resolution).
 * Callers pass realpath-ed inputs when symlink escape matters.
 */
export function isPathUnder(child: string, root: string): boolean {
  const childPath = resolve(child)
  const rootPath = resolve(root)
  return childPath === rootPath || childPath.startsWith(rootPath.endsWith(sep) ? rootPath : rootPath + sep)
}

/** A filesystem-safe name for one incoming Discord attachment. */
export function sanitizeFilename(name: string): string {
  const cleaned = basename(name).replace(/[^\w.\-一-鿿]+/g, '_')
  const bounded = cleaned.length > 80 ? cleaned.slice(cleaned.length - 80) : cleaned
  return bounded === '' || /^\.+$/.test(bounded) ? 'file' : bounded
}

/**
 * The capability notice injected once per live agent, so a model driven from
 * Discord knows the bridge's transport abilities instead of hunting for other
 * Discord tooling on the host.
 * @param maxUploadBytes - the deployment's outgoing attachment cap.
 * @param uploadRoots - extra directories uploads may come from.
 * @returns the notice text.
 */
export function capabilityNotice(maxUploadBytes: number, uploadRoots: readonly string[] = []): string {
  const megabytes = Math.floor(maxUploadBytes / 1_000_000)
  const roots = uploadRoots.length === 0
    ? 'Only files inside the session working directory'
    : `Only files inside the session working directory and these directories: ${uploadRoots.join(', ')}`
  return [
    '<system-reminder>',
    'This session is talking to the user through the Discord bridge (dsh-plugin-discord); the user is on Discord right now.',
    `- To send a file or image to the user: write [discord-file: /absolute/path], and the bridge uploads that file as a Discord attachment and strips the line from the text. ${roots}, max ${String(megabytes)}MB; images show inline in Discord.`,
    '- When calling a tool or skill that produces files (image generation, document export), point its output-directory option (such as -o/--output) at the session working directory, so the artifact is sendable by construction.',
    '- If an artifact already landed outside the allowed directories (tools often default to ~/Downloads), copy it into the session working directory first, then write the marker for the copied path — otherwise the safety fence rejects it.',
    '- Files and images the user sends in Discord are saved automatically under .discord-uploads/, and the message carries the path, so just read it.',
    '- Discord renders markdown, but replies are capped at 2000 characters and anything longer is truncated, so stay concise.',
    '- Do not look for or use other Discord tooling or credentials on the host to send messages; this bridge owns all Discord traffic.',
    '</system-reminder>',
  ].join('\n')
}
