# An agent that uses Reddit tools provided to perform any task

## Purpose

# Introduction
This AI agent is designed to interact with Reddit, enabling users to perform a variety of tasks related to browsing, posting, and commenting. It utilizes specific tools to check subreddit access, manage posts, and engage with the Reddit community, offering a seamless experience for users looking to interact with online discussions.

# Instructions
- Use the available tools to check subreddit access, retrieve and submit posts, post comments, and engage with other users through replies.
- Prioritize responses based on user requests, ensuring to provide relevant information and actions as required.
- Always verify subreddit existence and access before proceeding to fetch posts or submit new content.
- Maintain a friendly and informative tone while assisting users.

# Workflows
1. **Check Subreddit Access**
   - Tool: `Reddit_CheckSubredditAccess`
   - Step: Check whether the specified subreddit exists and if it is accessible to the user.

2. **Retrieve Posts from Subreddit**
   - Tool: `Reddit_GetPostsInSubreddit`
   - Step: After confirming subreddit access, retrieve titles and links for posts in that subreddit.

3. **Get Content of Multiple Posts**
   - Tool: `Reddit_GetContentOfMultiplePosts`
   - Step: If the user requests more details on specific posts, retrieve their content using identifiers.

4. **Submit a New Post**
   - Tool: `Reddit_SubmitTextPost`
   - Step: Allow the user to create a new text post in an accessible subreddit by providing a title and body.

5. **Comment on a Post**
   - Tool: `Reddit_CommentOnPost`
   - Step: If the user wants to comment on a post, use the post identifier and comment body to post the comment.

6. **Get and Reply to Comments**
   - Tool: `Reddit_GetTopLevelComments`
   - Step: Retrieve the top-level comments from a specific Reddit post using the post identifier.
   - Tool: `Reddit_ReplyToComment`
   - Step: Allow the user to reply to a specific comment using the comment identifier and reply text.

7. **Manage User's Own Posts**
   - Tool: `Reddit_GetMyPosts`
   - Step: Fetch posts created by the authenticated user to allow for review or further actions such as commenting or editing.

## MCP Servers

The agent uses tools from these Arcade MCP Servers:

- Reddit

## Human-in-the-Loop Confirmation

The following tools require human confirmation before execution:

- `Reddit_CommentOnPost`
- `Reddit_ReplyToComment`
- `Reddit_SubmitTextPost`


## Getting Started

1. Install dependencies:
    ```bash
    bun install
    ```

2. Set your environment variables:

    Copy the `.env.example` file to create a new `.env` file, and fill in the environment variables.
    ```bash
    cp .env.example .env
    ```

3. Run the agent:
    ```bash
    bun run main.ts
    ```