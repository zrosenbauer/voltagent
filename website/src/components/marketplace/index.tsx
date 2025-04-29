import React, { useState } from "react";
import { motion } from "framer-motion";
import Link from "@docusaurus/Link";
import AgentList from "./agent-list";
import AgentDetail from "./agent-detail";

// Sample agent data for the first selection
const firstAgent = {
  id: 4,
  name: "GitHub Manager",
  rating: 4.8,
  description: "Manage repositories and track pull requests.",
  longDescription:
    "GitHub Manager is a comprehensive solution for developers and teams who need to efficiently manage their GitHub repositories. It provides automated tracking of pull requests, issue monitoring, and repository analytics, all in a single intuitive interface. The agent connects directly to the GitHub API, ensuring real-time updates and accurate data.",
  price: "$39/month",
  usageStats: "42,103 code blocks generated",
  lastUsed: "Just now",
  category: "Development",
  tags: ["github", "git", "version control"],
  creator: {
    name: "David Miller",
    avatar: "https://randomuser.me/api/portraits/men/45.jpg",
    verified: true,
  },
  capabilities: [
    "Automated PR tracking and notifications",
    "Repository analytics and insights",
    "Issue management and prioritization",
    "Code review assistance and suggestions",
    "Integration with CI/CD pipelines",
    "Custom workflow automation",
  ],
  apiEndpoint: "/api/agents/github-manager",
  demoVideoUrl: "https://example.com/videos/github-manager-demo.mp4",
};

export const Marketplace = () => {
  const [selectedAgent, setSelectedAgent] = useState(firstAgent);

  const handleSelectAgent = (agent) => {
    setSelectedAgent(agent);
  };

  return (
    <section className="relative py-20">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8">
        {/*      <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <h2 className="text-4xl font-bold mb-6 text-gray-300">
              AI Agent Marketplace
              <span className="inline-block ml-3 px-3 py-1 text-sm bg-[#f59e0b]/10 text-[#f59e0b] rounded-full border border-[#f59e0b]/30">
                Coming Soon
              </span>
            </h2>
            <p className="text-xl mb-8 text-gray-400">
              We're building a community-driven marketplace for AI agents to foster innovation and
              collaboration.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-12 bg-black/20 p-8 rounded-xl border border-[#1e293b]/40 backdrop-filter backdrop-blur-sm"
          >
            <h3 className="text-2xl font-bold mb-4 text-[#00d992]">Our Vision</h3>
            <p className="mb-4 text-gray-300">
              The VoltAgent Marketplace aims to be a hub where developers can share, discover, and
              collaborate on specialized AI agents. We believe that a diverse ecosystem of
              purpose-built agents will accelerate innovation and solve real-world problems more
              effectively.
            </p>
            <p className="mb-4 text-gray-300">
              By creating a community-driven marketplace, we want to:
            </p>
            <ul className="list-disc pl-6 mb-6 space-y-2 text-gray-400">
              <li>Enable developers to monetize their custom agents</li>
              <li>Provide users with access to specialized AI solutions</li>
              <li>Foster collaboration between AI researchers and practitioners</li>
              <li>Accelerate innovation in practical AI applications</li>
            </ul>
          </motion.div>
        </div> */}

        {/* Preview of the Agent Marketplace UI */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mb-16"
        >
          <h3 className="text-2xl font-bold mb-6 text-[#00d992] text-center">
            Preview Our Marketplace
          </h3>
          <div className="bg-black/30 p-4 rounded-xl border border-[#1e293b]/40 backdrop-filter backdrop-blur-sm">
            {/*  <div className="mb-8">
              <AgentList onSelectAgent={handleSelectAgent} />
            </div> */}
            <div>
              <AgentDetail agent={selectedAgent} />
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
