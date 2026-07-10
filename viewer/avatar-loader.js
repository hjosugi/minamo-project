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

/** @param {unknown} error */
export function formatAvatarLoadError(error) {
  const raw = error instanceof Error ? error.message : String(error || 'unknown loader error');
  const message = redactUrlSecrets(raw);

  if (/KTX2Loader|KHR_texture_basisu|basis[_ -]?transcoder/i.test(message)) {
    return `KTX2 texture decode failed. Verify that the asset is valid KTX2/BasisU and that this build contains the Basis transcoder. (${message})`;
  }
  if (/MeshoptDecoder|EXT_meshopt_compression|meshopt/i.test(message)) {
    return `Meshopt geometry decode failed. Re-inspect the source and repack it with a supported meshopt encoder. (${message})`;
  }
  if (/DRACOLoader|KHR_draco_mesh_compression|draco/i.test(message)) {
    return `Draco geometry decode failed. Verify the Draco stream and avoid stacking Draco after meshopt. (${message})`;
  }
  if (/Unexpected token|Unexpected end|invalid|malformed|parse|magic|header/i.test(message)) {
    return `The avatar is corrupt or is not a valid VRM/GLB file. Run "pnpm inspect:glb -- <file> --avatar" for details. (${message})`;
  }
  if (/fetch|network|404|Failed to load/i.test(message)) {
    return `The avatar or one of its resources could not be loaded. Use a self-contained VRM/GLB and verify local decoder assets. (${message})`;
  }
  return `Avatar load failed. Run "pnpm inspect:glb -- <file> --avatar" and check the browser console. (${message})`;
}

function redactUrlSecrets(value) {
  return value.replace(/(https?:\/\/[^\s?#]+)(?:\?[^\s#)]*)?(?:#[^\s)]*)?/gi, '$1?[redacted]');
}
