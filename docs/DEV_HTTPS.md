# HTTPS Local Development

Camera capture works on `localhost` without HTTPS. For phones, tablets, and
other LAN devices, browsers require a secure context.

## mkcert setup

```sh
mkcert -install
mkcert localhost 127.0.0.1 ::1 "$(hostname).local"
```

Serve the repo with any HTTPS static server that can use the generated cert and
key. Open `https://<your-host>.local/tracker/` on the phone and
`https://<your-host>.local/viewer/` on the display device.

## WebTransport note

`relay-rs` prints a `cert sha-256` value on startup. Paste that value into the
tracker and viewer `cert sha-256` fields. Chrome flags are not needed when the
page is HTTPS and `serverCertificateHashes` matches the relay certificate.

## Checklist

- Phone and desktop are on the same trusted network.
- The HTTPS certificate covers the LAN hostname you typed.
- Browser camera permission is allowed for the HTTPS origin.
- `wt` mode is optional; `local` and `ws` remain useful for setup debugging.
