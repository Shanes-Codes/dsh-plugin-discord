/**
 * Extract the reply for one Discord-submitted prompt from a session log.
 *
 * The bridge stamps its user message with the Discord message id (a durable
 * JSON field on the message source, the same pattern the web client uses with
 * rpcId), finds that event in the log, and reads the turn it opened. This
 * keeps a concurrently running web prompt from being mistaken for our answer.
 *
 * @module dsh-plugin-discord/reply
 */

/** The event-log shape this module folds; structurally matches SessionEvent. */
export interface LogEventLike {
  seq: number
  type: string
  data?: unknown
}

/** Outcome of one bridged turn. */
export interface BridgedReply {
  /** Concatenated text of the turn's last non-empty assistant message. */
  text: string
  /** `completed`, `cancelled`, an error kind, or undefined while unfinished. */
  reasonKind: string | undefined
  /** Error message when the turn failed. */
  errorMessage: string | undefined
}

/** Find the seq of the user/message event carrying this Discord message id. */
export function findPromptSeq(events: readonly LogEventLike[], discordMessageId: string): number | undefined {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]
    if (event === undefined || event.type !== 'user/message') continue
    // The event's data IS the message: { content, source, role, id }.
    const source = (event.data as { source?: { discordMessageId?: string } }).source
    if (source?.discordMessageId === discordMessageId) return event.seq
  }
  return undefined
}

/**
 * Decide whether THIS prompt's waiter stays silent about the turn it landed in.
 *
 * A bridged message is delivered as steering (the web UI's Ctrl+Enter): it
 * joins the running turn instead of opening its own, so several bridged
 * messages — and any web-UI input — can share one turn, and every waiter
 * wakes at the same `turn/end`. Exactly one of them must answer:
 * - An earlier bridged message in the same turn owns the answer: its fold
 *   starts before this steering and already covers everything after it.
 * - When the turn's LAST user message came from another surface (web UI
 *   steering, or an injected context) and a turn mirror runs alongside the
 *   bridge, the mirror answers that turn — the bridge must not double-send.
 *   Discord has no turn mirror yet, so its bridge passes
 *   `mirrorAnswersForeignTurns: false` and answers regardless of who spoke
 *   last; dropping the reply there would answer nobody.
 * @param events - the session's full in-memory event log.
 * @param promptSeq - seq of this bridged user/message event (from findPromptSeq).
 * @param options.mirrorAnswersForeignTurns - whether a turn mirror mirrors
 * turns whose last user message is not bridge-originated.
 * @returns true when this waiter must send nothing.
 */
export function shouldSkipBridgedReply(
  events: readonly LogEventLike[],
  promptSeq: number,
  options: { mirrorAnswersForeignTurns: boolean },
): boolean {
  let earlierBridge = false
  let lastUserMid: string | undefined
  for (const event of events) {
    if (event.type === 'turn/end') {
      // A turn/end before promptSeq closes an earlier turn: bridge messages
      // in it are not steering of THIS turn, so the same-turn scan restarts.
      // The first turn/end after promptSeq closes this turn — the scan is done.
      if (event.seq < promptSeq) earlierBridge = false
      else break
      continue
    }
    if (event.type !== 'user/message') continue
    // The event's data IS the message: { content, source, role, id }.
    const mid = (event.data as { source?: { discordMessageId?: string } }).source?.discordMessageId
    if (event.seq < promptSeq) {
      if (mid !== undefined) earlierBridge = true
      continue
    }
    // seq >= promptSeq: still inside this turn (the loop breaks at its end).
    // The event AT promptSeq is this bridge's own message, so it carries a
    // mid; only a later foreign user/message (web steering, injected
    // context) can leave lastUserMid undefined.
    lastUserMid = mid
  }
  if (earlierBridge) return true
  return options.mirrorAnswersForeignTurns && lastUserMid === undefined
}

/**
 * Fold the events between the bridged prompt and its turn's end into a reply.
 *
 * The prompt's own `turn/start` precedes the `user/message` event in the log
 * (the driver opens the turn, then appends the claimed message), so the fold
 * simply starts AT the prompt and stops at the first `turn/end` after it —
 * everything between belongs to the turn this prompt opened.
 * @param events - the session's full in-memory event log.
 * @param promptSeq - seq of the bridged user/message event.
 * @returns the folded reply; `reasonKind` is undefined when the turn has not ended.
 */
export function extractReply(events: readonly LogEventLike[], promptSeq: number): BridgedReply {
  let text = ''
  let reasonKind: string | undefined
  let errorMessage: string | undefined
  for (const event of events) {
    if (event.seq < promptSeq) continue
    if (event.type === 'assistant/message') {
      const data = event.data as { message?: { content?: { type: string; text?: string }[] } }
      const joined = (data.message?.content ?? [])
        .filter(block => block.type === 'text')
        .map(block => block.text ?? '')
        .join('')
      if (joined !== '') text = joined
      continue
    }
    if (event.type === 'turn/end') {
      const reason = (event.data as { reason?: { kind?: string; error?: { message?: string } } }).reason
      reasonKind = reason?.kind
      errorMessage = reason?.error?.message
      break
    }
  }
  return { text, reasonKind, errorMessage }
}
