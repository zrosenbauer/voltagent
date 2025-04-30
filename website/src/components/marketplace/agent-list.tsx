import React, { useState } from "react";
import { motion } from "framer-motion";
import { BoltIcon } from "@heroicons/react/24/solid";
import {
  MagnifyingGlassIcon,
  AdjustmentsHorizontalIcon,
  TagIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  FunnelIcon,
  ArrowPathIcon,
  BoltIcon as BoltOutlineIcon,
} from "@heroicons/react/24/outline";

// Sample agent data
const dummyAgents = [
  {
    id: 1,
    name: "Customer Support Bot",
    rating: 4.5,
    description: "Automate customer inquiries with natural language.",
    price: "5 credits per conversation",
    usageStats: "28,452 tasks completed",
    lastUsed: "3 days ago",
    category: "Support",
    tags: ["chatbot", "customer service", "automation"],
    creator: {
      name: "Sarah Johnson",
      avatar: "https://randomuser.me/api/portraits/women/44.jpg",
      verified: true,
    },
  },
  {
    id: 2,
    name: "Data Analyzer",
    rating: 5,
    description: "Process complex datasets with advanced analytics.",
    price: "$49/month",
    usageStats: "15,789 analyses run",
    lastUsed: "1 day ago",
    category: "Analytics",
    tags: ["data", "analytics", "visualization"],
    creator: {
      name: "Alex Chen",
      avatar: "https://randomuser.me/api/portraits/men/32.jpg",
      verified: true,
    },
  },
  {
    id: 3,
    name: "Content Writer",
    rating: 4.2,
    description: "Generate high-quality content for your brand.",
    price: "10 credits per article",
    usageStats: "7,892 documents created",
    lastUsed: "5 days ago",
    category: "Content",
    tags: ["writing", "content", "SEO"],
    creator: {
      name: "Maya Patel",
      avatar: "https://randomuser.me/api/portraits/women/62.jpg",
      verified: false,
    },
  },
  {
    id: 4,
    name: "GitHub Manager",
    rating: 4.8,
    description: "Manage repositories and track pull requests.",
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
  },
  {
    id: 5,
    name: "Meeting Scheduler",
    rating: 4.1,
    description: "Schedule meetings and send automatic reminders.",
    price: "Free",
    usageStats: "12,567 meetings scheduled",
    lastUsed: "2 days ago",
    category: "Productivity",
    tags: ["calendar", "scheduling", "reminders"],
    creator: {
      name: "TechFlow Inc.",
      avatar: "https://ui-avatars.com/api/?name=TF&background=0D8ABC&color=fff",
      verified: true,
    },
  },
  {
    id: 6,
    name: "Social Media Manager",
    rating: 4.6,
    description: "Schedule posts across multiple platforms.",
    price: "2 credits per post",
    usageStats: "31,845 posts published",
    lastUsed: "6 hours ago",
    category: "Marketing",
    tags: ["social media", "marketing", "analytics"],
    creator: {
      name: "Jasmine Torres",
      avatar: "https://randomuser.me/api/portraits/women/22.jpg",
      verified: false,
    },
  },
];

/* 
// Categories for future implementation 
const categories = [
  "All",
  "Support",
  "Analytics",
  "Content",
  "Development",
  "Productivity",
  "Marketing",
];

// Price ranges for future implementation
const priceRanges = ["All", "Free", "Dollar-based", "Credit-based", "Low cost", "Premium"];
*/

// Rating component
const RatingStars = ({ rating }) => {
  return (
    <div className="flex items-center gap-1">
      <BoltIcon className="h-3 w-3 text-[#00d992]" />
      <span className="text-xs text-gray-400">
        {rating.toFixed(1)}
        <span className="text-gray-500">/5</span>
      </span>
    </div>
  );
};

// Agent Card Component
const AgentCard = ({ agent, onSelectAgent = () => {} }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="border-solid border-[#1e293b]/40 rounded-lg overflow-hidden hover:border-[#00d992]/40 transition-all duration-300 h-full cursor-pointer"
      style={{
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        backgroundColor: "rgba(58, 66, 89, 0.3)",
      }}
      // @ts-ignore - We're providing a default value
      onClick={() => onSelectAgent(agent)}
    >
      <div className="p-4 flex flex-col h-full">
        {/* Header with category badge */}
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-[#00d992] font-bold text-lg truncate">
            {agent.name}
          </h3>
          <span className="px-2 py-0.5 text-xs rounded-full bg-[#1e293b] text-gray-300">
            {agent.category}
          </span>
        </div>

        {/* Creator Info and avatar in one row */}
        <div className="mb-3 flex items-center">
          <div className="relative mr-2">
            <img
              src={agent.creator.avatar}
              alt={`${agent.creator.name}'s avatar`}
              className="w-6 h-6 rounded-full border-solid border-[#1e293b]"
            />
            {agent.creator.verified && (
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
          <span className="text-xs text-gray-300">
            <span className="text-gray-500">By</span>{" "}
            <span className="font-medium">{agent.creator.name}</span>
          </span>
          <div className="flex items-center ml-2">
            <RatingStars rating={agent.rating} />
          </div>
        </div>

        {/* Description - reduced margin */}
        <p className="text-gray-400 text-sm mb-3">{agent.description}</p>

        {/* Price and Try Now in same row */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center">
            <CurrencyDollarIcon className="h-4 w-4 text-[#00d992] mr-1" />
            <span className="text-gray-300 font-medium">{agent.price}</span>
          </div>
          <div className="px-3 py-1.5 bg-emerald-400/10 text-emerald-400 border-solid border-emerald-400/20 text-sm rounded transition-colors cursor-pointer text-center">
            Try Now
          </div>
        </div>

        {/* Stats in a more compact layout */}
        <div className="flex justify-between text-xs text-gray-400">
          <div className="flex items-center">
            <ChartBarIcon className="h-3 w-3 mr-1 text-gray-500" />
            <span>{agent.usageStats}</span>
          </div>
          <div className="flex items-center">
            <ArrowPathIcon className="h-3 w-3 mr-1 text-gray-500" />
            <span>Last used {agent.lastUsed}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export const AgentList = () => {
  // Remove filter states, only keep search
  const [searchTerm, setSearchTerm] = useState("");

  // Simplified filtering based only on search term
  const filteredAgents = dummyAgents.filter((agent) => {
    // Search term filter
    if (
      searchTerm &&
      !agent.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !agent.description.toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="py-8 px-3">
      <div className="flex flex-col gap-6">
        {/* Agent cards grid */}
        <div className="flex-1">
          {filteredAgents.length === 0 ? (
            <div
              className="text-center py-10 border-solid border-[#1e293b]/40 rounded-lg"
              style={{
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                backgroundColor: "rgba(58, 66, 89, 0.3)",
              }}
            >
              <p className="text-gray-400">
                No agents found matching your search.
              </p>
              <button
                onClick={() => setSearchTerm("")}
                type="button"
                className="mt-4 px-4 py-2 text-sm text-[#00d992] hover:underline cursor-pointer inline-block"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 relative">
              {filteredAgents.map((agent, index) => (
                <div
                  key={agent.id}
                  /* style={index >= 3 ? { filter: "blur(3px)" } : {}} */
                  className="relative"
                >
                  <AgentCard agent={agent} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentList;
