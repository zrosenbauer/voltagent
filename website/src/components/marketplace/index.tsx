import React, { useState } from "react";
import { motion } from "framer-motion";
import Link from "@docusaurus/Link";
import AgentList from "./agent-list";
import AgentDetail from "./agent-detail";
import { BoltIcon, SparklesIcon } from "@heroicons/react/24/solid";
import {
  MagnifyingGlassIcon,
  AdjustmentsHorizontalIcon,
  TagIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  FunnelIcon,
  ArrowPathIcon,
  BoltIcon as BoltOutlineIcon,
  PlusCircleIcon,
} from "@heroicons/react/24/outline";

export const Marketplace = () => {
  return (
    <section className="relative py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <div className="text-center mb-8">
          <div className="flex items-baseline justify-center">
            <div className="flex mr-2 items-center border-2 border-solid border-[#00d992] rounded-full p-1">
              <BoltIcon className="w-6 h-6 text-[#00d992]" />
            </div>
            <span className="text-4xl font-bold text-[#00d992]">voltagent</span>
            <span className="ml-2 text-2xl font-medium text-gray-400">
              Marketplace
            </span>
          </div>
          <p className="mt-2 text-center text-gray-400 text-sm">
            Share & Rent your VoltAgent-based AI Agents
          </p>
        </div>
        <div className="max-w-7xl mx-auto mb-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <p className="text-lg  text-gray-400">
              The VoltAgent Marketplace is on its way, and we need your
              feedback!
            </p>
            <p className="text-lg  text-gray-400">
              Tell us how we can make it the useful hub for sharing,
              discovering, and monetizing on VoltAgent-based AI agents.
            </p>
          </motion.div>
        </div>

        {/* Preview of the Agent Marketplace UI */}
        <div className="flex justify-center ">
          <div className="inline-flex items-center rounded-md gap-2 rounded-b-none  px-3 py-3 bg-slate-400/10  border-b-0 border-solid border border-slate-400/20 shadow-md">
            <PlusCircleIcon
              className="w-5 h-5 text-emerald-400"
              aria-hidden="true"
            />
            <span className="text-emerald-400 font-medium uppercase text-base tracking-wider mr-2">
              IDEA
            </span>
            <span className="text-gray-200 text-base">
              Imagine developers building AI agents that has real use cases and
              listing them on the marketplace.
            </span>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mb-16  "
        >
          {/* First Preview Container - AgentList */}
          {/* IDEA section */}

          <div className="p-4 mb-24 rounded-md border border-solid border-white/10 backdrop-filter backdrop-blur-sm relative">
            <div className="absolute inset-0 bg-gradient-to-r from-[#00d992]/10 to-purple-500/10 rounded-md opacity-30 animate-pulse pointer-events-none" />
            <div className="absolute top-0 left-0 bg-[#00d992] text-black text-xs py-1 px-3 rounded-tl-md font-medium">
              PREVIEW
            </div>

            <div className="relative">
              <AgentList />
            </div>
          </div>

          {/* Second Preview Container - AgentDetail */}
          {/* INTEGRATION section */}
          <div className="flex justify-center  mt-4">
            <div className="inline-flex items-center rounded-md gap-2 rounded-b-none  px-3 py-3 bg-slate-400/10  border-b-0 border-solid border border-slate-400/20 shadow-md">
              <PlusCircleIcon
                className="w-5 h-5 text-emerald-400"
                aria-hidden="true"
              />
              <span className="text-emerald-400 font-medium uppercase text-base tracking-wider mr-2">
                IDEA
              </span>
              <span className="text-gray-200 text-base">
                Imagine, agents can be integrated to existing code bases with a
                command or directly run on web.
              </span>
            </div>
          </div>

          <div className="p-4 mb-24 rounded-md border border-solid border-white/10 backdrop-filter backdrop-blur-sm relative">
            <div className="absolute inset-0 bg-gradient-to-r from-[#00d992]/10 to-purple-500/10 rounded-md opacity-30 animate-pulse pointer-events-none" />
            <div className="absolute top-0 left-0 bg-[#00d992] text-black text-xs py-1 px-3 rounded-tl-md font-medium">
              PREVIEW
            </div>

            <div className="relative">
              <AgentDetail />
            </div>
          </div>
        </motion.div>

        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mb-12"
          >
            <h3 className="text-2xl font-bold mb-4 text-[#00d992]">
              Help Shape the Future
            </h3>
            <p className="mb-6 text-gray-300">
              We believe the most powerful tools are built with input from the
              people who will use them. That's why we're inviting the VoltAgent
              community to share ideas and feedback on our marketplace before we
              launch.
            </p>
            <div className="flex justify-center">
              <Link
                to="https://github.com/voltagent/voltagent/issues/new?template=marketplace_feedback.md&title=[Marketplace Feedback]"
                className="inline-flex items-center justify-center rounded-md bg-[#00d992] text-gray-900 font-medium px-6 py-3 text-sm transition-colors hover:bg-[#00d992]/90 shadow-md"
                target="_blank"
                rel="noopener noreferrer"
              >
                Share Your Ideas on GitHub
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="ml-2 h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="bg-black/20 p-8 rounded-xl border-solid border-[#1e293b]/40 backdrop-filter backdrop-blur-sm"
          >
            <h3 className="text-2xl font-bold mb-4 text-[#00d992]">
              Features We're Exploring
            </h3>
            <ul className="list-disc pl-6 space-y-3 text-gray-400">
              <li>Custom agent submission and review process</li>
              <li>Standardized testing and performance metrics</li>
              <li>Rating and feedback system</li>
              <li>Integration with VoltAgent's core platform</li>
              <li>Monetization options for developers</li>
              <li>Enterprise solutions and custom deployments</li>
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Marketplace;
