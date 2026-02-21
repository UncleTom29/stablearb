"use client";

import { useReadContracts } from "wagmi";
import { useAccount } from "wagmi";
import { sepolia } from "wagmi/chains";
import { CONTRACTS, VAULT_ABI, SUSD_ABI } from "@/lib/contracts";
import { formatEther } from "viem";

export function useVault() {
  const { address } = useAccount();

  const vaultAddr = CONTRACTS.sepolia.VAULT;
  const susdAddr  = CONTRACTS.sepolia.SUSD;

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      {
        address:      vaultAddr,
        abi:          VAULT_ABI,
        functionName: "collateralRatioOf",
        args:         [address ?? "0x0000000000000000000000000000000000000000"],
        chainId:      sepolia.id,
      },
      {
        address:      vaultAddr,
        abi:          VAULT_ABI,
        functionName: "collateralValueOf",
        args:         [address ?? "0x0000000000000000000000000000000000000000"],
        chainId:      sepolia.id,
      },
      {
        address:      vaultAddr,
        abi:          VAULT_ABI,
        functionName: "susdDebt",
        args:         [address ?? "0x0000000000000000000000000000000000000000"],
        chainId:      sepolia.id,
      },
      {
        address:      susdAddr,
        abi:          SUSD_ABI,
        functionName: "balanceOf",
        args:         [address ?? "0x0000000000000000000000000000000000000000"],
        chainId:      sepolia.id,
      },
      {
        address:      susdAddr,
        abi:          SUSD_ABI,
        functionName: "totalSupply",
        chainId:      sepolia.id,
      },
    ],
  });

  const collateralRatio  = data?.[0]?.result ? Number(data[0].result as bigint) : undefined;
  const collateralValueWei = data?.[1]?.result as bigint | undefined;
  const susdDebt         = data?.[2]?.result as bigint | undefined;
  const susdBalance      = data?.[3]?.result as bigint | undefined;
  const totalSupply      = data?.[4]?.result as bigint | undefined;

  return {
    collateralRatio,
    collateralValueUsd: collateralValueWei ? formatEther(collateralValueWei) : "0",
    susdDebt:           susdDebt           ? formatEther(susdDebt)           : "0",
    susdBalance:        susdBalance        ? formatEther(susdBalance)        : "0",
    totalSupply:        totalSupply        ? formatEther(totalSupply)        : "0",
    isLoading,
    refetch,
  };
}
