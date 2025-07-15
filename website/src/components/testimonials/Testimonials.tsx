import { useState, useEffect, useRef, useCallback } from "react";
import { ClientTweetCard } from "../magicui/tweet-card-client";
import { DiscordMessage } from "./DiscordMessage";
import { ArticleCard } from "./ArticleCard";

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
  "1942395205011005544",
  "1927054751666999592",
  "1924374970555109607",
  "1925149528489120199",
  "1925350136944939321",
  "1926170638110044404",
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
  const [isVisible, setIsVisible] = useState(false);

  // Animation control states for each row
  const [isTweetsRowPaused, setIsTweetsRowPaused] = useState(false);
  const [isDiscordRowPaused, setIsDiscordRowPaused] = useState(false);
  const [isArticlesRowPaused, setIsArticlesRowPaused] = useState(false);

  // Refs for each scrolling row
  const tweetsRowRef = useRef<HTMLDivElement>(null);
  const discordRowRef = useRef<HTMLDivElement>(null);
  const articlesRowRef = useRef<HTMLDivElement>(null);

  // Duplicate content for continuous scrolling
  const duplicatedTweetIds = [...testimonialTweetIds, ...testimonialTweetIds];
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

  useEffect(() => {
    setIsVisible(true);
  }, []);

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
