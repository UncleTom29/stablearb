/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          module: "CommonJS",
          moduleResolution: "node",
          strict: false,
        },
      },
    ],
  },
  // Map ESM-only packages to local CJS-compatible mocks so Jest can load them
  moduleNameMapper: {
    "^@chainlink/cre-sdk$": "<rootDir>/src/__mocks__/@chainlink/cre-sdk.ts",
    "^viem$": "<rootDir>/src/__mocks__/viem.ts",
  },
};
