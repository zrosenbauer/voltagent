import { useState, useEffect, useRef, useCallback } from "react";
import { ClientTweetCard } from "../magicui/tweet-card-client";
import { DiscordMessage } from "./DiscordMessage";
import { ArticleCard } from "./ArticleCard";
import { LinkedInPost } from "./LinkedInPost";

// Add keyframes for the scrolling animations
const scrollAnimation = `
  @keyframes scrollLeft {
    0% {
      transform: translateX(0);
    }
    100% {
      transform: translateX(-50%);
    }
  }

  @keyframes scrollRight {
    0% {
      transform: translateX(-50%);
    }
    100% {
      transform: translateX(0);
    }
  }

  .scroll-left-animation {
    animation: scrollLeft 180s linear infinite;
  }

  .scroll-right-animation {
    animation: scrollRight 180s linear infinite;
  }

  .animation-paused {
    animation-play-state: paused;
  }

  @media (pointer: coarse) {
    .touch-device-scroll-left {
      animation: scrollLeft 180s linear infinite;
    }
    
    .touch-device-scroll-right {
      animation: scrollRight 180s linear infinite;
    }
  }
`;

const testimonialTweetIds = [
  "1930715579155202268",
  "1929706642851193172",
  "1927072927213596780",
  "1927054751666999592",
  "1924486274448306320",
  "1924303206794059823",
  "1924262217924653243",
  "1924058575485403362",
  "1923352273452671399",
  "1920502438215250259",
  "1916955895709503681",
  "1916757463426302247",
  "1915200495461028321",
  "1920502438215250259",
];

const linkedInPosts = [
  {
    id: "linkedin-1",
    profileImage:
      "https://cdn.voltagent.dev/website/testimonials/linkedin-user/luis-avi.jpeg",
    name: "Luis Aviles",
    title:
      "Senior Frontend Engineer | Full Stack | Angular | JavaScript | TypeScript",
    content:
      "I'm incredibly honored to be one of the top 10 contributors to the VoltAgent open-source AI agent framework! I've been contributing to this project for a few weeks now and it's been a fantastic experience. I'm a firm believer in the power of open-source to drive innovation, and this project is a perfect example of that.",
    url: "https://linkedin.com/in/luisaviles",
  },
  {
    id: "linkedin-2",
    profileImage:
      "https://cdn.voltagent.dev/website/testimonials/linkedin-user/emre.jpeg",
    name: "Emre Tezisci",
    title: "Product Marketer | Board Chair | Founder | Nonprofit Leader",
    content:
      "I built a 4-agent AI 'mini-team' to automate Reddit/HN research and draft content (and it kinda worked). This was not a production-ready tool. Just a scrappy experiment using: 🧠 VoltAgent (agent orchestration in TypeScript) 🔧 Composio (plug-and-play Reddit + Hacker News MCP tools) 💬 OpenAI GPT-4o (via Vercel AI SDK)",
    url: "https://linkedin.com/in/emretezisci",
  },
  {
    id: "linkedin-3",
    profileImage:
      "https://cdn.voltagent.dev/website/testimonials/linkedin-user/yusuf.jpeg",
    name: "Yusuf Eren",
    title:
      "Building AI Agents in TypeScript | LLMs | AWS | NestJS | MongoDB DBA | TypeScript",
    content:
      "Just made my first contribution to VoltAgent on GitHub! I added support for xsAI as a voice provider, making it easier to integrate voice features into AI agents. Big thanks to Omer Aplak for giving me this opportunity and trusting me to contribute.",
    url: "https://linkedin.com/in/yusuferene",
  },
  {
    id: "linkedin-4",
    profileImage:
      "https://cdn.voltagent.dev/website/testimonials/linkedin-user/zac-ros.jpeg",
    name: "Zac Rosenbauer",
    title: "Co-founder at Joggr | Using AI 🤖 to automate dev docs",
    content:
      "If you are building AI Agents or Agentic flows and your language of choice is TypeScript you 1000% need to checkout this framework 👇 VoltAgent - an open-source TypeScript framework for building and orchestrating AI agents with built-in visual observability and debugging capabilities. Backed by a solid team (Omer Aplak & Necati Ozmen) consisting of the former CTO/founder and head of growth at refine.dev.",
    url: "https://linkedin.com/in/zacrosenbauer",
  },
  {
    id: "linkedin-5",
    profileImage:
      "https://cdn.voltagent.dev/website/testimonials/linkedin-user/outshift.jpeg",
    name: "Outshift by Cisco",
    title: "60,028 followers",
    content:
      "See what Omer Aplak of VoltAgent and Tatyana Mamut, PhD of Wayfound say about joining AGNTCY Collective, the open source collective building the foundational technologies and standards for the Internet of Agents.",
    url: "https://linkedin.com/company/outshift",
  },
];

