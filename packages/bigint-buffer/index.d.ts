/** Byte inputs accepted by the PowerChain bigint-buffer compatibility package. */
export type BigIntBufferInput = Uint8Array | ArrayBuffer | ArrayBufferView;

/** Convert an unsigned big-endian byte sequence to a bigint. */
export declare function toBigIntBE(input: BigIntBufferInput): bigint;

/** Convert an unsigned little-endian byte sequence to a bigint. */
export declare function toBigIntLE(input: BigIntBufferInput): bigint;

/**
 * Convert an unsigned bigint to exactly `width` bytes in big-endian order.
 * Throws when the value is negative or does not fit in the requested width.
 * In Node.js the runtime returns a Buffer; browsers receive a Uint8Array.
 */
export declare function toBufferBE(value: bigint, width: number): Uint8Array;

/**
 * Convert an unsigned bigint to exactly `width` bytes in little-endian order.
 * Throws when the value is negative or does not fit in the requested width.
 * In Node.js the runtime returns a Buffer; browsers receive a Uint8Array.
 */
export declare function toBufferLE(value: bigint, width: number): Uint8Array;
