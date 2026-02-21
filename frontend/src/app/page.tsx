import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="text-center py-16 space-y-6">
        <h1 className="text-5xl font-extrabold text-gray-900 tracking-tight">
          StableArb
        </h1>
        <p className="mx-auto max-w-2xl text-xl text-gray-600">
          A next-generation stablecoin protocol where{" "}
          <span className="font-semibold text-indigo-600">Chainlink CRE</span>{" "}
          and{" "}
          <span className="font-semibold text-indigo-600">Data Streams</span>{" "}
          autonomously defend the SUSD $1.00 peg in real-time — across chains.
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/mint"
            className="rounded-xl bg-indigo-600 px-8 py-3 text-base font-semibold text-white hover:bg-indigo-700 transition-colors shadow-lg"
          >
            Mint SUSD
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border border-gray-300 bg-white px-8 py-3 text-base font-semibold text-gray-700 hover:border-indigo-400 transition-colors"
          >
            Live Dashboard
          </Link>
        </div>
      </section>

      {/* Feature cards */}
      <section>
        <h2 className="mb-8 text-center text-2xl font-bold text-gray-800">
          How it works
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="mb-3 text-3xl">{icon}</div>
              <h3 className="mb-2 font-semibold text-gray-800">{title}</h3>
              <p className="text-sm text-gray-500">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats strip */}
      <section className="rounded-2xl bg-indigo-600 p-8 text-white">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {stats.map(({ label, value }) => (
            <div key={label} className="text-center">
              <p className="text-3xl font-extrabold">{value}</p>
              <p className="mt-1 text-sm text-indigo-200">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Architecture overview */}
      <section className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h2 className="mb-4 text-xl font-bold text-gray-800">Architecture</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">On-chain (Solidity + Foundry)</h3>
            <ul className="space-y-1 text-sm text-gray-600 list-disc list-inside">
              <li><strong>SUSD</strong> — ERC-20 stablecoin, mintable by the Vault</li>
              <li><strong>StableArbVault</strong> — Collateral deposit &amp; SUSD minting (150% min ratio)</li>
              <li><strong>PegDefender</strong> — Chainlink Automation + Data Streams upkeep</li>
              <li><strong>CrossChainBuyback</strong> — CCIP receiver for cross-chain peg defense</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">Off-chain (CRE TypeScript Workflow)</h3>
            <ul className="space-y-1 text-sm text-gray-600 list-disc list-inside">
              <li>Cron trigger every 5 minutes</li>
              <li>Fetch SUSD/USD from Chainlink Data Streams</li>
              <li>Dispatch BUYBACK or MINT action when outside $0.995–$1.005</li>
              <li>Permanently record all peg incidents on-chain</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

const features = [
  {
    icon:  "🏦",
    title: "Deposit Collateral",
    body:  "Deposit ETH or WBTC as collateral with a minimum 150% collateral ratio.",
  },
  {
    icon:  "💵",
    title: "Mint SUSD",
    body:  "Mint SUSD stablecoin against your collateral at the $1.00 peg.",
  },
  {
    icon:  "⚡",
    title: "Automated Peg Defense",
    body:  "Chainlink CRE monitors the peg every 5 minutes and fires buybacks or mints automatically.",
  },
  {
    icon:  "🌉",
    title: "Cross-Chain via CCIP",
    body:  "Peg defense actions execute on the most liquid chain via Chainlink CCIP.",
  },
];

const stats = [
  { label: "Min Collateral Ratio", value: "150%"   },
  { label: "Peg Target",           value: "$1.00"  },
  { label: "Peg Defense Band",     value: "±0.5%"  },
  { label: "Monitor Interval",     value: "5 min"  },
];
