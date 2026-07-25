from __future__ import annotations

import json
import sys
from pathlib import Path

from . import Kgm1bHeader, decode_header, decode_packet, encode_packet, header_json

USAGE = 'usage: python -m kgm1_codec decode-header|decode-packet <hex> | verify-vectors <path>'


def verify_vectors(path: str) -> int:
    """Check this implementation against the shared conformance fixture (#257).

    The same file drives the JS and Rust tests, so a format change cannot pass
    in one language while silently diverging in another.
    """
    rows = [
        line.strip().split('|')
        for line in Path(path).read_text(encoding='utf-8').splitlines()
        if line.strip() and not line.startswith('#')
    ]
    if not rows:
        print(f'{path}: no vectors found', file=sys.stderr)
        return 1

    roundtrips = rejects = 0
    failures: list[str] = []
    for row in rows:
        kind, name, packet_hex = row[0], row[1], row[2]
        packet_bytes = bytes.fromhex(packet_hex)
        if kind == 'roundtrip':
            payload = b'' if row[12] == '-' else bytes.fromhex(row[12])
            header = Kgm1bHeader(
                version_major=int(row[3]),
                version_minor=int(row[4]),
                frame_id=int(row[5]),
                source_time_ns=int(row[6]),
                monotonic_time_ns=int(row[7]),
                flags=int(row[8]),
                encoding=int(row[9]),
                payload_type=int(row[10]),
                payload_len=int(row[11]),
            )
            encoded = encode_packet(header, payload)
            if encoded.hex() != packet_hex:
                failures.append(f'{name}: encode produced {encoded.hex()}, expected {packet_hex}')
                continue
            try:
                decoded_header, decoded_payload = decode_packet(packet_bytes)
            except ValueError as exc:
                failures.append(f'{name}: decode failed: {exc}')
                continue
            if decoded_header != header:
                failures.append(f'{name}: header mismatch: {decoded_header} != {header}')
            elif decoded_payload != payload:
                failures.append(f'{name}: payload mismatch')
            else:
                roundtrips += 1
        elif kind == 'reject':
            try:
                decode_packet(packet_bytes)
            except ValueError:
                rejects += 1
            else:
                failures.append(f'{name}: these bytes must be rejected')
        else:
            failures.append(f'{name}: unknown kind {kind}')

    # Guard against a fixture that silently loses its contents.
    if roundtrips < 5:
        failures.append(f'expected several roundtrip vectors, saw {roundtrips}')
    if rejects < 5:
        failures.append(f'expected several reject vectors, saw {rejects}')

    if failures:
        for failure in failures:
            print(failure, file=sys.stderr)
        return 1
    print(json.dumps({'roundtrip': roundtrips, 'reject': rejects}, sort_keys=True))
    return 0


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv if argv is None else argv)
    if len(args) != 3 or args[1] not in {'decode-header', 'decode-packet', 'verify-vectors'}:
        print(USAGE, file=sys.stderr)
        return 2
    if args[1] == 'verify-vectors':
        return verify_vectors(args[2])
    try:
        data = bytes.fromhex(args[2])
        if args[1] == 'decode-header':
            print(json.dumps({'header': header_json(decode_header(data))}, sort_keys=True))
        else:
            header, payload = decode_packet(data)
            print(json.dumps({'header': header_json(header), 'payload_hex': payload.hex()}, sort_keys=True))
        return 0
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
