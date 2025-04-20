import Link from "@docusaurus/Link";
import { useBlogPost } from "@docusaurus/theme-common/internal";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { blogPostContainerID } from "@docusaurus/utils-common";
import BlogPostItemContainer from "@theme/BlogPostItem/Container";
import MDXContent from "@theme/MDXContent";
import clsx from "clsx";
import React from "react";

import { DateComponent, ReadingTime } from "@site/src/components/blog/common";
import Markdown from "react-markdown";

const SimilarBlogs = () => {
  const { metadata } = useBlogPost();
  const relatedPosts = metadata.relatedPosts || [];

  if (relatedPosts.length === 0) {
    return null;
  }

  return (
    <div className="mt-12 border-t border-gray-200 dark:border-gray-800 pt-8">
      <h2 className="text-2xl font-bold mb-6">Related Posts</h2>
      <div className="flex flex-col gap-8">
        {relatedPosts.map((post) => (
          <Link
            key={post.permalink}
            to={post.permalink}
            className="no-underline group"
          >
            <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-6 transition-all duration-200 hover:shadow-md bg-white dark:bg-gray-900">
              <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-gray-100 group-hover:text-primary">
                {post.title}
              </h3>
              <p className="text-base text-gray-600 dark:text-gray-400 mb-4">
                {post.description}
              </p>
              <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                <DateComponent
                  date={post.date}
                  formattedDate={post.formattedDate}
                />
                {post.readingTime && (
                  <>
                    <span className="mx-2">·</span>
                    <ReadingTime readingTime={post.readingTime} />
                  </>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export const BlogPostPageView = ({ children }) => {
  const { metadata, isBlogPostPage } = useBlogPost();
  const {
    permalink,
    title,
    date,
    formattedDate,
    readingTime,
    frontMatter,
    tags,
    description,
    authors,
  } = metadata;
  const author = authors[0];

  const {
    siteConfig: { url },
  } = useDocusaurusContext();

  return (
    <BlogPostItemContainer
      className={clsx(
        "blog-sm:py-0",
        "blog-md:py-0",
        "w-full",
        "mx-auto landing-lg:mr-0",
        "blog-sm:max-w-screen-blog-sm",
        "blog-lg:max-w-screen-content-2xl",
        "blog-content",
      )}
    >
      <div
        className={clsx(
          "flex",
          "justify-between",
          "items-center",
          "blog-sm:px-6",
          "mb-8",
        )}
      >
        <Link
          to="/blog"
          className={clsx("!text-main-emerald text-sm no-underline")}
        >
          ← Back to blog
        </Link>
      </div>

      <div className="blog-sm:px-6">
        <p
          className="mb-6 leading-[1.3] text-3xl font-bold"
          itemProp="headline"
        >
          {isBlogPostPage ? (
            title
          ) : (
            <Link itemProp="url" to={permalink}>
              {title}
            </Link>
          )}
        </p>

        <div className="mb-4 text-sm">
          <div className={clsx("flex flex-col gap-3")}>
            {author && (
              <div className="border border-solid  border-main-emerald  rounded-lg p-3 sm:p-4 bg-white/10 shadow-sm">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600 dark:text-gray-100 font-semibold text-sm sm:text-base">
                        Author:{" "}
                      </span>
                      <Link
                        to={`/blog/author/${author.key
                          .toLowerCase()
                          .replace(/_/g, "-")}`}
                        className="text-main-emerald  no-underline text-sm sm:text-base"
                      >
                        {author.name}
                      </Link>
                    </div>
                    {author.title && (
                      <div className="flex items-center gap-2">
                        <span className="hidden sm:inline text-gray-400">
                          -
                        </span>
                        <span className="text-gray-600 dark:text-gray-100 text-sm sm:text-base">
                          {author.title}
                        </span>
                      </div>
                    )}
                  </div>
                  {author.bio && (
                    <span className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm leading-relaxed">
                      {author.bio}
                    </span>
                  )}
                </div>
              </div>
            )}
            <div className="flex items-center justify-end gap-2 text-main-emerald">
              <DateComponent date={date} formattedDate={formattedDate} />
              {typeof readingTime !== "undefined" && (
                <>
                  <span className="w-[4px] h-[4px] rounded-full bg-gray-600 dark:bg-gray-500" />
                  <ReadingTime readingTime={readingTime} />
                </>
              )}
            </div>
          </div>
        </div>

        <div
          id={blogPostContainerID}
          className="markdown"
          itemProp="articleBody"
        >
          <MDXContent>{children}</MDXContent>
        </div>

        <SimilarBlogs
          currentPostTags={tags}
          currentPostId={metadata.id}
          title={title}
        />
      </div>
    </BlogPostItemContainer>
  );
};