const discordMessages = [
  {
    username: "developer_alex",
    discriminator: "1234",
    message:
      "Just deployed my first AI agent with Voltagent! The TypeScript experience is incredible. Built a customer support bot in under 2 hours 🚀",
    timestamp: "Today at 2:30 PM",
  },
  {
    username: "sarah_codes",
    discriminator: "5678",
    message:
      "Finally, an AI framework that doesn't feel like fighting with black boxes. The full control over agent behavior is exactly what we needed for our enterprise solution.",
    timestamp: "Today at 1:15 PM",
  },
  {
    username: "mike_startup",
    discriminator: "9012",
    message:
      "Voltagent saved us weeks of development time. The documentation is top-notch and the community here is amazing! Thanks for building this 💚",
    timestamp: "Yesterday at 11:45 AM",
  },
  {
    username: "team_lead_jen",
    discriminator: "3456",
    message:
      "Our whole team switched to Voltagent after trying 5+ other frameworks. The DevEx is unmatched, and the agent orchestration features are game-changing.",
    timestamp: "Yesterday at 9:20 AM",
  },
];

const articles = [
  {
    title:
      "Building Enterprise AI Agents with TypeScript: A Deep Dive into Voltagent",
    coverImage:
      "https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=400&h=300&fit=crop",
    excerpt:
      "Exploring how Voltagent revolutionizes AI agent development with full TypeScript support and enterprise-grade features.",
    author: "Alex Johnson",
    publication: "TechCrunch",
    date: "Dec 15, 2024",
    readTime: "8 min read",
    url: "https://techcrunch.com/voltagent-ai-agents",
    type: "article" as const,
  },
  {
    title: "Voltagent Tutorial: Build Your First AI Agent in 10 Minutes",
    type: "youtube" as const,
    videoId: "dQw4w9WgXcQ",
    channel: "TechExplained",
    date: "Dec 14, 2024",
    views: "15K views",
    duration: "10:32",
    excerpt:
      "Step-by-step tutorial showing how to build and deploy your first AI agent using Voltagent framework.",
    url: "https://youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    title:
      "The Future of AI Development: Open Source Frameworks Leading the Way",
    coverImage:
      "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=400&h=300&fit=crop",
    excerpt:
      "How open source AI frameworks like Voltagent are democratizing access to advanced AI agent development tools.",
    author: "Sarah Chen",
    publication: "AI Weekly",
    date: "Dec 12, 2024",
    readTime: "6 min read",
    url: "https://aiweekly.co/voltagent-review",
    type: "article" as const,
  },
  {
    title: "Live: Building Multi-Agent Systems with Voltagent",
    type: "youtube" as const,
    videoId: "dQw4w9WgXcQ",
    channel: "DevStreams",
    date: "Dec 11, 2024",
    views: "8.2K views",
    duration: "45:18",
    excerpt:
      "Live coding session demonstrating how to build complex multi-agent systems using Voltagent's orchestration features.",
    url: "https://youtube.com/watch?v=dQw4w9WgXcQ",
  },
];

