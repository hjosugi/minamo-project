# Troubleshooting Bad Tracking

## Poor face tracking

- Put the key light in front of the face, not behind the monitor.
- Keep the face between 20% and 60% of the camera height.
- Disable heavy beautification filters before tracking.
- Use the tracker quality chip: `poor` with `low light` means fix lighting
  before changing smoothing.

## Hand tracking problems

- Keep fingertips inside the frame; the tracker warns when hands leave frame.
- Avoid palms edge-on to the camera during calibration.
- Use 720p/60 when hand motion matters; use 480p/30 on low-end laptops.
- If fingers flicker, switch smoothing to `smooth` and recalibrate neutral.

## Transport problems

- Local mode only works between tabs in the same browser profile.
- WebSocket mode needs the same room and token on tracker and viewer.
- WebTransport mode needs the certificate hash from `relay-rs`.

## Avatar problems

- Use Center in the viewer after loading a VRM.
- If fingers bend backward, use a rig-limit preset before streaming.
- For OBS transparent output, enable Transparent in the viewer and add it as a
  browser source.
