<!-- i18n: language-switcher -->
[English](privacy.md) | [日本語](privacy.ja.md)

# Security and Privacy

## Default rule

Do not send raw webcam frames to a server by default.

## Data classes

| Data | Default storage | Default transport |
|---|---|---|
| raw webcam frames | memory only | never |
| raw audio | memory only | never |
| KGM1 motion frame | optional local recording | allowed with user action |
| calibration profile | local storage / file | explicit export only |
| benchmark video | local file | explicit opt-in upload only |

## Threats

- accidental raw video upload
- malicious avatar package
- malicious npm package
- model supply-chain attack
- browser permission confusion
- remote room impersonation

## Mitigations

- clear camera indicator
- local-first mode
- dependency pinning
- model hash verification
- content security policy
- room tokens
- audit logs without raw media
