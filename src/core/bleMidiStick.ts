// BLE-MIDI drum stick prototype (#240, follow-up to research #185).
//
// #240 asks for "one supported BLE drum-stick profile" and assumes the stick
// streams accelerometer/gyro samples. It does not, and no purchasable one does:
// Freedrum and Senstroke both run impact detection on the stick and emit
// **BLE-MIDI note-on with velocity**. The raw IMU never crosses the air. So the
// profile to support is BLE-MIDI (MMA/AMEI RP-052), and this module decodes it.
// See docs/research/ble-midi-drum-sticks.md for the device survey and for why
// Web Bluetooth turns out not to be needed at all.
//
// Everything here is transport-agnostic on purpose. The same packet bytes
// arrive whether they came from a Web Bluetooth characteristic notification, a
// Web MIDI port the OS already paired, or a native Tauri bridge — so the decoder
// never imports a transport and can be fuzzed with plain byte arrays.
//
// Packet format (RP-052), for the parse below:
//   byte 0      header    1 0 H H H H H H   — bit7 set, bit6 clear, 6 high bits
//   then        timestamp 1 L L L L L L L   — bit7 set, 7 low bits
//   then        a MIDI status byte (bit7 set) or, under running status, data
//   timestamp = (high << 7) | low, in milliseconds, wrapping every 8192 ms
//
// A timestamp byte and a status byte are both "bit7 set", which is what makes
// this format fiddly. The parse resolves it positionally: after the header a
// timestamp byte is always next, and the byte after a timestamp is a status byte
// only if bit7 is set — otherwise running status is in effect.
import { clamp } from './math';
import type { DrumHitEvent, Handedness } from './types';

/** GATT service and characteristic from the BLE-MIDI specification. */
export const BLE_MIDI_SERVICE_UUID = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
export const BLE_MIDI_CHARACTERISTIC_UUID = '7772e5db-3868-4112-a1a9-f2669d106bf3';
/**
 * The device timestamp is 13 bits of milliseconds, so it repeats every 8.192 s.
 * Anything holding on to device time for longer than that has to unwrap it,
 * which is what `BleMidiPacketDecoder` does.
 */
export const BLE_MIDI_TIMESTAMP_WRAP_MS = 8192;
/**
 * A gap larger than this between the previous and current 13-bit timestamp is
 * read as a wrap rather than as time running backwards. Half the wrap period is
 * the only choice that cannot be fooled by ordinary jitter: BLE delivers at a
 * connection interval of 7.5 ms and up, so consecutive drum hits are orders of
 * magnitude closer together than 4 s.
 */
export const BLE_MIDI_WRAP_THRESHOLD_MS = BLE_MIDI_TIMESTAMP_WRAP_MS / 2;

export interface BleMidiMessage {
  /** Device clock, unwrapped past the 13-bit rollover, in milliseconds. */
  deviceTimeMs: number;
  /** Full status byte including the channel nibble. */
  status: number;
  data1: number;
  data2: number;
}

export interface BleMidiDecodeResult {
  messages: BleMidiMessage[];
  /**
   * Bytes the decoder could not interpret. The decoder never throws — packets
   * arrive from an untrusted wireless device, and the codec fuzzing precedent
   * (#262) is that a malformed frame degrades rather than takes the tracker down.
   */
  malformedBytes: number;
  /** True when a SysEx message was seen and skipped; see the note below. */
  skippedSysEx: boolean;
}

/**
 * Decodes BLE-MIDI packets into timestamped channel messages, holding the
 * running status and timestamp-unwrap state across packets.
 *
 * Deliberately not supported, because a drum stick never sends them and
 * guessing would be worse than declining: SysEx payloads (skipped, with the
 * flag set) and System Common messages. System Real-Time bytes are dropped
 * silently — they are legal anywhere and carry no hit information.
 */
export class BleMidiPacketDecoder {
  private runningStatus = 0;
  private lastRawTimestamp = -1;
  private wrapCount = 0;

  /** Call on connect and on every reconnect: the device clock restarts. */
  reset(): void {
    this.runningStatus = 0;
    this.lastRawTimestamp = -1;
    this.wrapCount = 0;
  }

