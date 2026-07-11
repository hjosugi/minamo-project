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

## WSS relay with Caddy

Run the Node relay on loopback, then terminate TLS in Caddy. Caddy's
`reverse_proxy` supports the WebSocket upgrade and `tls internal` issues a
certificate from its local CA:

```caddyfile
minamo.local {
  tls internal
  reverse_proxy 127.0.0.1:8787
}
```

```sh
MINAMO_ALLOWED_ORIGINS=https://minamo.local pnpm --dir relay-node start
caddy run --config Caddyfile
```

Install/trust Caddy's local root CA on both the phone and desktop before using
`https://minamo.local/tracker/` and `wss://minamo.local/ws`. Do not bypass a
certificate warning. For a public hostname, use Caddy's normal public
certificate automation instead of `tls internal`.

References: [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
and [Caddy TLS](https://caddyserver.com/docs/caddyfile/directives/tls).

## WebTransport note

`relay-rs` prints a `cert sha-256` value on startup. Paste that value into the
tracker and viewer `cert sha-256` fields. Chrome flags are not needed when the
page is HTTPS and `serverCertificateHashes` matches the relay certificate.

Safari 26.4 added WebTransport. Minamo checks whether `WebTransport` exists at
runtime; it does not infer support from the Safari/iOS user agent. When both an
HTTPS WebTransport endpoint and WSS fallback are present, the connection order
is WT then WSS. Safari 26.3 and other runtimes without WebTransport start with
WSS. See [WebKit's Safari 26.4 feature notes](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/)
and the [W3C WebTransport draft](https://www.w3.org/TR/webtransport/).

## Checklist

- Phone and desktop are on the same trusted network.
- The HTTPS certificate covers the LAN hostname you typed.
- Browser camera permission is allowed for the HTTPS origin.
- `wt` mode is optional; WSS is the secure phone fallback.
- An HTTPS phone page never falls back to plain WS or a silent local channel.
- The diagnostics show the selected transport and each failed fallback reason.
