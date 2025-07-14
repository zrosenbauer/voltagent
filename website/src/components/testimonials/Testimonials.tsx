import { useState, useEffect } from "react";
import { ClientTweetCard } from "../magicui/tweet-card-client";
import { DiscordMessage } from "./DiscordMessage";
import { ArticleCard } from "./ArticleCard";

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

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div className="relative max-w-7xl xs:px-4 lg:px-8 mx-auto landing-xs:mb-16 landing-md:mb-36">
      {/* Section Header */}
      <div className="text-center mb-16">
        <h2
          className={`text-3xl md:text-4xl font-bold text-white mb-4 transition-all duration-1000 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          What People Are Saying
        </h2>
        <p
          className={`text-lg text-gray-400 max-w-2xl mx-auto transition-all duration-1000 delay-300 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          See how developers and companies are using Voltagent to build powerful
          AI agents
        </p>
      </div>

      {/* Tweets Grid */}
      <div
        className={`grid md:grid-cols-3 gap-8 max-w-7xl mx-auto transition-all duration-1000 delay-500 ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        {testimonialTweetIds.map((tweetId, index) => (
          <div
            key={tweetId}
            className={`transition-all duration-1000 ${
              isVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4"
            }`}
            style={{ transitionDelay: `${700 + index * 200}ms` }}
          >
            <ClientTweetCard id={tweetId} />
          </div>
        ))}
      </div>

      {/* Discord Messages Section */}
      <div className="mt-24">
        {/* Discord Messages Grid */}
        <div
          className={`grid md:grid-cols-3 gap-8 max-w-7xl mx-auto transition-all duration-1000 delay-500 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          {discordMessages.map((message, index) => (
            <div
              key={`${message.username}-${message.discriminator}`}
              className={`transition-all duration-1000 ${
                isVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4"
              }`}
              style={{ transitionDelay: `${1200 + index * 200}ms` }}
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

      {/* Articles Section */}
      <div className="mt-24">
        <div className="text-center mb-16">
          <h3
            className={`text-2xl md:text-3xl font-bold text-white mb-4 transition-all duration-1000 ${
              isVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4"
            }`}
          >
            Press & Media
          </h3>
          <p
            className={`text-lg text-gray-400 max-w-2xl mx-auto transition-all duration-1000 delay-300 ${
              isVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4"
            }`}
          >
            Articles, tutorials, and videos from the tech community
          </p>
        </div>

        {/* Articles Grid */}
        <div
          className={`grid md:grid-cols-3 gap-8 max-w-7xl mx-auto transition-all duration-1000 delay-500 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          {articles.map((article, index) => (
            <div
              key={article.title}
              className={`transition-all duration-1000 ${
                isVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4"
              }`}
              style={{ transitionDelay: `${1800 + index * 200}ms` }}
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
  );
}