  decode(packet: Uint8Array | readonly number[]): BleMidiDecodeResult {
    const bytes = packet instanceof Uint8Array ? packet : Uint8Array.from(packet);
    const result: BleMidiDecodeResult = { messages: [], malformedBytes: 0, skippedSysEx: false };
    // Header plus one timestamp plus one status is the shortest legal packet.
    if (bytes.length < 3) {
      result.malformedBytes = bytes.length;
      return result;
    }
    const header = bytes[0] ?? 0;
    if ((header & 0x80) === 0 || (header & 0x40) !== 0) {
      result.malformedBytes = bytes.length;
      return result;
    }
    const timestampHigh = header & 0x3f;

    let index = 1;
    let currentTimestamp = -1;
    // The header carries the high bits once for the whole packet, so a packet
    // whose messages straddle a 128 ms boundary would otherwise decode as time
    // running backwards. A low field smaller than the previous one is that
    // boundary being crossed, and the high bits advance with it.
    let packetHigh = timestampHigh;
    let previousLow = -1;
    while (index < bytes.length) {
      const byte = bytes[index] ?? 0;
      if ((byte & 0x80) !== 0) {
        // Ambiguity point: bit7 marks both timestamp and status bytes. A
        // timestamp is only legal here when we do not already hold one for an
        // unstarted message, which is exactly the positional rule above.
        if (currentTimestamp < 0) {
          const low = byte & 0x7f;
          if (previousLow >= 0 && low < previousLow) packetHigh = (packetHigh + 1) & 0x3f;
          previousLow = low;
          currentTimestamp = this.unwrap((packetHigh << 7) | low);
          index++;
          continue;
        }
        const status = byte;
        index++;
        if (status === 0xf0) {
          // SysEx runs to an F7 that may live in a later packet. Skipping the
          // rest of this packet is the safe reading: a stick has no reason to
          // send one, and mis-parsing a payload byte as a note would fire a hit.
          result.skippedSysEx = true;
          this.runningStatus = 0;
          return result;
        }
        if (status >= 0xf8) {
          // System Real-Time: no payload, but it carried its own timestamp, so
          // release it or the next timestamp byte parses as a status byte.
          currentTimestamp = -1;
          continue;
        }
        if (status >= 0xf1) {
          // System Common. Not expected from a stick; drop it and its data
          // rather than letting a stale running status reinterpret the bytes.
          this.runningStatus = 0;
          currentTimestamp = -1;
          continue;
        }
        this.runningStatus = status;
        const consumed = this.readMessage(bytes, index, status, currentTimestamp, result);
        if (consumed < 0) {
          result.malformedBytes += bytes.length - index;
          return result;
        }
        index += consumed;
        currentTimestamp = -1;
        continue;
      }

      // Data byte with no preceding status: running status. Legal only once a
      // status has been seen, and only with a timestamp already read.
      if (!this.runningStatus || currentTimestamp < 0) {
        result.malformedBytes += 1;
        index++;
        continue;
      }
      const consumed = this.readMessage(bytes, index, this.runningStatus, currentTimestamp, result);
      if (consumed < 0) {
        result.malformedBytes += bytes.length - index;
        return result;
      }
      index += consumed;
      currentTimestamp = -1;
    }
    return result;
  }

  /** Returns bytes consumed, or -1 when the packet ends mid-message. */
  private readMessage(
    bytes: Uint8Array,
    index: number,
    status: number,
    deviceTimeMs: number,
    result: BleMidiDecodeResult,
  ): number {
    const needed = messageDataLength(status);
    if (index + needed > bytes.length) return -1;
    const data1 = bytes[index] ?? 0;
    const data2 = needed > 1 ? bytes[index + 1] ?? 0 : 0;
    // A data byte with bit7 set means the packet is truncated or corrupt.
    if ((data1 & 0x80) !== 0 || (needed > 1 && (data2 & 0x80) !== 0)) return -1;
    result.messages.push({ deviceTimeMs, status, data1, data2 });
    return needed;
  }

  private unwrap(raw: number): number {
    if (this.lastRawTimestamp >= 0 && raw + BLE_MIDI_WRAP_THRESHOLD_MS < this.lastRawTimestamp) {
      this.wrapCount++;
    }
    this.lastRawTimestamp = raw;
    return this.wrapCount * BLE_MIDI_TIMESTAMP_WRAP_MS + raw;
  }
}

/** Data byte count for a channel voice status byte. */
function messageDataLength(status: number): number {
  const kind = status & 0xf0;
  // Program Change and Channel Pressure carry one data byte; the rest carry two.
  return kind === 0xc0 || kind === 0xd0 ? 1 : 2;
}

