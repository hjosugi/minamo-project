# Layered Avatar Mode

Layered avatar mode is the no-rig PNGTuber path. Drop a PSD file or multiple
PNG files onto the viewer. The viewer classifies layers by name, switches blink
and mouth layers from KGM1 face weights, and applies head-driven parallax.

## Layer names

Use these names in PSD layers or PNG filenames:

- `body`, `base`, `head`, `face`: neutral base layer
- `eyes open`, `eyes`: visible when blink is low
- `eyes closed`, `blink`, `wink`: visible when blink is high
- `mouth closed`, `mouth`: visible when jaw/mouth is neutral
- `mouth open`, `jaw open`, `aa`: visible when jaw/mouth opens
- `brow`, `eyebrow`: always visible expression accent
- `back`, `shadow`, `hair back`: negative parallax depth
- `front`, `overlay`, `hair front`: positive parallax depth

## Manifest

The generated manifest uses
[`minamo.layered-avatar.v1`](layered-avatar.schema.json):

```json
{
  "schema": "minamo.layered-avatar.v1",
  "parallaxPx": 18,
  "layers": [
    { "name": "body.png", "slot": "body", "depth": 0 },
    { "name": "eyes closed.png", "slot": "eyesClosed", "depth": 0.2 },
    { "name": "mouth open.png", "slot": "mouthOpen", "depth": 0.24 }
  ]
}
```

Depth is clamped to `[-1, 1]`. Positive depth moves more with the head, negative
depth moves against it. The viewer exposes a parallax control so creators can
tune the amount without rebuilding assets.