export function Testimonials() {
  // Animation control states for each row
  const [isTweetsRowPaused, setIsTweetsRowPaused] = useState(false);
  const [isDiscordRowPaused, setIsDiscordRowPaused] = useState(false);
  const [isArticlesRowPaused, setIsArticlesRowPaused] = useState(false);

  // Refs for each scrolling row
  const tweetsRowRef = useRef<HTMLDivElement>(null);
  const discordRowRef = useRef<HTMLDivElement>(null);
  const articlesRowRef = useRef<HTMLDivElement>(null);

  // Duplicate content for continuous scrolling - mix tweets and LinkedIn posts
  const duplicatedTweetIds = [...testimonialTweetIds, ...testimonialTweetIds];
  const duplicatedLinkedInPosts = [...linkedInPosts, ...linkedInPosts];
  const duplicatedDiscordMessages = [...discordMessages, ...discordMessages];
  const duplicatedArticles = [...articles, ...articles];

  // Event handlers for tweets row (scrolling left)
  const handleTweetsRowTouchStart = useCallback(
    () => setIsTweetsRowPaused(true),
    [],
  );
  const handleTweetsRowTouchEnd = useCallback(
    () => setIsTweetsRowPaused(false),
    [],
  );
  const handleTweetsRowMouseEnter = useCallback(
    () => setIsTweetsRowPaused(true),
    [],
  );
  const handleTweetsRowMouseLeave = useCallback(
    () => setIsTweetsRowPaused(false),
    [],
  );

  // Event handlers for discord row (scrolling right)
  const handleDiscordRowTouchStart = useCallback(
    () => setIsDiscordRowPaused(true),
    [],
  );
  const handleDiscordRowTouchEnd = useCallback(
    () => setIsDiscordRowPaused(false),
    [],
  );
  const handleDiscordRowMouseEnter = useCallback(
    () => setIsDiscordRowPaused(true),
    [],
  );
  const handleDiscordRowMouseLeave = useCallback(
    () => setIsDiscordRowPaused(false),
    [],
  );

  // Event handlers for articles row (scrolling left)
  const handleArticlesRowTouchStart = useCallback(
    () => setIsArticlesRowPaused(true),
    [],
  );
  const handleArticlesRowTouchEnd = useCallback(
    () => setIsArticlesRowPaused(false),
    [],
  );
  const handleArticlesRowMouseEnter = useCallback(
    () => setIsArticlesRowPaused(true),
    [],
  );
  const handleArticlesRowMouseLeave = useCallback(
    () => setIsArticlesRowPaused(false),
    [],
  );

  // Add touch event listeners
  useEffect(() => {
    // Tweets row listeners
    const tweetsElement = tweetsRowRef.current;
    if (tweetsElement) {
      tweetsElement.addEventListener("touchstart", handleTweetsRowTouchStart, {
        passive: true,
      });
      tweetsElement.addEventListener("touchend", handleTweetsRowTouchEnd, {
        passive: true,
      });
    }

    // Discord row listeners
    const discordElement = discordRowRef.current;
    if (discordElement) {
      discordElement.addEventListener(
        "touchstart",
        handleDiscordRowTouchStart,
        { passive: true },
      );
      discordElement.addEventListener("touchend", handleDiscordRowTouchEnd, {
        passive: true,
      });
    }

    // Articles row listeners
    const articlesElement = articlesRowRef.current;
    if (articlesElement) {
      articlesElement.addEventListener(
        "touchstart",
        handleArticlesRowTouchStart,
        {
          passive: true,
        },
      );
      articlesElement.addEventListener("touchend", handleArticlesRowTouchEnd, {
        passive: true,
      });
    }

    return () => {
      // Clean up tweets row listeners
      if (tweetsElement) {
        tweetsElement.removeEventListener(
          "touchstart",
          handleTweetsRowTouchStart,
        );
        tweetsElement.removeEventListener("touchend", handleTweetsRowTouchEnd);
      }

      // Clean up discord row listeners
      if (discordElement) {
        discordElement.removeEventListener(
          "touchstart",
          handleDiscordRowTouchStart,
        );
        discordElement.removeEventListener(
          "touchend",
          handleDiscordRowTouchEnd,
        );
      }

      // Clean up articles row listeners
      if (articlesElement) {
        articlesElement.removeEventListener(
          "touchstart",
          handleArticlesRowTouchStart,
        );
        articlesElement.removeEventListener(
          "touchend",
          handleArticlesRowTouchEnd,
        );
      }
    };
  }, [
    handleTweetsRowTouchStart,
    handleTweetsRowTouchEnd,
    handleDiscordRowTouchStart,
    handleDiscordRowTouchEnd,
    handleArticlesRowTouchStart,
    handleArticlesRowTouchEnd,
  ]);

  return (
    <div className="relative max-w-9xl xs:px-4 lg:px-8 mx-auto landing-xs:mb-16 landing-md:mb-36">
      <style>{scrollAnimation}</style>

      {/* Tweets Row - Scrolling Left */}
      <div className="relative mb-8">
        <div
          ref={tweetsRowRef}
          className="flex overflow-hidden"
          style={{
            maxWidth: "100%",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
            WebkitMaskImage:
              "linear-gradient(90deg, transparent 0%, black 5%, black 95%, transparent 100%)",
            maskImage:
              "linear-gradient(90deg, transparent 0%, black 5%, black 95%, transparent 100%)",
          }}
          onMouseEnter={handleTweetsRowMouseEnter}
          onMouseLeave={handleTweetsRowMouseLeave}
        >
          <div
            className={`flex space-x-6 py-4 scroll-left-animation ${
              isTweetsRowPaused ? "animation-paused" : ""
            }`}
          >
            {/* Mix tweets and LinkedIn posts */}
            {duplicatedTweetIds.map((tweetId, index) => (
              <div
                key={`tweet-${tweetId}-${Math.floor(
                  index / testimonialTweetIds.length,
                )}`}
                className="flex-shrink-0 w-80"
              >
                <ClientTweetCard id={tweetId} />
              </div>
            ))}
            {duplicatedLinkedInPosts.map((post, index) => (
              <div
                key={`linkedin-${post.id}-${Math.floor(
                  index / linkedInPosts.length,
                )}`}
                className="flex-shrink-0 w-80"
              >
                <LinkedInPost
                  profileImage={post.profileImage}
                  name={post.name}
                  title={post.title}
                  content={post.content}
                  url={post.url}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Discord Messages Row - Scrolling Right */}
      <div className="relative mb-8">
        <div
          ref={discordRowRef}
          className="flex overflow-hidden"
          style={{
            maxWidth: "100%",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
            WebkitMaskImage:
              "linear-gradient(90deg, transparent 0%, black 5%, black 95%, transparent 100%)",
            maskImage:
              "linear-gradient(90deg, transparent 0%, black 5%, black 95%, transparent 100%)",
          }}
          onMouseEnter={handleDiscordRowMouseEnter}
          onMouseLeave={handleDiscordRowMouseLeave}
        >
          <div
            className={`flex space-x-6 py-4 scroll-right-animation ${
              isDiscordRowPaused ? "animation-paused" : ""
            }`}
          >
            {duplicatedDiscordMessages.map((message, index) => (
              <div
                key={`discord-${message.username}-${
                  message.discriminator
                }-${Math.floor(index / discordMessages.length)}`}
                className="flex-shrink-0 w-80"
              >
                <DiscordMessage
                  username={message.username}
                  discriminator={message.discriminator}
                  message={message.message}
                  timestamp={message.timestamp}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Articles Section */}
      <div className="mt-8">
        {/* Articles Row - Scrolling Left */}
        <div className="relative">
          <div
            ref={articlesRowRef}
            className="flex overflow-hidden"
            style={{
              maxWidth: "100%",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              WebkitOverflowScrolling: "touch",
              WebkitMaskImage:
                "linear-gradient(90deg, transparent 0%, black 5%, black 95%, transparent 100%)",
              maskImage:
                "linear-gradient(90deg, transparent 0%, black 5%, black 95%, transparent 100%)",
            }}
            onMouseEnter={handleArticlesRowMouseEnter}
            onMouseLeave={handleArticlesRowMouseLeave}
          >
            <div
              className={`flex space-x-6 py-4 scroll-left-animation ${
                isArticlesRowPaused ? "animation-paused" : ""
              }`}
            >
              {duplicatedArticles.map((article, index) => (
                <div
                  key={`article-${article.title
                    .replace(/\s+/g, "-")
                    .toLowerCase()}-${Math.floor(index / articles.length)}`}
                  className="flex-shrink-0 w-80"
                >
                  <ArticleCard
                    title={article.title}
                    coverImage={article.coverImage}
                    excerpt={article.excerpt}
                    author={article.author}
                    publication={article.publication}
                    date={article.date}
                    readTime={article.readTime}
                    url={article.url}
                    type={article.type}
                    videoId={article.videoId}
                    channel={article.channel}
                    views={article.views}
                    duration={article.duration}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