export interface StickStrike {
  deviceTimeMs: number;
  note: number;
  /** MIDI velocity, 0-127. */
  velocity: number;
  channel: number;
}

/**
 * Note-on messages with a non-zero velocity. A note-on of velocity 0 is the
 * conventional note-off and is not a strike; an explicit note-off is not either.
 * Drum modules and sticks alike use both spellings.
 */
export function extractStickStrikes(messages: readonly BleMidiMessage[]): StickStrike[] {
  const strikes: StickStrike[] = [];
  for (const message of messages) {
    if ((message.status & 0xf0) !== 0x90) continue;
    if (message.data2 === 0) continue;
    strikes.push({
      deviceTimeMs: message.deviceTimeMs,
      note: message.data1,
      velocity: message.data2,
      channel: message.status & 0x0f,
    });
  }
  return strikes;
}

/**
 * General MIDI percussion notes to KGM1 zone types. #278 settled the policy:
 * ship the GM table as the default and let a learn step override it, because
 * modules and accessories ship manufacturer defaults that users remap.
 */
export const GM_PERCUSSION_ZONE_TYPES: Readonly<Record<number, DrumHitEvent['zoneType']>> = {
  35: 'kick', 36: 'kick',
  37: 'snare', 38: 'snare', 40: 'snare',
  39: 'snare', // Hand Clap — closest zone the schema has.
  41: 'floorTom', 43: 'floorTom', 45: 'tom', 47: 'tom', 48: 'tom', 50: 'tom',
  42: 'hihat', 46: 'hihat',
  44: 'pedal', // Pedal Hi-Hat is a foot signal, not a stick strike.
  49: 'crash', 52: 'crash', 55: 'crash', 57: 'crash',
  51: 'ride', 53: 'ride', 59: 'ride',
};

export interface StickNoteMapping {
  /** Overrides from a learn step; falls back to the GM table. */
  notes?: Readonly<Record<number, { zoneId: string; zoneType: DrumHitEvent['zoneType'] }>>;
  /** Which stick this MIDI channel belongs to, when the device separates them. */
  handByChannel?: Readonly<Record<number, Handedness>>;
}

export interface StickHitOptions {
  mapping?: StickNoteMapping;
  /**
   * Device time -> host time. Supply the alignment measured with
   * `measureCaptureTimestampAlignment`; without it, device time is used as-is
   * and the hit lands wherever the stick's clock happens to be.
   */
  toHostTimeMs?: (deviceTimeMs: number) => number;
}

/**
 * A strike becomes a `DrumHitEvent` with no position and no stage velocity.
 *
 * That is not an oversight and it is the honest shape: the stick measures *when*
 * and *how hard*, and knows nothing about where the kit is. `position` and
 * `velocity` stay zero and `speed` carries the mapped strike speed, so a
 * consumer can tell a stick-only hit from a vision hit by its zero position
 * rather than by trusting a fabricated coordinate. `fuseStickHitWithVisual`
 * fills the position in when a camera saw the same stroke.
 */
export function stickStrikeToDrumHit(strike: StickStrike, options: StickHitOptions = {}): DrumHitEvent | null {
  const override = options.mapping?.notes?.[strike.note];
  const zoneType = override?.zoneType ?? GM_PERCUSSION_ZONE_TYPES[strike.note];
  if (!zoneType) return null;
  const timeMs = options.toHostTimeMs ? options.toHostTimeMs(strike.deviceTimeMs) : strike.deviceTimeMs;
  if (!Number.isFinite(timeMs)) return null;
  const zoneId = override?.zoneId ?? zoneType;
  const hit: DrumHitEvent = {
    eventId: `stick:${zoneId}:${Math.round(timeMs)}`,
    timeNs: Math.round(timeMs * 1_000_000),
    zoneId,
    zoneType,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    speed: velocityToSpeed(strike.velocity),
    // A stick reports its own impact, so the onset is certain in a way a visual
    // downstroke never is. It is held below 1 because the note-to-zone mapping
    // is a default table that the player may not have matched to their kit.
    confidence: 0.9,
    audioAligned: false,
  };
  const hand = options.mapping?.handByChannel?.[strike.channel];
  if (hand) hit.hand = hand;
  return hit;
}

