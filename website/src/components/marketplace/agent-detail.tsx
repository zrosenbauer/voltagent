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
      <span className="text-sm text-gray-400">
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
    <div className="py-8 ">
      <div className="mx-auto px-4 ">
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
              className="border-solid border-[#1e293b]/40 rounded-md p-6"
              style={{
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                backgroundColor: "rgba(58, 66, 89, 0.3)",
              }}
            >
              <div className="flex items-center mb-3 justify-between ">
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
                  <span className="text-sm text-[#dcdcdc]">
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

              <p className="text-[#dcdcdc] mb-6">
                {selectedAgent.longDescription}
              </p>

              {/* Try this agent section */}
              <div className="border-t border-[#1e293b] ">
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
                    <code className="flex items-center bg-black/20 border-[#1e293b] border-solid  p-4 text-sm sm:text-sm text-emerald-500 font-mono whitespace-pre rounded-md overflow-x-auto">
                      <span>
                        $ npx voltagent add davidmiller/linkedin-user-analyzer
                      </span>
                    </code>
                  </div>

                  {/* Web UI Option */}
                  <div>
                    <div className="flex items-center mb-2">
                      <ComputerDesktopIcon className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                      <span className="text-sm text-emerald-400">
                        Use directly in UI
                      </span>
                    </div>
                    <div className="bg-black/20 border-[#1e293b]  p-4 rounded-md">
                      <div className="space-y-3">
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="LinkedIn profile URL"
                            className="w-full bg-black/20 border-[#1e293b]  border outline-none border-gray-700 rounded-md px-3 py-2 text-sm text-[#dcdcdc] focus:outline-none ring-1 ring-emerald-500"
                            readOnly
                          />
                        </div>
                        <div className="flex items-center ">
                          <button
                            type="button"
                            className=" px-2 py-1  bg-emerald-400/10 text-emerald-400 border-solid border-emerald-400/20  font-medium rounded-md text-sm disabled:opacity-100"
                            disabled
                          >
                            Analyze Profile
                          </button>
                          <div className="text-center ml-2 text-sm text-gray-500 mt-2">
                            This is a preview. Each analysis costs 2 credits.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Demo video section */}
            <div
              className="border-solid border-[#1e293b]/40 rounded-md p-6"
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
              <div className="relative  bg-black/40 rounded-md overflow-hidden flex items-center justify-center">
                <img
                  src="https://cdn.voltagent.dev/readme/demo.gif"
                  alt="Demo video"
                  className="w-full h-full"
                />
              </div>
            </div>
          </div>

          {/* Right column - Stats, reviews, etc. */}
          <div className="space-y-6">
            {/* Combined Usage Stats and Pricing card */}
            <div
              className="border-solid border-[#1e293b]/40 rounded-md p-4"
              style={{
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                backgroundColor: "rgba(58, 66, 89, 0.3)",
              }}
            >
              <h2 className="text-gray-200 text-base font-medium mb-3 flex items-center">
                <ChartBarIcon className="h-4 w-4 text-[#00d992] mr-1.5" />
                Usage Statistics & Pricing
              </h2>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
                <span className="text-gray-400">Total usage</span>
                <span className="text-[#dcdcdc] text-right">
                  {selectedAgent.usageStats}
                </span>

                <span className="text-gray-400">Last used</span>
                <span className="text-[#dcdcdc] text-right">
                  {selectedAgent.lastUsed}
                </span>

                <span className="text-gray-400">Rating</span>
                <div className="flex items-center justify-end">
                  <BoltSolidIcon className="h-3 w-3 text-[#00d992] mr-1" />
                  <span className="text-[#dcdcdc]">
                    {selectedAgent.rating}/5
                  </span>
                </div>

                <span className="text-gray-400">Price</span>
                <span className="text-gray-200 font-medium text-right">
                  {selectedAgent.price}
                </span>
              </div>
            </div>

            {/* Capabilities section */}
            <div
              className="border-solid border-[#1e293b]/40 rounded-md p-4"
              style={{
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                backgroundColor: "rgba(58, 66, 89, 0.3)",
              }}
            >
              <h2 className="text-gray-200 text-base font-medium mb-2 flex items-center">
                <CheckCircleIcon className="h-4 w-4 text-[#00d992] mr-1.5" />
                Capabilities
              </h2>
              <div className="grid grid-cols-1 gap-1.5">
                {selectedAgent.capabilities.map((capability) => (
                  <div key={capability} className="flex items-center text-sm">
                    <div className="mr-1.5 text-[#00d992] flex-shrink-0">-</div>
                    <span className="text-[#dcdcdc]">{capability}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Reviews section */}
            <div
              className="border-solid border-[#1e293b]/40 rounded-md p-6"
              style={{
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                backgroundColor: "rgba(58, 66, 89, 0.3)",
              }}
            >
              <div className="mb-4">
                <h2 className="text-gray-200 text-base font-medium flex items-center">
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
                        <span className="text-sm font-medium text-[#dcdcdc]">
                          {review.user.name}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <BoltSolidIcon className="h-3 w-3 text-[#00d992] mr-1" />
                        <span className="text-sm text-gray-400">
                          {review.rating}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-400 mb-1">{review.text}</p>
                    <div className="text-sm text-gray-500">{review.date}</div>
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
