/**
 * Text-command parsing for the Discord side of the bridge.
 *
 * These are plain text messages, not registered Discord application commands:
 * an unregistered `/new` still arrives as ordinary message content, which
 * keeps the bridge free of command-registration state.
 *
 * @module dsh-plugin-discord/commands
 */

/** One parsed instruction from a Discord message. */
export type BridgeCommand =
  | { kind: 'new'; label: string }
  | { kind: 'sessions' }
  | { kind: 'use'; sessionId: string }
  | { kind: 'current' }
  | { kind: 'stop' }
  | { kind: 'help' }
  | { kind: 'prompt'; text: string }

/**
 * Parse one message into a bridge command.
 *
 * Only the exact names below are intercepted; any other `/`-prefixed text
 * passes through as a prompt so dsh slash commands and ordinary text that
 * merely starts with a slash keep working.
 * @param content - raw Discord message content.
 * @returns the parsed command; empty content parses to a help request.
 */
export function parseCommand(content: string): BridgeCommand {
  const text = content.trim()
  if (text === '') return { kind: 'help' }
  if (!text.startsWith('/')) return { kind: 'prompt', text }
  const spaceIndex = text.search(/\s/)
  const word = (spaceIndex === -1 ? text : text.slice(0, spaceIndex)).toLowerCase()
  const rest = spaceIndex === -1 ? '' : text.slice(spaceIndex).trim()
  switch (word) {
    case '/new':
      return { kind: 'new', label: rest }
    case '/sessions':
    case '/list':
      return { kind: 'sessions' }
    case '/use':
    case '/switch':
    case '/resume':
      return { kind: 'use', sessionId: rest }
    case '/current':
    case '/session':
      return { kind: 'current' }
    case '/stop':
    case '/cancel':
      return { kind: 'stop' }
    case '/help':
      return { kind: 'help' }
    default:
      return { kind: 'prompt', text }
  }
}

/** One name/value pair from a Discord interaction's options. */
export interface InteractionOption {
  name: string
  value?: unknown
}

/**
 * Map one registered application command invocation to a bridge command.
 * @param name - the interaction's command name.
 * @param options - the interaction's options.
 * @returns the parsed command, or undefined for a name we never registered.
 */
export function commandFromInteraction(name: string, options: readonly InteractionOption[]): BridgeCommand | undefined {
  const text = (key: string): string => {
    const found = options.find(option => option.name === key)
    return typeof found?.value === 'string' ? found.value.trim() : ''
  }
  switch (name) {
    case 'new':
      return { kind: 'new', label: text('title') }
    case 'sessions':
      return { kind: 'sessions' }
    case 'use':
      return { kind: 'use', sessionId: text('session') }
    case 'current':
      return { kind: 'current' }
    case 'stop':
      return { kind: 'stop' }
    case 'help':
      return { kind: 'help' }
    default:
      return undefined
  }
}

/**
 * The application commands the bridge registers on ready (bulk overwrite,
 * idempotent). Type 3 = string option. Text-command parsing stays as a
 * fallback, so the bridge works even before registration propagates.
 */
export const APPLICATION_COMMANDS = [
  {
    name: 'new',
    description: 'Start a new dsh session (shared with the web UI)',
    options: [{ type: 3, name: 'title', description: 'Session title (optional)', required: false }],
  },
  { name: 'sessions', description: 'list recent Discord sessions' },
  {
    name: 'use',
    description: 'Bind this channel to a session (a session id from the web UI works too)',
    options: [{ type: 3, name: 'session', description: 'session id', required: true }],
  },
  { name: 'current', description: 'show the session this thread is bound to' },
  { name: 'stop', description: 'cancel the turn running in the current session' },
  { name: 'help', description: 'bridge usage help' },
] as const

/** The `/help` reply, kept next to the parser it documents. */
export const HELP_TEXT = [
  '**dsh Discord bridge**',
  'Send a message → it goes to the current dsh session (one is created if there is none)',
  '`/new [title]` — start a new session (shared with the web UI)',
  '`/sessions` — list recent Discord sessions',
  '`/use <session id>` — switch to a session (one created on the web works too)',
  '`/current` — show the session this thread is bound to',
  '`/stop` — cancel the turn running in the current session',
  '`/help` — this help',
].join('\n')