/**
 * MIDI velocity (1-127) to a stage speed in m/s, matching the range the vision
 * path produces so both feed the same avatar stroke mapping. Real stick speeds
 * at the head run from roughly 0.5 m/s for a ghost note to 6 m/s for a rimshot;
 * the curve is squared because perceived loudness tracks energy rather than
 * speed, so a linear map makes soft strokes look harder than they sound.
 */
export function velocityToSpeed(velocity: number): number {
  if (!Number.isFinite(velocity)) return 0;
  const normalized = clamp(velocity / 127, 0, 1);
  return 0.5 + normalized * normalized * 5.5;
}

export interface FusedStickHit {
  event: DrumHitEvent;
  /** True when a camera saw the same stroke and supplied the position. */
  positioned: boolean;
  /** True when the stick supplied the timing, which it does whenever present. */
  stickTimed: boolean;
}

/**
 * Merge stick strikes with the vision path's hits.
 *
 * The stick wins on timing and velocity — it measures the impact directly,
 * where vision infers it from a downstroke — and the camera wins on position,
 * which the stick cannot know. Strokes only one source saw pass through
 * unchanged, in both directions: an unmatched stick hit is the accessory
 * earning its place during an occlusion, and an unmatched visual hit is the
 * guarantee that plugging a stick in never *removes* a hit the camera had.
 */
export function fuseStickHitsWithVisual(
  stickHits: readonly DrumHitEvent[],
  visualHits: readonly DrumHitEvent[],
  windowMs = 30,
): FusedStickHit[] {
  const unmatchedVisual = new Set(visualHits);
  const fused: FusedStickHit[] = [];
  for (const stick of [...stickHits].sort((a, b) => a.timeNs - b.timeNs)) {
    let best: DrumHitEvent | undefined;
    let closest = Infinity;
    for (const visual of unmatchedVisual) {
      if (visual.zoneType !== stick.zoneType) continue;
      const deltaMs = Math.abs(visual.timeNs - stick.timeNs) / 1_000_000;
      if (deltaMs <= windowMs && deltaMs < closest) {
        closest = deltaMs;
        best = visual;
      }
    }
    if (!best) {
      fused.push({ event: stick, positioned: false, stickTimed: true });
      continue;
    }
    unmatchedVisual.delete(best);
    const merged: DrumHitEvent = {
      ...best,
      timeNs: stick.timeNs,
      speed: stick.speed,
      // Two independent sensors agreeing is stronger than either alone.
      confidence: clamp(Math.max(stick.confidence, best.confidence) + 0.05, 0, 1),
    };
    if (stick.hand) merged.hand = stick.hand;
    fused.push({ event: merged, positioned: true, stickTimed: true });
  }
  for (const visual of unmatchedVisual) {
    fused.push({ event: visual, positioned: true, stickTimed: false });
  }
  return fused.sort((a, b) => a.event.timeNs - b.event.timeNs);
}

export interface StickSessionStatus {
  connected: boolean;
  /** Strikes emitted since the session opened. */
  emitted: number;
  /** Reconnects observed. Each one resets the device clock. */
  reconnects: number;
  /** Strikes suppressed because a reconnect replayed them. */
  suppressedDuplicates: number;
  /** Set when the transport is unavailable, with copy the UI can show. */
  diagnostic?: string;
}

/**
 * Session wrapper that survives the things a wireless accessory actually does:
 * drop out, come back with a reset clock, and replay a packet.
 *
 * The duplicate guard is the part that matters. A reconnect restarts the device
 * timestamp at zero, so without it every strike buffered across the gap can be
 * re-emitted — and a double-triggered drum hit is worse than a missed one,
 * because the avatar plays a stroke the drummer did not.
 */
export class BleMidiStickSession {
  private readonly decoder = new BleMidiPacketDecoder();
  private readonly recentKeys: string[] = [];
  private readonly recentSet = new Set<string>();
  private status: StickSessionStatus = { connected: false, emitted: 0, reconnects: 0, suppressedDuplicates: 0 };

  constructor(private readonly options: StickHitOptions & { duplicateWindow?: number } = {}) {}

  connect(): void {
    if (this.status.connected) return;
    if (this.status.emitted > 0 || this.status.reconnects > 0) this.status.reconnects++;
    this.status.connected = true;
    // The device clock restarts, so the unwrap state must not carry over.
    this.decoder.reset();
  }

  disconnect(): void {
    this.status.connected = false;
  }

