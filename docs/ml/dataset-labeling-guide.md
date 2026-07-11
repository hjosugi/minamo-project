<!-- i18n: language-switcher -->
[English](dataset-labeling-guide.md) | [日本語](dataset-labeling-guide.ja.md)

# Stick and Drum Dataset Labeling Guide

This guide covers the privacy-preserving dataset path used by the tracker and the first YOLO-style stick detector baseline.

## Capture policy

- Default capture is landmarks, labels, quality scores, calibrated drum zones, and hand targets only.
- Raw camera frames, raw audio, canvas snapshots, thumbnails, and media blobs are not included in default NDJSON exports.
- Every record carries a label, license, timestamp, consent block, and `rawMedia: false`.
- Contributors who collect raw video for local experiments must keep it outside the default tracker export and blur faces before sharing drum-only clips.

## Tracker workflow

1. Open `tracker/` and start tracking.
2. Enable hands for stick, contact, and drum labels.
3. Use Drummer setup to calibrate zones when collecting hit or zone labels.
4. Pick a label in Dataset capture.
5. Press Capture sample for single examples, or enable Capture at 2 fps for short bursts.
6. Download NDJSON and keep the license field attached to the file.

## Labels

| Label | Use for | Required context |
|---|---|---|
| `stick-tip` | stick tip point or inferred tip trajectory | hand target, wrist, gesture, quality |
| `stick-box` | detector bounding-box training plan | hand target plus optional local raw frame outside default export |
| `drum-hit` | hit timing and zone classification | calibrated drum zone, active zone id |
| `hand-contact` | hand-object contact classifier | hand target, curls, wrist, confidence |
| `low-light` | quality classifier negative examples | quality score and warning state |
| `motion-blur` | blur detector and fast-stick cases | quality warning and hand velocity |
| `open-hand` | hand baseline and false contact negatives | hand target, gesture |
| `unlabeled` | temporary triage only | must be relabeled before training |

## Record schema

Tracker exports use `minamo.dataset.tracker-sample.v1` NDJSON. Each line contains:

- `label`, `license`, `createdAt`, `source`, and `capturedBy`
- `consent.rawMedia: false`
- rounded `face`, `pose`, `hands`, `quality`, and `drum` fields
- runtime settings needed to reproduce mirror, hand, pose, drummer mode, resolution, and fps

The export is designed for browser-side model research and can be consumed by scripts that build YOLO or classifier training sets. Raw-frame datasets must live in a separate opt-in pipeline with explicit review.

## Baseline evaluation

The first stick detector should be evaluated, not adopted by default, until it beats the current MediaPipe-plus-heuristic path on:

- stick tip p95 error
- hit recall
- false hit rate
- p95 latency on WebGPU and WASM
- behavior in low light and motion blur

Use `createYoloStickDetectorBaselinePlan()` in `src/core/ml.ts` as the code-level decision record for the baseline.
