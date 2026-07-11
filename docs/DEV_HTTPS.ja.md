<!-- i18n: language-switcher -->
[English](DEV_HTTPS.md) | [日本語](DEV_HTTPS.ja.md)

# HTTPSローカル開発

カメラキャプチャは`localhost`でHTTPSなしで動作します。携帯電話、タブレット、その他のLANデバイスでは、ブラウザは安全なコンテキストを要求します。

## mkcertのセットアップ

```sh
mkcert -install
mkcert localhost 127.0.0.1 ::1 "$(hostname).local"
```

生成された証明書とキーを使用できる任意のHTTPS静的サーバーでリポジトリを提供します。携帯電話で`https://<your-host>.local/tracker/`を開き、表示デバイスで`https://<your-host>.local/viewer/`を開きます。

## CaddyによるWSSリレー

Nodeリレーをループバックで実行し、CaddyでTLSを終了します。Caddyの`reverse_proxy`はWebSocketのアップグレードをサポートし、`tls internal`はローカルCAから証明書を発行します：

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

`https://minamo.local/tracker/`および`wss://minamo.local/ws`を使用する前に、携帯電話とデスクトップの両方にCaddyのローカルルートCAをインストール/信頼してください。証明書の警告をバイパスしないでください。パブリックホスト名の場合は、`tls internal`の代わりにCaddyの通常のパブリック証明書自動化を使用してください。

参考文献: [Caddyリバースプロキシ](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) および [Caddy TLS](https://caddyserver.com/docs/caddyfile/directives/tls)。

## WebTransportの注意

`relay-rs`は起動時に`cert sha-256`値を出力します。その値をトラッカーとビューワーの`cert sha-256`フィールドに貼り付けます。ページがHTTPSであり、`serverCertificateHashes`がリレー証明書と一致する場合、Chromeフラグは必要ありません。

Safari 26.4はWebTransportを追加しました。Minamoは実行時に`WebTransport`が存在するかどうかを確認します。Safari/iOSユーザーエージェントからサポートを推測することはありません。HTTPS WebTransportエンドポイントとWSSフォールバックの両方が存在する場合、接続順序はWTの後にWSSです。WebTransportのないSafari 26.3およびその他のランタイムはWSSから開始します。詳細は[WebKitのSafari 26.4機能ノート](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/)および[W3C WebTransportドラフト](https://www.w3.org/TR/webtransport/)を参照してください。

## チェックリスト

- 携帯電話とデスクトップは同じ信頼されたネットワーク上にあります。
- HTTPS証明書は入力したLANホスト名をカバーしています。
- ブラウザのカメラ権限がHTTPSオリジンに対して許可されています。
- `wt`モードはオプションです。WSSは安全な携帯電話のフォールバックです。
- HTTPS携帯電話ページはプレーンWSやサイレントローカルチャネルにフォールバックしません。
- 診断情報は選択されたトランスポートと各失敗したフォールバック理由を示します。