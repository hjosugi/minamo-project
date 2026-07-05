# Erlang Router Service

This is a design skeleton for a future OTP-based session router.

Responsibilities:

- room/session supervision
- KGM1 stream fanout
- participant presence
- backpressure
- WebTransport/WebSocket gateway supervision
- metrics

The MVP can run fully in the browser. This service is for remote collaboration and production scaling.
