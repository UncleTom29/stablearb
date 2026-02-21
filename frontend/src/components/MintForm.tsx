"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, parseUnits } from "viem";
import { CONTRACTS, VAULT_ABI } from "@/lib/contracts";

type CollateralType = "ETH" | "WETH";

export default function MintForm() {
  const { address, isConnected } = useAccount();

  const [collateralType, setCollateralType] = useState<CollateralType>("ETH");
  const [collateralAmount, setCollateralAmount] = useState("");
  const [mintAmount, setMintAmount] = useState("");

  const { data: hash, writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  // Estimated max mintable = (collateral * price * 100) / 150
  // Using a simple 2000 USD/ETH approximation for UI purposes
  const estimatedMaxMint =
    collateralAmount
      ? ((parseFloat(collateralAmount) * 2000 * 100) / 150).toFixed(2)
      : "0.00";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address) return;

    const mintBigInt      = parseUnits(mintAmount || "0", 18);
    const collateralBigInt = parseEther(collateralAmount || "0");

    if (collateralType === "ETH") {
      writeContract({
        address:      CONTRACTS.sepolia.VAULT,
        abi:          VAULT_ABI,
        functionName: "depositETHAndMint",
        args:         [mintBigInt],
        value:        collateralBigInt,
      });
    } else {
      writeContract({
        address:      CONTRACTS.sepolia.VAULT,
        abi:          VAULT_ABI,
        functionName: "depositAndMint",
        args:         [CONTRACTS.sepolia.WETH, collateralBigInt, mintBigInt],
      });
    }
  }

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-gray-500">Connect your wallet to mint SUSD.</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5"
    >
      <h2 className="text-lg font-semibold text-gray-800">Deposit &amp; Mint SUSD</h2>

      {/* Collateral type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Collateral Type
        </label>
        <div className="flex gap-3">
          {(["ETH", "WETH"] as CollateralType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setCollateralType(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                collateralType === t
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-700 border-gray-300 hover:border-indigo-400"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Collateral amount */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Collateral Amount ({collateralType})
        </label>
        <input
          type="number"
          step="0.001"
          min="0"
          placeholder="0.00"
          value={collateralAmount}
          onChange={(e) => setCollateralAmount(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          required
        />
        <p className="mt-1 text-xs text-gray-400">
          Estimated max mintable at 150% ratio: {estimatedMaxMint} SUSD
        </p>
      </div>

      {/* Mint amount */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          SUSD to Mint
        </label>
        <input
          type="number"
          step="1"
          min="0"
          placeholder="0"
          value={mintAmount}
          onChange={(e) => setMintAmount(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending || isConfirming}
        className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {isPending      ? "Confirm in wallet…" :
         isConfirming   ? "Confirming tx…"     :
                          "Deposit & Mint"}
      </button>

      {isSuccess && (
        <p className="text-center text-sm text-emerald-600">
          ✅ Transaction confirmed!{" "}
          <a
            href={`https://sepolia.etherscan.io/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View on Etherscan
          </a>
        </p>
      )}
    </form>
  );
}
