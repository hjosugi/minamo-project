import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

export const AVATAR_DECODER_SUPPORT = Object.freeze({
  ktx2: 'KHR_texture_basisu',
  meshopt: 'EXT_meshopt_compression',
  draco: 'KHR_draco_mesh_compression',
});

/**
 * Build one reusable loader set. Three.js resolves the Basis and Draco worker
 * assets through import.meta.url, so Vite emits them beside the application
 * bundle for hosted and Tauri/offline builds.
 *
 * @param {import('three').WebGLRenderer} renderer
 */
export function createVrmLoader(renderer) {
  if (!renderer) throw new Error('Avatar loader requires an initialized renderer.');

  const ktx2Loader = new KTX2Loader();
  ktx2Loader.detectSupport(renderer);

  const dracoLoader = new DRACOLoader();
  const loader = new GLTFLoader();
  loader.setKTX2Loader(ktx2Loader);
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.setDRACOLoader(dracoLoader);
  loader.register((parser) => new VRMLoaderPlugin(parser));

  return Object.freeze({
    loader,
    dispose() {
      ktx2Loader.dispose();
      dracoLoader.dispose();
    },
  });
}

/**
 * Classify an avatar load failure into an i18n key plus the redacted upstream
 * detail (#307).
 *
 * A descriptor rather than a composed string: the caller renders it through the
 * page's `t`, so the guidance appears in the reader's language, and because the
 * key survives, a language toggle can replay the message instead of stranding
 * whatever was on screen.
 *
 * @param {unknown} error
 * @returns {{key: string, params: {detail: string}}}
 */
export function describeAvatarLoadError(error) {
  const raw = error instanceof Error ? error.message : String(error || 'unknown loader error');
  const detail = redactUrlSecrets(raw);
  const params = { detail };

  if (/KTX2Loader|KHR_texture_basisu|basis[_ -]?transcoder/i.test(detail)) {
    return { key: 'viewer.error.avatar.ktx2', params };
  }
  if (/MeshoptDecoder|EXT_meshopt_compression|meshopt/i.test(detail)) {
    return { key: 'viewer.error.avatar.meshopt', params };
  }
  if (/DRACOLoader|KHR_draco_mesh_compression|draco/i.test(detail)) {
    return { key: 'viewer.error.avatar.draco', params };
  }
  if (/Unexpected token|Unexpected end|invalid|malformed|parse|magic|header/i.test(detail)) {
    return { key: 'viewer.error.avatar.corrupt', params };
  }
  if (/fetch|network|404|Failed to load/i.test(detail)) {
    return { key: 'viewer.error.avatar.network', params };
  }
  return { key: 'viewer.error.avatar.generic', params };
}

function redactUrlSecrets(value) {
  return value.replace(/(https?:\/\/[^\s?#]+)(?:\?[^\s#)]*)?(?:#[^\s)]*)?/gi, '$1?[redacted]');
}
