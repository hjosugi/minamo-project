from __future__ import annotations

import json
import sys

from . import decode_header, decode_packet, header_json


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv if argv is None else argv)
    if len(args) != 3 or args[1] not in {'decode-header', 'decode-packet'}:
        print('usage: python -m kgm1_codec decode-header|decode-packet <hex>', file=sys.stderr)
        return 2
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
