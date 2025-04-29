import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeftIcon,
  BoltIcon,
  CheckCircleIcon,
  ChartBarIcon,
  ArrowPathIcon,
  CurrencyDollarIcon,
  CodeBracketIcon,
  FilmIcon,
  StarIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  CommandLineIcon,
  ComputerDesktopIcon,
} from "@heroicons/react/24/outline";
import { BoltIcon as BoltSolidIcon } from "@heroicons/react/24/solid";

// Sample reviews data
const sampleReviews = [
  {
    id: 1,
    user: {
      name: "Jessica Williams",
      avatar: "https://randomuser.me/api/portraits/women/33.jpg",
    },
    rating: 4.5,
    date: "2 weeks ago",
    text: "This agent saved me so much time on my project. The integration was seamless and the results are impressive.",
  },
  {
    id: 2,
    user: {
      name: "Michael Rodriguez",
      avatar: "https://randomuser.me/api/portraits/men/54.jpg",
    },
    rating: 5,
    date: "1 month ago",
    text: "Perfect for our team's workflow. We've been able to automate pull request tracking and repository management with minimal setup.",
  },
];

// Rating component
const RatingStars = ({ rating }) => {
  return (
    <div className="flex items-center gap-1">
      <BoltSolidIcon className="h-3 w-3 text-[#00d992]" />
      <span className="text-xs text-gray-400">
        {rating.toFixed(1)}
        <span className="text-gray-500">/5</span>
      </span>
    </div>
  );
};

interface AgentDetailProps {
  onBack?: () => void;
}

