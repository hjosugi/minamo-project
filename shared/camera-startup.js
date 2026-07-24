// Camera bring-up helpers extracted from tracker.js (#253).
//
// startCamera() had two unguarded await points:
//   - waiting for `loadedmetadata` with no timeout (some virtual cameras and
//     permission races never fire it, hanging the UI forever), and
//   - `video.play()` whose autoplay-policy rejection surfaced as a raw error.
//
// These helpers add a bounded metadata wait and actionable play() handling, and
// keep the logic free of DOM globals so it can be unit tested with a stubbed
// video element.

export const CAMERA_METADATA_TIMEOUT_MS = 8000;

// HTMLMediaElement.readyState: HAVE_METADATA === 1 (dimensions/duration known).
const HAVE_METADATA = 1;

/**
 * Resolve once the video element reports metadata, or reject with an actionable
 * error on timeout or a media error. Never hangs.
 *
 * @param {{ readyState?: number, addEventListener: Function, removeEventListener: Function }} video
 * @param {{ timeoutMs?: number, setTimeoutFn?: Function, clearTimeoutFn?: Function }} [options]
 * @returns {Promise<void>}
 */
export function waitForVideoMetadata(video, options = {}) {
  const {
    timeoutMs = CAMERA_METADATA_TIMEOUT_MS,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
  } = options;

  if ((video.readyState ?? 0) >= HAVE_METADATA) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
      if (timer !== null) clearTimeoutFn(timer);
    };
    const finish = (settle, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      settle(value);
    };
    const onLoaded = () => finish(resolve, undefined);
    const onError = () => {
      const err = new Error(
        'The camera stream stopped before it reported video dimensions. Try another camera or resolution and press Start again.',
      );
      err.name = 'CameraMetadataError';
      finish(reject, err);
    };
    timer = setTimeoutFn(() => {
      const seconds = Math.max(1, Math.round(timeoutMs / 1000));
      const err = new Error(
        `The camera did not start within ${seconds}s. Some virtual cameras or a permission race can cause this — reselect the camera and press Start again.`,
      );
      err.name = 'CameraMetadataTimeoutError';
      finish(reject, err);
    }, timeoutMs);
    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

/**
 * Start playback, translating autoplay-policy rejections into an actionable
 * message and treating a superseded-load AbortError as non-fatal.
 *
 * @param {{ play: () => Promise<unknown> }} video
 * @returns {Promise<void>}
 */
export async function startVideoPlayback(video) {
  try {
    await video.play();
  } catch (error) {
    // A newer load (e.g. a rapid camera switch) interrupts the pending play();
    // that later startCamera() owns playback, so this rejection is expected.
    if (error?.name === 'AbortError') return;
    // Autoplay policy: playback needs a user gesture. Guide the user instead of
    // leaking the raw DOMException.
    if (error?.name === 'NotAllowedError') {
      const err = new Error(
        'The browser blocked video playback until you interact with the page. Click Start again (or tap the page) to begin tracking.',
      );
      err.name = 'CameraPlaybackBlockedError';
      throw err;
    }
    throw error;
  }
}
