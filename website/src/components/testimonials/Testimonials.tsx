import { useState, useEffect } from "react";
import { ClientTweetCard } from "../magicui/tweet-card-client";

const testimonialTweetIds = [
  "1942395205011005544",
  "1927054751666999592",
  "1924374970555109607",
  "1925149528489120199",
  "1925350136944939321",
];

export function Testimonials() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div className="relative max-w-7xl mx-auto px-4 lg:px-8 py-16 md:py-24">
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
        className={`grid md:grid-cols-2 gap-8 max-w-5xl mx-auto transition-all duration-1000 delay-500 ${
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
    </div>
  );
}
