import React from "react";
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
    text: "This agent saved me so much time on my project. The integration was seamless and the results are impressive. Highly recommend for any project requiring GitHub management.",
  },
  {
    id: 2,
    user: {
      name: "Michael Rodriguez",
      avatar: "https://randomuser.me/api/portraits/men/54.jpg",
    },
    rating: 5,
    date: "1 month ago",
    text: "Perfect for our team's workflow. We've been able to automate pull request tracking and repository management with minimal setup. Worth every credit.",
  },
  {
    id: 3,
    user: {
      name: "Emma Chen",
      avatar: "https://randomuser.me/api/portraits/women/12.jpg",
    },
    rating: 4,
    date: "3 months ago",
    text: "Great functionality but took some time to configure properly. Once set up though, it's been running smoothly. The support team was very helpful when I had questions.",
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
  agent: any; // For demo purposes, we'll use any type
  onBack?: () => void;
}

export const AgentDetail = ({ agent, onBack }: AgentDetailProps) => {
  // For this example, we'll use the GitHub Manager agent
  const selectedAgent = {
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
            <div className="bg-black/20 border-solid border-[#1e293b]/40 rounded-lg p-6 backdrop-filter backdrop-blur-sm">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center">
                    <h1 className="text-[#00d992] text-2xl font-bold mr-3">
                      {selectedAgent.name}
                    </h1>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-[#1e293b] text-gray-300">
                      {selectedAgent.category}
                    </span>
                  </div>
                  <div className="flex items-center mt-2">
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
              </div>

              <p className="text-gray-300 mb-6">
                {selectedAgent.longDescription}
              </p>
            </div>

            {/* Capabilities section */}
            <div className="bg-black/20 border-solid border-[#1e293b]/40 rounded-lg p-6 backdrop-filter backdrop-blur-sm">
              <h2 className="text-gray-200 text-lg font-medium mb-4 flex items-center">
                <CheckCircleIcon className="h-5 w-5 text-[#00d992] mr-2" />
                Capabilities
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedAgent.capabilities.map((capability, idx) => (
                  <div key={idx} className="flex items-start">
                    <div className="rounded-full bg-emerald-400/10 p-1 mr-3 mt-0.5">
                      <CheckCircleIcon className="h-4 w-4 text-emerald-400" />
                    </div>
                    <span className="text-gray-300">{capability}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Demo video section */}
            <div className="bg-black/20 border-solid border-[#1e293b]/40 rounded-lg p-6 backdrop-filter backdrop-blur-sm">
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
            <div className="bg-black/20 border-solid border-[#1e293b]/40 rounded-lg p-6 backdrop-filter backdrop-blur-sm">
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
                  <div className="bg-black/30 p-3 rounded-md font-mono text-sm text-gray-300">
                    {selectedAgent.apiEndpoint}
                  </div>
                  <button
                    type="button"
                    className="mt-2 flex items-center text-[#00d992] hover:underline"
                  >
                    <DocumentTextIcon className="h-4 w-4 mr-1" />
                    View full API documentation
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right column - Stats, reviews, etc. */}
          <div className="space-y-6">
            {/* Combined Usage Stats and Pricing card */}
            <div className="bg-black/20 border-solid border-[#1e293b]/40 rounded-lg p-6 backdrop-filter backdrop-blur-sm">
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
                    <BoltSolidIcon className="h-4 w-4 text-yellow-400 mr-1" />
                    <span className="text-gray-300">
                      {selectedAgent.rating}/5
                    </span>
                  </div>
                </div>
                <div className="flex justify-between pb-3 border-b border-[#1e293b]">
                  <span className="text-gray-400">Monthly subscription</span>
                  <span className="text-gray-200 font-medium">$39/month</span>
                </div>
                <div className="flex items-start justify-between">
                  <span className="text-gray-400">Enterprise plan</span>
                  <div className="text-right">
                    <span className="text-gray-200 font-medium">
                      Custom pricing
                    </span>
                    <div className="text-sm text-gray-400">
                      Contact sales for details
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="mt-4 w-full px-4 py-2 bg-emerald-400/10 text-emerald-400 border-solid border-emerald-400/20 rounded transition-colors hover:bg-emerald-400/20"
              >
                Try Now
              </button>
            </div>

            {/* Reviews section */}
            <div className="bg-black/20 border-solid border-[#1e293b]/40 rounded-lg p-6 backdrop-filter backdrop-blur-sm">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-gray-200 text-lg font-medium flex items-center">
                  <ChatBubbleLeftRightIcon className="h-5 w-5 text-[#00d992] mr-2" />
                  User Reviews
                </h2>
                <button
                  type="button"
                  className="text-sm text-[#00d992] hover:underline"
                >
                  Write a review
                </button>
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
                        <BoltSolidIcon className="h-3 w-3 text-yellow-400 mr-1" />
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
              <button
                type="button"
                className="mt-4 text-sm text-gray-400 hover:text-gray-300 w-full text-center"
              >
                View all reviews
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default AgentDetail;
