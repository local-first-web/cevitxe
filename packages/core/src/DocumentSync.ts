﻿import A from 'automerge'
import debug from 'debug'
import { Map } from 'immutable'
import { lessOrEqual } from './lib/lessOrEqual'
import { Clock, Message } from './types'

type Clocks = { ours: Clock; theirs: Clock }

const log = debug('cevitxe:documentsync')

/**
 * One instance of `DocumentSync` keeps one local document in sync with one remote peer's replica of
 * the same document.
 *
 * This class works with a local `WatchableDoc`; it listens for changes to the document, and if it
 * thinks it has changes that the remote peer doesn't know about, it generates a message to be sent
 * the peer. It also processes messages from its counterpart on the peer, and applies them to the
 * local document as needed.
 *
 * This class doesn't get involved in the actual transmission of the messages; it only generates
 * them for someone else to send, and processes them when someone else receives them. To integrate a
 * connection with a particular networking stack, two functions are used:
 *
 * - `send` (callback passed to the constructor, will be called when local state is updated) takes a
 *   message as argument, and sends it out to the remote peer.
 * - `receive` (method on the connection object) should be called by the network stack when a
 *   message is received from the remote peer.
 *
 * In this context, networking is provided by the Cevitxe `connection` class.
 *
 * The document to be synced is managed by a `WatchableDoc`. Whenever it is changed locally, call
 * `set()` on the WatchableDoc. The connection registers a callback on the WatchableDoc, and it
 * figures out whenever there are changes that need to be sent to the remote peer.
 *
 * To do this, we keep track of two clocks: ours and theirs.
 *
 * - "Their" clock is the most recent VClock that we think the peer has (either because they've told
 *   us that it's their clock, or because it corresponds to a state we have sent to them on this
 *   connection). Thus, everything more recent than theirClock should be sent to the peer.
 *
 * - "Our" clock is the most recent VClock that we've advertised to the peer (i.e. where we've told
 *   the peer that we have it).
 *
 * > Note: This class began life as a vendored & refactored copy of the `Automerge.Connection`
 * > class; if you're familiar with that class, this one plays exactly the same role. The only
 * > difference is that this uses a WatchableDoc (an observable wrapper around a single document),
 * > whereas Automerge.Connection uses a DocSet (an observable wrapper around a set of documents).
 */
export class DocumentSync<T> {
  private watchableDoc: A.WatchableDoc<A.Doc<T>, T>
  private send: (msg: Message) => void
  private clock: Clocks

  /**
   * @param watchableDoc An `Automerge.WatchableDoc` containing the document being synchronized.
   * @param send Callback function, called when the local document changes. Should send the given
   * message to the remote peer.
   */
  constructor(watchableDoc: A.WatchableDoc<A.Doc<T>, T>, send: (msg: Message) => void) {
    this.watchableDoc = watchableDoc
    this.send = send
    this.clock = { ours: Map(), theirs: Map() }
  }

  // Public API

  open() {
    log('open')
    const clock = this.getClockFromDoc()
    this.validateDoc(clock)
    this.requestChanges(clock)
    this.updateClock(ours, clock)
    this.watchableDoc.registerHandler(this.docChanged.bind(this))
  }

  close() {
    log('close')
    this.watchableDoc.unregisterHandler(this.docChanged.bind(this))
  }

  // Called by the network stack whenever it receives a message from a peer
  receive({ clock, changes }: { clock: Clock; changes?: A.Change[] }) {
    // Record their clock value for this document
    if (clock) this.updateClock(theirs, clock)

    // If they sent changes, apply them to our document
    if (changes) this.watchableDoc.applyChanges(changes)
    // If no changes, treat it as a request for our latest changes
    else this.maybeSendChanges()

    // Return the current state of the document
    return this.watchableDoc.get()
  }

  // Private methods

  private validateDoc(clock: Clock) {
    const ourClock = this.getClock(ours)

    // Make sure doc has a clock (i.e. is an automerge object)
    if (!clock) throw new TypeError(ERR_NOCLOCK)

    // Make sure the document is newer than what we already have
    if (!lessOrEqual(ourClock, clock)) throw new RangeError(ERR_OLDCLOCK)
  }

  // Callback that is called by the watchableDoc whenever a document is changed
  private docChanged() {
    log('doc changed')
    const clock = this.getClockFromDoc()
    this.validateDoc(clock)
    this.maybeSendChanges()
    this.maybeRequestChanges(clock)
    this.updateClock(ours, clock)
  }

  // Send changes if we have more recent information than they do
  private maybeSendChanges() {
    const theirClock = (this.getClock(theirs) as unknown) as A.Clock
    if (theirClock === undefined) return

    const ourState = this.getState()

    // If we have changes they don't have, send them
    const changes = A.Backend.getMissingChanges(ourState, theirClock)
    if (changes.length > 0) this.sendChanges(changes)
  }

  private sendChanges(changes: A.Change[]) {
    log('sending %s changes', changes.length)
    const clock = this.getClockFromDoc()
    this.send({ clock: clock.toJS() as Clock, changes })
    this.updateClock(ours)
  }

  // Request changes if we're out of date
  private maybeRequestChanges(clock = this.getClockFromDoc()) {
    const ourClock = this.getClock(ours)

    // If the document is newer than what we have, request changes
    if (!lessOrEqual(clock, ourClock)) this.requestChanges(clock)
  }

  // A message with no changes and a clock is a request for changes
  private requestChanges(clock = this.getClockFromDoc()) {
    log('requesting changes')
    this.send({ clock: clock.toJS() as Clock })
  }

  // overloads
  private getClock(which: 'ours'): Clock
  private getClock(which: 'theirs'): Clock | undefined
  // implementation
  private getClock(which: keyof Clocks): Clock | undefined {
    const initialClockValue =
      which === ours
        ? (Map() as Clock) // our default clock value is an empty clock
        : undefined // their default clock value is undefined
    return this.clock[which] || initialClockValue
  }

  private getClockFromDoc = () => (this.getState() as any).getIn(['opSet', 'clock']) as Clock

  // Updates the vector clock by merging in the new vector clock `clock`, setting each node's
  // sequence number has been set to the maximum for that node.
  private updateClock(which: keyof Clocks, clock = this.getClockFromDoc()) {
    const oldClock = this.clock[which] || Map()
    // Merge the clocks, keeping the maximum sequence number for each node
    const largestWins = (x: number, y: number): number => Math.max(x, y)
    const newClock = oldClock.mergeWith(largestWins, clock)
    this.clock[which] = newClock
  }

  private getState(): A.BackendState {
    const doc = this.watchableDoc.get()
    return A.Frontend.getBackendState(doc)
  }
}

const ERR_OLDCLOCK = 'Cannot pass an old state object to a connection'
const ERR_NOCLOCK =
  'This object cannot be used for network sync. ' +
  'Are you trying to sync a snapshot from the history?'

const ours = 'ours'
const theirs = 'theirs'