"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const links = [
  { href: "/",          label: "Home"       },
  { href: "/mint",      label: "Mint SUSD"  },
  { href: "/dashboard", label: "Dashboard"  },
  { href: "/incidents", label: "Incidents"  },
];

export default function Nav() {
  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        {/* Logo */}
        <Link href="/" className="text-xl font-bold text-indigo-600">
          StableArb
        </Link>

        {/* Links */}
        <ul className="hidden gap-6 sm:flex">
          {links.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Wallet */}
        <ConnectButton />
      </div>
    </nav>
  );
}