export const AgentDetail = ({ onBack }: AgentDetailProps) => {
  // For this example, we'll use the GitHub Manager agent
  const selectedAgent = {
    id: 4,
    name: "LinkedIn User Analyzer",
    rating: 4.8,
    description: "Analyze LinkedIn profiles and extract professional insights.",
    longDescription:
      "LinkedIn User Analyzer extracts key insights from profiles including skills, experience, and network connections. Perfect for recruiters and sales professionals looking to understand candidates or leads quickly. Uses NLP to identify strengths and career patterns at a glance.",
    price: "2 credits per usage",
    usageStats: "6500 times used",
    lastUsed: "Just now",
    category: "Professional",
    tags: ["linkedin", "recruiting", "networking", "analytics"],
    creator: {
      name: "David Miller",
      avatar: "https://randomuser.me/api/portraits/men/45.jpg",
      verified: true,
    },
    capabilities: [
      "LinkedIn profile data extraction",
      "Professional skills analysis",
      "Career progression insights",
      "Network connection mapping",
      "Contact information retrieval",
      "Industry and company analytics",
    ],
    apiEndpoint: "/api/agents/linkedin-analyzer",
    demoVideoUrl: "https://example.com/videos/linkedin-analyzer-demo.mp4",
  };

  return (
    <div className="py-8">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 md:px-8">
        {/* Back button */}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-6 flex items-center text-gray-400 hover:text-[#00d992] transition-colors"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            <span>Back to Marketplace</span>
          </button>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          {/* Left column - Main info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header section */}
            <div
              className="border-solid border-[#1e293b]/40 rounded-lg p-6"
              style={{
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                backgroundColor: "rgba(58, 66, 89, 0.3)",
              }}
            >
              <div className="flex items-center mb-2 justify-between ">
                <span className="text-[#00d992] text-2xl font-bold ">
                  {selectedAgent.name}
                </span>
                <div className="flex justify-between items-center mt-2">
                  <div className="relative mr-2">
                    <img
                      src={selectedAgent.creator.avatar}
                      alt={`${selectedAgent.creator.name}'s avatar`}
                      className="w-6 h-6 rounded-full border-solid border-[#1e293b]"
                    />
                    {selectedAgent.creator.verified && (
                      <div className="absolute -top-1 -right-1 bg-[#00d992] rounded-full w-3 h-3 border-solid border-black flex items-center justify-center">
                        <svg
                          className="w-2 h-2 text-black"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="3"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                  <span className="text-sm text-gray-300">
                    <span className="text-gray-500">By</span>{" "}
                    <span className="font-medium">
                      {selectedAgent.creator.name}
                    </span>
                  </span>
                  <div className="ml-4 flex items-center">
                    <RatingStars rating={selectedAgent.rating} />
                  </div>
                </div>
              </div>

              <p className="text-gray-300 mb-6">
                {selectedAgent.longDescription}
              </p>

              {/* Try this agent section */}
              <div className="border-t border-[#1e293b] pt-6">
                <div className="text-emerald-400 text-md font-semibold mb-4 flex items-center">
                  Try This Agent
                </div>

                <div className="space-y-4">
                  {/* Command Line Option */}
                  <div>
                    <div className="flex items-center mb-2">
                      <CommandLineIcon className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                      <span className="text-sm text-emerald-400">
                        Run Locally
                      </span>
                    </div>
                    <code className="flex items-center bg-[#202222] p-4 text-xs sm:text-sm text-gray-200 font-mono whitespace-pre rounded-md overflow-x-auto">
                      <span>
                        npm create voltagent-app@latest -- --market
                        linkedin-analyzer
                      </span>
                    </code>
                  </div>

                  {/* Web UI Option */}
                  <div>
                    <div className="flex items-center mb-2">
                      <ComputerDesktopIcon className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                      <span className="text-sm text-emerald-400">Web UI</span>
                    </div>
                    <div className="bg-[#202222] p-4 rounded-md">
                      <div className="space-y-3">
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="LinkedIn profile URL"
                            className="w-full bg-[#202222] border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                            readOnly
                          />
                          <span className="absolute right-3 top-2 text-xs text-gray-500">
                            Demo only
                          </span>
                        </div>
                        <button
                          type="button"
                          className="w-full px-3 py-2 bg-emerald-500 text-black font-medium rounded-md text-sm disabled:opacity-50"
                          disabled
                        >
                          Analyze Profile
                        </button>
                        <div className="text-center text-xs text-gray-500 mt-2">
                          This is a preview. Each analysis costs 2 credits.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Capabilities section */}
            <div
              className="border-solid border-[#1e293b]/40 rounded-lg p-6"
              style={{
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                backgroundColor: "rgba(58, 66, 89, 0.3)",
              }}
            >
              <h2 className="text-gray-200 text-lg font-medium mb-4 flex items-center">
                <CheckCircleIcon className="h-5 w-5 text-[#00d992] mr-2" />
                Capabilities
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {selectedAgent.capabilities.map((capability) => (
                  <div key={capability} className="flex items-center">
                    <div className="mr-3 text-[#00d992]">
                      <CheckCircleIcon className="h-5 w-5" />
                    </div>
                    <span className="text-gray-300">{capability}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Demo video section */}
            <div
              className="border-solid border-[#1e293b]/40 rounded-lg p-6"
              style={{
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                backgroundColor: "rgba(58, 66, 89, 0.3)",
              }}
            >
              <h2 className="text-gray-200 text-lg font-medium mb-4 flex items-center">
                <FilmIcon className="h-5 w-5 text-[#00d992] mr-2" />
                Demo Video
              </h2>
              <div className="relative aspect-video bg-black/40 rounded-lg overflow-hidden flex items-center justify-center">
                <div className="text-gray-500">Demo video placeholder</div>
                {/* In a real implementation, you would embed a video here */}
                {/* <video src={selectedAgent.demoVideoUrl} controls className="w-full h-full"></video> */}
              </div>
            </div>

            {/* Integration guide */}
            <div
              className="border-solid border-[#1e293b]/40 rounded-lg p-6"
              style={{
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                backgroundColor: "rgba(58, 66, 89, 0.3)",
              }}
            >
              <h2 className="text-gray-200 text-lg font-medium mb-4 flex items-center">
                <CodeBracketIcon className="h-5 w-5 text-[#00d992] mr-2" />
                Integration Guide
              </h2>
              <div className="space-y-4">
                <p className="text-gray-300">
                  Integrate {selectedAgent.name} into your workflow by following
                  these steps:
                </p>
                <ol className="list-decimal list-inside space-y-2 text-gray-300 ml-2">
                  <li>
                    Generate an API key from the VoltAgent dashboard or use your
                    existing one
                  </li>
                  <li>Configure GitHub access permissions for the agent</li>
                  <li>
                    Set up webhooks for real-time notifications (optional)
                  </li>
                  <li>
                    Use the provided API endpoints to manage repositories and
                    PRs
                  </li>
                </ol>
                <div className="mt-4 pt-4 border-t border-[#1e293b]">
                  <h3 className="text-gray-200 font-medium mb-2">
                    API Endpoint
                  </h3>
                  <div className="bg-[#191a1a] p-3 rounded-md font-mono text-sm text-gray-300">
                    {selectedAgent.apiEndpoint}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right column - Stats, reviews, etc. */}
          <div className="space-y-6">
            {/* Combined Usage Stats and Pricing card */}
            <div
              className="border-solid border-[#1e293b]/40 rounded-lg p-6"
              style={{
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                backgroundColor: "rgba(58, 66, 89, 0.3)",
              }}
            >
              <h2 className="text-gray-200 text-lg font-medium mb-4 flex items-center">
                <ChartBarIcon className="h-5 w-5 text-[#00d992] mr-2" />
                Usage Statistics & Pricing
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]">
                  <span className="text-gray-400">Total usage</span>
                  <span className="text-gray-300">
                    {selectedAgent.usageStats}
                  </span>
                </div>
                <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]">
                  <span className="text-gray-400">Last used</span>
                  <span className="text-gray-300">
                    {selectedAgent.lastUsed}
                  </span>
                </div>
                <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]">
                  <span className="text-gray-400">Average rating</span>
                  <div className="flex items-center">
                    <BoltSolidIcon className="h-4 w-4 text-[#00d992] mr-1" />
                    <span className="text-gray-300">
                      {selectedAgent.rating}/5
                    </span>
                  </div>
                </div>
                <div className="flex justify-between pb-3 border-b border-[#1e293b]">
                  <span className="text-gray-400">Price</span>
                  <span className="text-gray-200 font-medium">
                    {selectedAgent.price}
                  </span>
                </div>
              </div>
            </div>

            {/* Reviews section */}
            <div
              className="border-solid border-[#1e293b]/40 rounded-lg p-6"
              style={{
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                backgroundColor: "rgba(58, 66, 89, 0.3)",
              }}
            >
              <div className="mb-4">
                <h2 className="text-gray-200 text-lg font-medium flex items-center">
                  <ChatBubbleLeftRightIcon className="h-5 w-5 text-[#00d992] mr-2" />
                  User Reviews
                </h2>
              </div>
              <div className="space-y-4">
                {sampleReviews.map((review) => (
                  <div
                    key={review.id}
                    className="pb-4 border-b border-[#1e293b] last:border-b-0 last:pb-0"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center">
                        <img
                          src={review.user.avatar}
                          alt={`${review.user.name}'s avatar`}
                          className="w-6 h-6 rounded-full border-solid border-[#1e293b] mr-2"
                        />
                        <span className="text-sm font-medium text-gray-300">
                          {review.user.name}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <BoltSolidIcon className="h-3 w-3 text-[#00d992] mr-1" />
                        <span className="text-xs text-gray-400">
                          {review.rating}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-400 mb-1">{review.text}</p>
                    <div className="text-xs text-gray-500">{review.date}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default AgentDetail;
