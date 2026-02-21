"use client";

/**
 * lib/wagmi.ts
 * Wagmi v2 + RainbowKit configuration.
 */

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia, arbitrumSepolia } from "wagmi/chains";

export const wagmiConfig = getDefaultConfig({
  appName:     "StableArb",
  projectId:   process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "YOUR_PROJECT_ID",
  chains:      [sepolia, arbitrumSepolia],
  ssr:         true,
});
