<!-- i18n: language-switcher -->
[English](ble-midi-drum-sticks.md) | [日本語](ble-midi-drum-sticks.ja.md)

# BLE Drum Stick Profile

Status: **prototype result for issue #240 — PASS on the software gates, BLOCKED
on the hardware gates.** Follows the research decision in
[imu-stick-integration.md](imu-stick-integration.md) (#185) and shares the MIDI
adapter surface specified in
[midi-performance-input.md](midi-performance-input.md) (#278).

## The premise in #240 does not match any device you can buy

#240's prototype scope says to "ingest timestamped acceleration/gyro samples as
an auxiliary signal", and #185 before it framed the accessory as an IMU whose
raw output the tracker would consume. **No shipping drum-stick sensor works that
way.**

Both products that exist run impact detection *on the stick* and transmit
**BLE-MIDI note-on with velocity**. Freedrum uses an nRF52832 with a gyroscope
and accelerometer, detects impacts on-device, and "transmits the data via MIDI
over Bluetooth LE". Senstroke by Redison likewise emits "the universal MIDI
format", which is what lets it drive a DAW with no vendor software. The raw IMU
stream never crosses the air in either case.

This is a better outcome than the issue assumed, and it changes the work:

- There is **no IMU signal processing to write.** The stick's own DSP has the
  accelerometer at the point of impact at its full internal sample rate; a
  browser receiving decimated samples over a 7.5 ms connection interval could
  not match it. Onset detection stays where the sensor is.
- There is **no vendor GATT profile to reverse-engineer or license.** The
  profile is BLE-MIDI, a published standard.
- What the prototype actually needs is a **BLE-MIDI decoder**, which is what
  `src/core/bleMidiStick.ts` is.

The one thing lost is that a note-on cannot be second-guessed. If the stick's
threshold fires on a rim click the tracker never sees the acceleration that
would have let it disagree. That is a real limitation and it belongs in the
hardware evaluation, not in a synthetic test.

## The profile

BLE-MIDI, specified by the MIDI Association (MMA/AMEI RP-052). No per-device
license is needed to implement it, and the packet format is published in several
independent vendor implementations (Nordic, SparkFun, Silicon Labs, Espressif);
the normative document itself is partly behind MIDI Association membership.

| | |
|---|---|
| GATT service | `03B80E5A-EDE8-4B33-A751-6CE34EC4C700` |
| Characteristic | `7772E5DB-3868-4112-A1A9-F2669D106BF3` |
| Properties | Notify, Write Without Response (Read on some devices) |
| Descriptor | Client Characteristic Configuration (`0x2902`) |
| Default MTU | 20 bytes, so packets are small and often carry one message |

Packet encoding, which is where the sharp edges are:

```
byte 0   header     1 0 H H H H H H    bit7 set, bit6 clear, 6 high timestamp bits
then     timestamp  1 L L L L L L L    bit7 set, 7 low timestamp bits
then     a status byte (bit7 set), or data bytes under running status
```

Three details the decoder has to get right, each of which silently corrupts
timing or fires phantom hits if missed:

1. **A timestamp byte and a status byte are both "bit7 set".** They are only
   distinguishable positionally: after the header a timestamp is always next,
   and the byte after a timestamp is a status byte only if bit7 is set.
2. **The header's 6 high bits are sent once per packet.** If a packet's messages
   straddle a 128 ms boundary, the low field decreases and the high bits must be
   advanced by the receiver. Without that the second stroke in such a packet
   decodes up to 128 ms *earlier* than the first.
3. **The timestamp is 13 bits of milliseconds and repeats every 8192 ms.** Any
   consumer holding device time for longer than 8.192 s must unwrap it, and must
   reset that state on reconnect because the device clock restarts.

SysEx is skipped rather than parsed. A stick has no reason to send one, and
mis-reading a payload byte as a note fires a hit that never happened.

## Web Bluetooth turns out not to be needed

This is the finding that most changes #240's shape. The issue's prerequisites
ask for a Web Bluetooth feature-detection path and a "Tauri/native BLE bridge
decision for Safari/WebKit". But a BLE-MIDI device paired at the **operating
system** level appears as an ordinary MIDI port — macOS pairs it in Audio MIDI
Setup's "Configure Bluetooth", and Windows, Android and ChromeOS have their own
equivalents — after which the browser sees it through **Web MIDI**, with no
Bluetooth API involved at all.

So the transport question collapses into the Web MIDI question #278 already
answered, and the native bridge that #240 asks about becomes a **MIDI** bridge
rather than a **BLE GATT** bridge. That is a much smaller native surface: every
target OS already ships a MIDI stack (CoreMIDI, WinRT MIDI, ALSA), so the bridge
consumes an OS port instead of speaking GATT, managing pairing, and
reimplementing the packet decoder above.

A direct Web Bluetooth path remains *permitted* — the BLE-MIDI service is **not**
on the Web Bluetooth GATT blocklist, which contains 14 entries and mentions no
MIDI UUID. It stays in `selectStickTransport` as a fallback for a user who
cannot pair at the OS level. It is not the default, because choosing it means
owning pairing, reconnect and BLE-MIDI decoding that the OS would otherwise
handle, on the two platforms (Chrome, Edge) that were already the easiest.

## Browser and native matrix

| Platform | Web MIDI | Web Bluetooth | Stick usable |
|---|---|---|---|
| Chrome / Edge desktop | yes (43+ / 79+) | yes | yes |
| Chrome Android | yes | yes | yes |
| Firefox desktop | 108+, **but see below** | no | after an add-on |
| Safari desktop and iOS | **no**, any version | no | no — desktop app only |
| Tauri, Windows (WebView2) | yes | yes | yes |
| Tauri, macOS/Linux (WebKit) | **no** | no | native MIDI bridge |

### Correction to #278: Firefox is not simply "supported"

#278 records support as "Chrome 43+, Edge 79+, **Firefox 108+**, Opera 30+,
Samsung Internet 4+" and prescribes that feature detection "must degrade to
*'MIDI is unavailable on this browser'* and stay there". That copy is right for
Safari and **wrong for Firefox**.

Firefox implements Web MIDI, but `navigator.requestMIDIAccess()` **always
rejects** — localhost excepted — until the user installs a generated *site
permission add-on*. The API is present, feature detection passes, and the
promise still fails. A user shown "unavailable on this browser" would be told
something false about a browser where the stick can in fact work, and given no
way to fix it.

`selectStickTransport` therefore treats "has Web MIDI" and "Web MIDI will
resolve here" as different facts, and emits add-on copy for the second. The
Safari case keeps the dead-end wording #278 argued for, because WebKit has no
Web MIDI and no Web Bluetooth implementation in progress — and it adds that
camera and audio tracking are unaffected, so an absent accessory never reads as
a degraded product.

## What the stick contributes, and what it cannot

A stick measures **when** and **how hard**. It knows nothing about **where** the
kit is. So a stick-only `DrumHitEvent` carries a zero `position` and a zero
`velocity` vector, with the strike mapped into `speed` — a consumer distinguishes
a stick hit from a vision hit by that zero position rather than by trusting a
fabricated coordinate.

`fuseStickHitsWithVisual` therefore splits authority by what each sensor
actually measured: the stick supplies timing and velocity, the camera supplies
position, and a stroke seen by only one source passes through unchanged in
either direction. The second half matters as much as the first — plugging in an
accessory must never *remove* a hit the camera already had.

Note mapping follows the policy #278 settled: the General MIDI percussion table
as the default, overridable by a learn step, because modules and accessories
ship manufacturer defaults that players remap.

## Clock alignment

The stick's 13-bit clock is unrelated to the host's, and BLE adds latency on top
of the offset. This is why the device timestamp exists at all: BLE delivers on a
connection interval of 7.5 ms and up, so arrival time is quantised and jittered
by the radio while the on-device timestamp is not.

The prototype reuses the linear clock fit from #241
(`measureCaptureTimestampAlignment` / `applyClockAlignment`) rather than deriving
a second one — the problem is identical, and duplicating it would put two clock
models in the tree. What the fit can achieve here is bounded by the connection
interval, which is the number the hardware run has to produce.

## Measured gates — all BLOCKED

Every gate in #240's "Measured gates" list needs the physical accessory, and
none of them are answered by this prototype:

| Gate | Status |
|---|---|
| Packet rate, loss, timestamp offset/drift, reconnect time | BLOCKED — needs a stick |
| Hit timing and velocity correlation vs the webcam/audio baseline | BLOCKED |
| False double hits across disconnect/reconnect and fast rolls | partly covered — the duplicate guard is unit-tested against a replayed packet and a reconnect, but the *rate* of real duplicates is unmeasured |
| Battery drain over a fixed-duration run | BLOCKED |
| Environment, consent/license metadata, commit SHA, redacted evidence | BLOCKED |

What software can settle, and does: the packet decoding is correct against the
published format including the two encodings that are easy to get wrong; the
decoder degrades rather than throwing on 20,000 seeded random packets; a
reconnect does not replay strokes; transport selection is capability-based with
no user-agent sniffing; and device identifiers cannot reach a log line.

The prototype does not make the accessory mandatory and does not count as
completion of the webcam/audio acceptance path.

## Sources

- BLE-MIDI overview and specification — <https://midi.org/midi-over-bluetooth-low-energy-ble-midi>
- MIDI over Bluetooth LE, packet format and UUIDs — <https://devzone.nordicsemi.com/guides/short-range-guides/b/bluetooth-low-energy/posts/midi-over-bluetooth-le>
- MIDI BLE tutorial, timestamp assembly and running status — <https://learn.sparkfun.com/tutorials/midi-ble-tutorial/all>
- Freedrum transmits MIDI over BLE from an nRF52832 — <https://www.nordicsemi.com/Nordic-news/2018/10/Freedrum-employs-nRF52832-to-wirelessly-connect-drumstick-attached-devices>
- Senstroke sensors emit universal MIDI — <https://www.redison.com/products/individual-senstroke-sensor>
- Web Bluetooth GATT blocklist (no MIDI entry) — <https://github.com/WebBluetoothCG/registries/blob/master/gatt_blocklist.txt>
- Web MIDI browser support — <https://caniuse.com/midi>
- Firefox site permission add-on requirement — <https://blog.karimratib.me/2022/04/23/firefox-webmidi.html>
- Firefox Web MIDI enablement bug — <https://bugzilla.mozilla.org/show_bug.cgi?id=1752906>
- Pairing Bluetooth MIDI on macOS — <https://support.apple.com/guide/audio-midi-setup/set-up-bluetooth-midi-devices-ams33f013765/mac>
