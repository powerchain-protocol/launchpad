"use strict";

const MAX_WIDTH_BYTES = 1024 * 1024;

function asUint8Array(input, functionName) {
  if (input instanceof Uint8Array) {
    return input;
  }

  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }

  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }

  throw new TypeError(`${functionName}: expected a Uint8Array, Buffer, ArrayBuffer, or ArrayBufferView.`);
}

function assertBigInt(value, functionName) {
  if (typeof value !== "bigint") {
    throw new TypeError(`${functionName}: expected value to be a bigint.`);
  }
  if (value < 0n) {
    throw new RangeError(`${functionName}: negative BigInt values are not supported.`);
  }
}

function assertWidth(width, functionName) {
  if (!Number.isSafeInteger(width) || width < 0) {
    throw new RangeError(`${functionName}: width must be a non-negative safe integer.`);
  }
  if (width > MAX_WIDTH_BYTES) {
    throw new RangeError(`${functionName}: width exceeds the ${MAX_WIDTH_BYTES}-byte safety limit.`);
  }
}

function assertFits(value, width, functionName) {
  if (width === 0) {
    if (value !== 0n) {
      throw new RangeError(`${functionName}: value does not fit in a zero-width buffer.`);
    }
    return;
  }

  const bitWidth = BigInt(width) * 8n;
  if (value >= (1n << bitWidth)) {
    throw new RangeError(`${functionName}: value does not fit in ${width} byte${width === 1 ? "" : "s"}.`);
  }
}

function allocate(width) {
  const BufferCtor = globalThis.Buffer;
  if (BufferCtor && typeof BufferCtor.alloc === "function") {
    return BufferCtor.alloc(width);
  }
  return new Uint8Array(width);
}

function toBigIntBE(input) {
  const bytes = asUint8Array(input, "toBigIntBE");
  let value = 0n;
  for (let i = 0; i < bytes.length; i += 1) {
    value = (value << 8n) | BigInt(bytes[i]);
  }
  return value;
}

function toBigIntLE(input) {
  const bytes = asUint8Array(input, "toBigIntLE");
  let value = 0n;
  for (let i = bytes.length - 1; i >= 0; i -= 1) {
    value = (value << 8n) | BigInt(bytes[i]);
  }
  return value;
}

function toBufferBE(value, width) {
  assertBigInt(value, "toBufferBE");
  assertWidth(width, "toBufferBE");
  assertFits(value, width, "toBufferBE");

  const output = allocate(width);
  let remaining = value;
  for (let i = width - 1; i >= 0; i -= 1) {
    output[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return output;
}

function toBufferLE(value, width) {
  assertBigInt(value, "toBufferLE");
  assertWidth(width, "toBufferLE");
  assertFits(value, width, "toBufferLE");

  const output = allocate(width);
  let remaining = value;
  for (let i = 0; i < width; i += 1) {
    output[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return output;
}

module.exports = {
  toBigIntBE,
  toBigIntLE,
  toBufferBE,
  toBufferLE,
};
