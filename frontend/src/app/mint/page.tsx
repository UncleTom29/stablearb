import MintForm from "@/components/MintForm";
import CollateralRatioBar from "@/components/CollateralRatioBar";

export const metadata = { title: "Mint SUSD — StableArb" };

export default function MintPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Mint SUSD</h1>
        <p className="mt-1 text-sm text-gray-500">
          Deposit ETH or WBTC as collateral and mint SUSD against it.
          A minimum collateral ratio of 150% is required.
        </p>
      </div>

      <MintForm />

      {/* Informational — ratio bar defaults without wallet */}
      <CollateralRatioBar />

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>⚠️ Testnet only.</strong> All contracts are deployed on Ethereum Sepolia
        and Arbitrum Sepolia. Do not use real assets.
      </div>
    </div>
  );
}
