/* tslint:disable */
/* eslint-disable */

/**
 * Minimal browser boundary around the official Inox2D renderer. File metadata
 * and parameter discovery stay in JavaScript so this crate does not fork
 * Inox2D merely to expose its private parameter map.
 */
export class InoxModel {
    free(): void;
    [Symbol.dispose](): void;
    draw(): void;
    get_author(): string;
    get_name(): string;
    constructor(bytes: Uint8Array, canvas_id: string);
    resize(width: number, height: number): void;
    set_camera_position(x: number, y: number): void;
    set_camera_scale(scale: number): void;
    set_parameter(name: string, value: number): void;
    set_parameter_2d(name: string, x: number, y: number): void;
    /**
     * Advances exactly one caller-owned frame. Parameters are queued by
     * set_parameter so begin_frame cannot reset a value before it is applied.
     */
    update(delta_time: number): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_inoxmodel_free: (a: number, b: number) => void;
    readonly inoxmodel_draw: (a: number) => void;
    readonly inoxmodel_get_author: (a: number) => [number, number];
    readonly inoxmodel_get_name: (a: number) => [number, number];
    readonly inoxmodel_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly inoxmodel_resize: (a: number, b: number, c: number) => void;
    readonly inoxmodel_set_camera_position: (a: number, b: number, c: number) => void;
    readonly inoxmodel_set_camera_scale: (a: number, b: number) => void;
    readonly inoxmodel_set_parameter: (a: number, b: number, c: number, d: number) => [number, number];
    readonly inoxmodel_set_parameter_2d: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly inoxmodel_update: (a: number, b: number) => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
