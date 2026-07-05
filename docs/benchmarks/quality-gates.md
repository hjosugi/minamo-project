# Quality Gates

## P0 gates

- no NaN/Infinity reaches renderer
- no impossible finger pose reaches renderer without clamp warning
- no mouth flicker above threshold during closed-mouth neutral test
- no blink flicker above threshold during open-eye test
- no drum hit emitted from one visual frame only
- no raw webcam upload in default mode

## P1 gates

- 60fps target on modern laptop for face + hands
- 30fps fallback on low-end laptop
- stable hand reacquisition after 500ms occlusion
- hit timing error under target threshold for simple snare hits
- avatar mapping test for VRM and one 2D format

## P2 gates

- WebTransport motion streaming under target latency
- mobile browser smoke test
- low-light quality warning
- custom stick detector benchmark
