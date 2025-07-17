import { Tweet as ReactTweet, EmbeddedTweet } from "react-tweet";

interface TweetProps {
  username: string;
  name: string;
  tweetId: string;
}

export function Tweet({ username, name, tweetId }: TweetProps) {
  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="bg-white/5 backdrop-blur-sm rounded-lg p-6 border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300">
        {/* User Info Header */}
        <div className="mb-4">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-white font-semibold text-lg">{name}</h3>
              <p className="text-gray-400 text-sm">@{username}</p>
            </div>
          </div>
        </div>

        {/* Tweet Content */}
        <div className="tweet-container [&_.react-tweet-theme]:!bg-transparent [&_.react-tweet-theme]:!border-none [&_.react-tweet-theme]:!shadow-none [&_[data-testid='tweet-actions']]:!hidden [&_[data-testid='reply']]:!hidden [&_[data-testid='retweet']]:!hidden [&_[data-testid='like']]:!hidden [&_[data-testid='share']]:!hidden [&_[data-testid='follow']]:!hidden [&_.r-1re7ezh]:!hidden [&_.r-1loqt21]:!hidden [&_.r-1awozwy]:!hidden [&_.r-18u37iz]:!hidden [&_.r-1h0z5md]:!hidden">
          <ReactTweet id={tweetId} />
        </div>
      </div>
    </div>
  );
}
