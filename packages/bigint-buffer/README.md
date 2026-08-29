# bigint-buffer

**PowerChain workspace package — version 1.0.0**

A dependency-free, pure-JavaScript compatibility package for converting unsigned `bigint` values to and from fixed-width byte buffers.

It intentionally provides the familiar four-function `bigint-buffer` surface without native N-API bindings, postinstall scripts, or optional compiled artifacts:

- `toBigIntBE(bytes)`
- `toBigIntLE(bytes)`
- `toBufferBE(value, width)`
- `toBufferLE(value, width)`

## Why this package exists

PowerChain uses BigInt-heavy Solana and payment code. The historical `bigint-buffer` package relies on native bindings in Node and falls back to JavaScript when those bindings are unavailable. This workspace implementation removes that native build boundary entirely.

The package is:

- pure JavaScript;
- zero dependency;
- dual ESM/CommonJS;
- browser safe;
- strict about malformed input;
- explicit about overflow instead of silently truncating values;
- capped at 1 MiB per output allocation as a defensive memory bound.

## API

```js
import {
  toBigIntBE,
  toBigIntLE,
  toBufferBE,
  toBufferLE,
} from "bigint-buffer";

const value = 0xdeadbeefn;

const be = toBufferBE(value, 8);
// 00 00 00 00 de ad be ef

const le = toBufferLE(value, 8);
// ef be ad de 00 00 00 00

toBigIntBE(be); // 3735928559n
toBigIntLE(le); // 3735928559n
```

`Buffer` is accepted because Node's `Buffer` extends `Uint8Array`. `ArrayBuffer` and other `ArrayBufferView` values are also accepted.

In Node.js, output functions return an actual `Buffer` when the global `Buffer` constructor is available. In browser runtimes they return `Uint8Array`.

## Validation semantics

The package rejects:

- non-byte inputs;
- non-`bigint` output values;
- negative values;
- negative or non-integer widths;
- values that do not fit the requested width;
- allocations larger than 1 MiB.

No conversion silently truncates high bits.

## Monorepo integration

The package is intentionally named `bigint-buffer` and marked `private` so the workspace can use it as a local compatibility replacement.

With pnpm, the canonical root can pin it through the workspace dependency/override policy used by the repository, for example:

```json
{
  "pnpm": {
    "overrides": {
      "bigint-buffer": "workspace:*"
    }
  }
}
```

Use the exact override syntax supported by the pinned pnpm release and verify the lockfile resolves `bigint-buffer` to this workspace package before production deployment.

## Security boundary

This package performs byte encoding only. It does not decide token amounts, payment recipients, fees, settlement authority, signatures, or transaction validity. Those remain server-authoritative PowerChain domain/chain responsibilities.
