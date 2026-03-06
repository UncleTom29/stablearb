/**
 * Manual mock for @chainlink/cre-sdk.
 * Provides CJS-compatible stubs for ESM-only SDK used in CRE workflow tests.
 */

export const EVMClient = jest.fn().mockImplementation(() => ({
  writeReport: jest.fn().mockReturnValue({
    result: () => ({ txHash: new Uint8Array([0xab, 0xcd, 0xef]) }),
  }),
}));

export const HTTPClient = jest.fn().mockImplementation(() => ({
  sendRequest: jest.fn().mockReturnValue({
    result: () => ({
      price: (1n * BigInt(1e18)).toString(),
    }),
  }),
}));

export const CronCapability = jest.fn().mockImplementation(() => ({
  trigger: jest.fn().mockReturnValue({ type: "cron", schedule: "*/5 * * * *" }),
}));

export const Runner = {
  newRunner: jest.fn().mockResolvedValue({
    run: jest.fn().mockResolvedValue(undefined),
  }),
};

export const handler = jest.fn((trigger: unknown, fn: unknown) => ({ trigger, fn }));

export const consensusMedianAggregation = jest.fn().mockReturnValue("median-aggregation");

export const prepareReportRequest = jest.fn().mockReturnValue({ data: "mock-report-request" });

export const ok = jest.fn().mockReturnValue(true);

export const text = jest.fn().mockReturnValue(
  JSON.stringify({
    report: { price: (1n * BigInt(1e18)).toString() },
  })
);