  /** Feed one characteristic notification. Returns the hits it produced. */
  ingest(packet: Uint8Array | readonly number[]): DrumHitEvent[] {
    if (!this.status.connected) return [];
    const decoded = this.decoder.decode(packet);
    const hits: DrumHitEvent[] = [];
    for (const strike of extractStickStrikes(decoded.messages)) {
      const hit = stickStrikeToDrumHit(strike, this.options);
      if (!hit) continue;
      if (this.recentSet.has(hit.eventId)) {
        this.status.suppressedDuplicates++;
        continue;
      }
      this.remember(hit.eventId);
      this.status.emitted++;
      hits.push(hit);
    }
    return hits;
  }

  getStatus(): StickSessionStatus {
    return { ...this.status };
  }

  private remember(eventId: string): void {
    const limit = this.options.duplicateWindow ?? 64;
    this.recentSet.add(eventId);
    this.recentKeys.push(eventId);
    while (this.recentKeys.length > limit) {
      const oldest = this.recentKeys.shift();
      if (oldest !== undefined) this.recentSet.delete(oldest);
    }
  }
}

export type StickTransportKind = 'webMidi' | 'webBluetooth' | 'native';

export interface StickTransportSupport {
  available: StickTransportKind[];
  /** The transport to try first, or null when none can work here. */
  preferred: StickTransportKind | null;
  /** Copy for the UI. Actionable when there is something the user can do. */
  diagnostic: string;
}

export interface StickTransportCapabilities {
  hasWebMidi: boolean;
  hasWebBluetooth: boolean;
  hasNativeBridge: boolean;
  /**
   * Firefox rejects `requestMIDIAccess()` until the user installs a site
   * permission add-on, so "the API exists" is not the same as "it will work".
   */
  webMidiNeedsSitePermissionAddon?: boolean;
}

/**
 * Pick a transport from measured capabilities, never from the user agent.
 *
 * Web MIDI is preferred over Web Bluetooth even though both can reach the same
 * stick, because a BLE-MIDI device paired at the OS level appears as an ordinary
 * MIDI port — so the OS owns pairing, reconnect and the BLE-MIDI decoding, and
 * the page inherits all of it. The Web Bluetooth path exists for the case where
 * the user cannot or will not pair at the OS level; it is not the default.
 */
export function selectStickTransport(capabilities: StickTransportCapabilities): StickTransportSupport {
  const available: StickTransportKind[] = [];
  if (capabilities.hasWebMidi) available.push('webMidi');
  if (capabilities.hasWebBluetooth) available.push('webBluetooth');
  if (capabilities.hasNativeBridge) available.push('native');

  if (capabilities.hasNativeBridge && !capabilities.hasWebMidi) {
    return { available, preferred: 'native', diagnostic: 'Using the desktop app\'s MIDI bridge for the drum stick.' };
  }
  if (capabilities.hasWebMidi) {
    if (capabilities.webMidiNeedsSitePermissionAddon) {
      return {
        available,
        preferred: 'webMidi',
        diagnostic: 'This browser needs a one-time MIDI site permission add-on before the drum stick can connect. '
          + 'Accept the prompt when it appears.',
      };
    }
    return { available, preferred: 'webMidi', diagnostic: 'Pair the stick in your operating system, then allow MIDI access.' };
  }
  if (capabilities.hasWebBluetooth) {
    return { available, preferred: 'webBluetooth', diagnostic: 'Connect the stick over Bluetooth. Pairing must be started by you.' };
  }
  // Deliberately not "MIDI later": WebKit has no Web MIDI and no Web Bluetooth
  // implementation in progress, so waiting is not a plan. Naming the desktop app
  // keeps the message actionable instead of a dead end.
  return {
    available,
    preferred: null,
    diagnostic: 'This browser cannot connect a drum stick. Use the desktop app, or Chrome or Edge. '
      + 'Camera and audio drum tracking is unaffected.',
  };
}

/**
 * Log-safe description of a paired device. BLE addresses and Web Bluetooth ids
 * are stable per-device identifiers, so they never reach a log line: #240 asks
 * for identifier redaction by default, and a redaction that has to be remembered
 * at each call site is one that will be forgotten at one of them.
 */
export function describeStickDevice(device: { name?: string; id?: string }): string {
  const name = device.name?.trim();
  return name ? `${name} (id redacted)` : 'Unnamed BLE-MIDI device (id redacted)';
}
