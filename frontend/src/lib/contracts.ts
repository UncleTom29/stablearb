/**
 * lib/contracts.ts
 * Contract addresses and ABIs for the StableArb protocol.
 * Update addresses after deployment.
 */

export const CONTRACTS = {
  sepolia: {
    SUSD: (process.env.NEXT_PUBLIC_SUSD_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    VAULT: (process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    PEG_DEFENDER: (process.env.NEXT_PUBLIC_PEG_DEFENDER_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    CROSS_CHAIN_BUYBACK: (process.env.NEXT_PUBLIC_CROSS_CHAIN_BUYBACK_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as `0x${string}`,
    LINK: "0x779877A7B0D9E8603169DdbD7836e478b4624789" as `0x${string}`,
  },
  arbitrumSepolia: {
    SUSD: (process.env.NEXT_PUBLIC_SUSD_ARB_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    CROSS_CHAIN_BUYBACK: (process.env.NEXT_PUBLIC_CROSS_CHAIN_BUYBACK_ARB_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
  },
} as const;

// ── ABIs ────────────────────────────────────────────────────────────────────

export const SUSD_ABI = [
  { name: "balanceOf",   type: "function", stateMutability: "view",       inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "totalSupply", type: "function", stateMutability: "view",       inputs: [],                                     outputs: [{ name: "", type: "uint256" }] },
  { name: "approve",     type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { name: "allowance",   type: "function", stateMutability: "view",       inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

export const VAULT_ABI = [
  {
    name:             "depositETHAndMint",
    type:             "function",
    stateMutability:  "payable",
    inputs:           [{ name: "mintAmount", type: "uint256" }],
    outputs:          [],
  },
  {
    name:             "depositAndMint",
    type:             "function",
    stateMutability:  "nonpayable",
    inputs:           [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }, { name: "mintAmount", type: "uint256" }],
    outputs:          [],
  },
  {
    name:             "burnAndWithdraw",
    type:             "function",
    stateMutability:  "nonpayable",
    inputs:           [{ name: "burnAmount", type: "uint256" }, { name: "token", type: "address" }, { name: "withdrawAmount", type: "uint256" }],
    outputs:          [],
  },
  {
    name:             "collateralRatioOf",
    type:             "function",
    stateMutability:  "view",
    inputs:           [{ name: "user", type: "address" }],
    outputs:          [{ name: "", type: "uint256" }],
  },
  {
    name:             "collateralValueOf",
    type:             "function",
    stateMutability:  "view",
    inputs:           [{ name: "user", type: "address" }],
    outputs:          [{ name: "", type: "uint256" }],
  },
  {
    name:             "susdDebt",
    type:             "function",
    stateMutability:  "view",
    inputs:           [{ name: "user", type: "address" }],
    outputs:          [{ name: "", type: "uint256" }],
  },
  {
    name:             "collateralDeposits",
    type:             "function",
    stateMutability:  "view",
    inputs:           [{ name: "user", type: "address" }, { name: "token", type: "address" }],
    outputs:          [{ name: "", type: "uint256" }],
  },
  {
    name:  "CollateralDeposited",
    type:  "event",
    inputs: [
      { name: "user",   type: "address", indexed: true },
      { name: "token",  type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name:  "SUSDMinted",
    type:  "event",
    inputs: [
      { name: "user",   type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const PEG_DEFENDER_ABI = [
  {
    name:  "PegDefenseTriggered",
    type:  "event",
    inputs: [
      { name: "actionType", type: "string",  indexed: false },
      { name: "price",      type: "uint256", indexed: false },
      { name: "amount",     type: "uint256", indexed: false },
    ],
  },
  {
    name:            "lastActionTimestamp",
    type:            "function",
    stateMutability: "view",
    inputs:          [],
    outputs:         [{ name: "", type: "uint256" }],
  },
  {
    name:            "useDataStreams",
    type:            "function",
    stateMutability: "view",
    inputs:          [],
    outputs:         [{ name: "", type: "bool" }],
  },
] as const;
