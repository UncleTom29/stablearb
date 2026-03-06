/**
 * Manual mock for viem.
 * Provides CJS-compatible stubs for the ESM viem library used in CRE workflow tests.
 */

export const parseAbiParameters = jest.fn().mockReturnValue([]);

export const encodeAbiParameters = jest.fn().mockReturnValue("0xdeadbeef");

export const bytesToHex = jest.fn().mockReturnValue("0xabcdef");
