from __future__ import annotations

import struct
from dataclasses import asdict, dataclass

MAGIC = b'KGM1'
HEADER_LEN = 40
HEADER_STRUCT = struct.Struct('<4sHHQQQHBBI')


@dataclass(frozen=True)
class Kgm1bHeader:
    version_major: int = 0
    version_minor: int = 1
    frame_id: int = 0
    source_time_ns: int = 0
    monotonic_time_ns: int = 0
    flags: int = 0
    encoding: int = 1
    payload_type: int = 0
    payload_len: int = 0


def decode_header(data: bytes) -> Kgm1bHeader:
    if len(data) < HEADER_LEN:
        raise ValueError('input too short')
    magic, version_major, version_minor, frame_id, source_time_ns, monotonic_time_ns, flags, encoding, payload_type, payload_len = HEADER_STRUCT.unpack_from(data)
    if magic != MAGIC:
        raise ValueError('invalid magic')
    return Kgm1bHeader(
        version_major=version_major,
        version_minor=version_minor,
        frame_id=frame_id,
        source_time_ns=source_time_ns,
        monotonic_time_ns=monotonic_time_ns,
        flags=flags,
        encoding=encoding,
        payload_type=payload_type,
        payload_len=payload_len,
    )


def encode_header(header: Kgm1bHeader) -> bytes:
    return HEADER_STRUCT.pack(
        MAGIC,
        header.version_major,
        header.version_minor,
        header.frame_id,
        header.source_time_ns,
        header.monotonic_time_ns,
        header.flags,
        header.encoding,
        header.payload_type,
        header.payload_len,
    )


def decode_packet(data: bytes) -> tuple[Kgm1bHeader, bytes]:
    header = decode_header(data)
    end = HEADER_LEN + header.payload_len
    if len(data) < end:
        raise ValueError('payload truncated')
    return header, data[HEADER_LEN:end]


def encode_packet(header: Kgm1bHeader, payload: bytes) -> bytes:
    actual = Kgm1bHeader(
        version_major=header.version_major,
        version_minor=header.version_minor,
        frame_id=header.frame_id,
        source_time_ns=header.source_time_ns,
        monotonic_time_ns=header.monotonic_time_ns,
        flags=header.flags,
        encoding=header.encoding,
        payload_type=header.payload_type,
        payload_len=len(payload),
    )
    return encode_header(actual) + payload


def header_json(header: Kgm1bHeader) -> dict[str, int | str]:
    out = asdict(header)
    for key in ('frame_id', 'source_time_ns', 'monotonic_time_ns'):
        out[key] = str(out[key])
    return out
