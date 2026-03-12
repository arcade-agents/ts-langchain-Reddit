---
title: "Build a Reddit agent with LangChain (TypeScript) and Arcade"
slug: "ts-langchain-Reddit"
framework: "langchain-ts"
language: "typescript"
toolkits: ["Reddit"]
tools: []
difficulty: "beginner"
generated_at: "2026-03-12T01:35:09Z"
source_template: "ts_langchain"
agent_repo: ""
tags:
  - "langchain"
  - "typescript"
  - "reddit"
---

# Build a Reddit agent with LangChain (TypeScript) and Arcade

In this tutorial you'll build an AI agent using [LangChain](https://js.langchain.com/) with [LangGraph](https://langchain-ai.github.io/langgraphjs/) in TypeScript and [Arcade](https://arcade.dev) that can interact with Reddit tools — with built-in authorization and human-in-the-loop support.

## Prerequisites

- The [Bun](https://bun.com) runtime
- An [Arcade](https://arcade.dev) account and API key
- An OpenAI API key

## Project Setup

First, create a directory for this project, and install all the required dependencies:

````bash
mkdir reddit-agent && cd reddit-agent
bun install @arcadeai/arcadejs @langchain/langgraph @langchain/core langchain chalk
````

## Start the agent script

Create a `main.ts` script, and import all the packages and libraries. Imports from 
the `"./tools"` package may give errors in your IDE now, but don't worry about those
for now, you will write that helper package later.

````typescript
"use strict";
import { getTools, confirm, arcade } from "./tools";
import { createAgent } from "langchain";
import {
  Command,
  MemorySaver,
  type Interrupt,
} from "@langchain/langgraph";
import chalk from "chalk";
import * as readline from "node:readline/promises";
````

## Configuration

In `main.ts`, configure your agent's toolkits, system prompt, and model. Notice
how the system prompt tells the agent how to navigate different scenarios and
how to combine tool usage in specific ways. This prompt engineering is important
to build effective agents. In fact, the more agentic your application, the more
relevant the system prompt to truly make the agent useful and effective at
using the tools at its disposal.

````typescript
// configure your own values to customize your agent

// The Arcade User ID identifies who is authorizing each service.
const arcadeUserID = process.env.ARCADE_USER_ID;
if (!arcadeUserID) {
  throw new Error("Missing ARCADE_USER_ID. Add it to your .env file.");
}
// This determines which MCP server is providing the tools, you can customize this to make a Slack agent, or Notion agent, etc.
// all tools from each of these MCP servers will be retrieved from arcade
const toolkits=['Reddit'];
// This determines isolated tools that will be
const isolatedTools=[];
// This determines the maximum number of tool definitions Arcade will return
const toolLimit = 100;
// This prompt defines the behavior of the agent.
const systemPrompt = "# Reddit Agent \u2014 ReAct Prompt\n\nIntroduction\n------------\nYou are an autonomous Reddit agent that uses the provided toolset to read subreddit content, compose comments and posts, and interact with comments and posts on behalf of a user. You must follow the ReAct (Reasoning + Action) style: alternate clear reasoning steps (\"Thought: ...\") with explicit tool calls (\"Action: \u003cToolName\u003e\") and record the observations returned. Use tools whenever you need up\u2011to\u2011date or post/comment content \u2014 do not guess or hallucinate content or subreddit status.\n\nInstructions\n------------\n1. ReAct format:\n   - Every decision step must be expressed in the ReAct format:\n     - Thought: State what you intend to do and why (brief).\n     - Action: Call a tool with properly formatted parameters.\n     - Observation: Paste the tool output exactly (the system will insert it).\n     - Thought: Interpret the observation and decide next step.\n   - When you finish a task for the user, provide a concise final Answer/Result message (not a tool call).\n\n2. Always fetch authoritative data before acting:\n   - Check subreddit existence and accessibility with Reddit_CheckSubredditAccess before reading posts or posting.\n   - Use Reddit_GetSubredditRules before posting or commenting to ensure compliance.\n   - Use Reddit_GetContentOfPost or Reddit_GetContentOfMultiplePosts to fetch post bodies before summarizing or replying. For more than one post, always use Reddit_GetContentOfMultiplePosts (limit \u2264 100).\n   - When replying to or quoting a comment, retrieve the comment context via Reddit_GetTopLevelComments for the post (or other relevant tool output) so you reply accurately.\n\n3. Which tool to use when:\n   - To check subreddit access: Reddit_CheckSubredditAccess.\n   - To list posts: Reddit_GetPostsInSubreddit.\n   - To read a single post body: Reddit_GetContentOfPost.\n   - To read multiple post bodies (2+): Reddit_GetContentOfMultiplePosts (up to 100).\n   - To read top-level comments of a post: Reddit_GetTopLevelComments.\n   - To comment on a post: Reddit_CommentOnPost.\n   - To reply to a comment: Reddit_ReplyToComment.\n   - To submit a text post: Reddit_SubmitTextPost.\n   - To inspect the authenticated account: Reddit_GetMyUsername and Reddit_GetMyPosts.\n\n4. Safety, policy and content rules:\n   - Respect subreddit rules: after fetching rules, explicitly confirm the planned content complies.\n   - Do not post or reveal the authenticated user\u0027s private credentials or other personal data.\n   - Do not post spam, advertising, doxxing, hateful, illegal, or adult sexual content unless the subreddit is explicitly NSFW and user requested such content. Use the nsfw flag appropriately on Reddit_SubmitTextPost.\n   - Post titles and bodies must not be identical when calling Reddit_SubmitTextPost.\n   - Avoid excessive frequency of posting or commenting in the same community; on ambiguous rate-limit errors, inform the user.\n   - If a subreddit is private/inaccessible, report that and ask the user for permission or alternatives.\n\n5. Tool usage rules and best practices:\n   - For Reddit_GetPostsInSubreddit: if listing is \"top\" or \"controversial\", include time_range (e.g., DAY, WEEK, MONTH, YEAR, ALL).\n   - When gathering multiple posts, batch them into Reddit_GetContentOfMultiplePosts (\u2264 100) rather than calling the single-post tool repeatedly.\n   - Always include clear, user\u2011visible results after tool calls (summaries, suggested comment/post text, or confirmation of successful submission).\n   - When generating markdown for comments or posts, ensure it is valid Markdown and appropriate for the subreddit.\n   - If a tool returns an error or unexpected result, explain the error, and ask the user whether to retry or do something else.\n\nWorkflows\n---------\nBelow are common workflows and the ordered sequence of tools to use for each. For each step, follow the ReAct pattern.\n\n1) Inspect a subreddit and list posts (browsing)\n   - Purpose: Let the user explore a subreddit and summarize current posts.\n   - Sequence:\n     1. Reddit_CheckSubredditAccess(subreddit: string)\n        - If exists=False -\u003e stop and inform user the subreddit does not exist.\n        - If exists=True and accessible=False -\u003e inform user it is private/restricted.\n     2. Reddit_GetSubredditRules(subreddit: string)\n        - Read rules and extract posting/commenting constraints.\n     3. Reddit_GetPostsInSubreddit(subreddit: string, listing: string, limit: int, time_range?: string)\n        - Use \u0027hot\u0027, \u0027new\u0027, \u0027rising\u0027 as appropriate; if \u0027top\u0027 or \u0027controversial\u0027, supply time_range.\n     4. If you need full post bodies for 2+ posts, Reddit_GetContentOfMultiplePosts(post_identifiers: [...]) else Reddit_GetContentOfPost(post_identifier: string).\n     5. Provide a concise summary of posts and any rule restrictions relevant to the user\u2019s intent.\n\n   - Example ReAct snippet:\n     ```\n     Thought: Check whether r/example is accessible so I can browse posts.\n     Action: Reddit_CheckSubredditAccess { \"subreddit\": \"example\" }\n     Observation: {...}\n     Thought: The subreddit is accessible. I\u0027ll fetch the sub rules next.\n     Action: Reddit_GetSubredditRules { \"subreddit\": \"example\" }\n     Observation: {...}\n     Thought: Now list the top 10 hot posts to summarize.\n     Action: Reddit_GetPostsInSubreddit { \"subreddit\": \"example\", \"listing\": \"hot\", \"limit\": 10 }\n     Observation: {...}\n     ```\n\n2) Read one post and its top-level comments (context for replying or summarizing)\n   - Purpose: Get full context for a single post and its discussion.\n   - Sequence:\n     1. Reddit_GetContentOfPost(post_identifier: string)\n     2. Reddit_GetTopLevelComments(post_identifier: string)\n     3. Summarize post + top-level discussion or identify the comment to reply to.\n\n3) Comment on a post\n   - Purpose: Write and submit a comment for a post.\n   - Sequence:\n     1. Reddit_GetContentOfPost(post_identifier: string) \u2014 fetch post and ensure your comment is relevant.\n     2. Reddit_GetSubredditRules(subreddit: string) \u2014 ensure compliance.\n     3. Draft the comment in Markdown and show it to the user (if interactive) or proceed if asked to post directly.\n     4. Reddit_CommentOnPost(post_identifier: string, text: string)\n     5. Return confirmation and the comment body.\n\n   - Important: If you cannot fetch the post content, do not post a comment. Always validate rules (no vote manipulation, no doxxing, etc.).\n\n4) Reply to a specific comment\n   - Purpose: Reply to a comment in-context.\n   - Sequence:\n     1. If you only have a comment identifier but need context: find its post and call Reddit_GetTopLevelComments(post_identifier) to locate the comment text.\n     2. Draft reply ensuring it adheres to subreddit rules.\n     3. Reddit_ReplyToComment(comment_identifier: string, text: string)\n     4. Return confirmation and include the reply body.\n\n   - Note: If the target comment is not visible in the first page of top-level comments, explain that more context is needed (or ask the user for a permalink).\n\n5) Submit a new text post\n   - Purpose: Create a new text-based submission.\n   - Sequence:\n     1. Reddit_CheckSubredditAccess(subreddit: string)\n     2. Reddit_GetSubredditRules(subreddit: string)\n     3. Draft title and body (ensure body != title) and choose nsfw/spoiler flags as needed.\n     4. Reddit_SubmitTextPost(subreddit: string, title: string, body?: string, nsfw?: boolean, spoiler?: boolean, send_replies?: boolean)\n     5. Confirm submission and show the post title and body back to the user.\n\n   - Constraints:\n     - Ensure the post content complies with rules (no prohibited content).\n     - If subreddit requires a specific flair or formatting, ensure the draft follows it (and ask the user to confirm before posting if uncertain).\n\n6) Fetch multiple posts\u0027 content efficiently (batch retrieval)\n   - Purpose: Retrieve bodies of many posts to analyze or summarize.\n   - Sequence:\n     1. Reddit_GetContentOfMultiplePosts(post_identifiers: [...]) \u2014 use when fetching 2 or more posts; limit \u2264 100.\n     2. Analyze/summarize and present results.\n\n7) Inspect the authenticated account\n   - Purpose: Get the agent\u2019s Reddit identity and recent posts.\n   - Sequence:\n     1. Reddit_GetMyUsername()\n     2. Reddit_GetMyPosts(limit?: int, include_body?: bool, cursor?: string)\n     3. Present results or use them for follow-up actions (e.g., edit, reply).\n\nErrors and edge cases\n---------------------\n- If Reddit_CheckSubredditAccess reports exists=True but accessible=False: report this to the user and ask whether to attempt alternative subreddits or provide credentials/permissions.\n- If a tool returns paging cursors: store and use cursor for subsequent calls; ask the user if they want more results when appropriate.\n- If a call fails (network, permissions, rate-limit), explain the failure and propose next steps (retry, wait, ask user to authenticate).\n- Never fabricate tool outputs. If needed data is missing, ask the user for clarification.\n\nExample full ReAct interaction (template)\n----------------------------------------\nUse this pattern for interactions. Replace arguments with actual values.\n\n```\nThought: I need to verify the subreddit exists before fetching posts.\nAction: Reddit_CheckSubredditAccess\n{ \"subreddit\": \"example\" }\nObservation: { \"exists\": true, \"accessible\": true }\n\nThought: The subreddit is accessible. Fetch the subreddit rules to ensure compliance.\nAction: Reddit_GetSubredditRules\n{ \"subreddit\": \"example\" }\nObservation: {...rules...}\n\nThought: Now fetch 10 hot posts to summarize.\nAction: Reddit_GetPostsInSubreddit\n{ \"subreddit\": \"example\", \"listing\": \"hot\", \"limit\": 10 }\nObservation: [{...post metadata list...}]\n\nThought: I need the full body of the top 3 posts to give a more useful summary.\nAction: Reddit_GetContentOfMultiplePosts\n{ \"post_identifiers\": [\"postid1\", \"postid2\", \"postid3\"] }\nObservation: [{...post bodies...}]\n\nThought: I will summarize the three posts and note any moderation rules that affect posting.\nAnswer: Here are summaries of the top three posts in r/example...\n```\n\nFinal notes\n-----------\n- Keep ReAct steps short and focused; ensure each Action is followed by an Observation and a Thought interpreting that observation.\n- When producing content to post or comment, present the final markdown to the user and confirm if posting is a destructive action (unless the user explicitly requested an immediate post).\n- Be explicit about required parameters for each tool called. Use the exact tool names and JSON-style argument objects as in the examples.\n\nYou are ready to act as the Reddit agent. Follow the workflows above and use tools in the specified order for reliable, auditable interactions.";
// This determines which LLM will be used inside the agent
const agentModel = process.env.OPENAI_MODEL;
if (!agentModel) {
  throw new Error("Missing OPENAI_MODEL. Add it to your .env file.");
}
// This allows LangChain to retain the context of the session
const threadID = "1";
````

Set the following environment variables in a `.env` file:

````bash
ARCADE_API_KEY=your-arcade-api-key
ARCADE_USER_ID=your-arcade-user-id
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-5-mini
````

## Implementing the `tools.ts` module

The `tools.ts` module fetches Arcade tool definitions and converts them to LangChain-compatible tools using Arcade's Zod schema conversion:

### Create the file and import the dependencies

Create a `tools.ts` file, and add import the following. These will allow you to build the helper functions needed to convert Arcade tool definitions into a format that LangChain can execute. Here, you also define which tools will require human-in-the-loop confirmation. This is very useful for tools that may have dangerous or undesired side-effects if the LLM hallucinates the values in the parameters. You will implement the helper functions to require human approval in this module.

````typescript
import { Arcade } from "@arcadeai/arcadejs";
import {
  type ToolExecuteFunctionFactoryInput,
  type ZodTool,
  executeZodTool,
  isAuthorizationRequiredError,
  toZod,
} from "@arcadeai/arcadejs/lib/index";
import { type ToolExecuteFunction } from "@arcadeai/arcadejs/lib/zod/types";
import { tool } from "langchain";
import {
  interrupt,
} from "@langchain/langgraph";
import readline from "node:readline/promises";

// This determines which tools require human in the loop approval to run
const TOOLS_WITH_APPROVAL = ['Reddit_CommentOnPost', 'Reddit_ReplyToComment', 'Reddit_SubmitTextPost'];
````

### Create a confirmation helper for human in the loop

The first helper that you will write is the `confirm` function, which asks a yes or no question to the user, and returns `true` if theuser replied with `"yes"` and `false` otherwise.

````typescript
// Prompt user for yes/no confirmation
export async function confirm(question: string, rl?: readline.Interface): Promise<boolean> {
  let shouldClose = false;
  let interface_ = rl;

  if (!interface_) {
      interface_ = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
      });
      shouldClose = true;
  }

  const answer = await interface_.question(`${question} (y/n): `);

  if (shouldClose) {
      interface_.close();
  }

  return ["y", "yes"].includes(answer.trim().toLowerCase());
}
````

Tools that require authorization trigger a LangGraph interrupt, which pauses execution until the user completes authorization in their browser.

### Create the execution helper

This is a wrapper around the `executeZodTool` function. Before you execute the tool, however, there are two logical checks to be made:

1. First, if the tool the agent wants to invoke is included in the `TOOLS_WITH_APPROVAL` variable, human-in-the-loop is enforced by calling `interrupt` and passing the necessary data to call the `confirm` helper. LangChain will surface that `interrupt` to the agentic loop, and you will be required to "resolve" the interrupt later on. For now, you can assume that the reponse of the `interrupt` will have enough information to decide whether to execute the tool or not, depending on the human's reponse.
2. Second, if the tool was approved by the human, but it doesn't have the authorization of the integration to run, then you need to present an URL to the user so they can authorize the OAuth flow for this operation. For this, an execution is attempted, that may fail to run if the user is not authorized. When it fails, you interrupt the flow and send the authorization request for the harness to handle. If the user authorizes the tool, the harness will reply with an `{authorized: true}` object, and the system will retry the tool call without interrupting the flow.

````typescript
export function executeOrInterruptTool({
  zodToolSchema,
  toolDefinition,
  client,
  userId,
}: ToolExecuteFunctionFactoryInput): ToolExecuteFunction<any> {
  const { name: toolName } = zodToolSchema;

  return async (input: unknown) => {
    try {

      // If the tool is on the list that enforces human in the loop, we interrupt the flow and ask the user to authorize the tool

      if (TOOLS_WITH_APPROVAL.includes(toolName)) {
        const hitl_response = interrupt({
          authorization_required: false,
          hitl_required: true,
          tool_name: toolName,
          input: input,
        });

        if (!hitl_response.authorized) {
          // If the user didn't approve the tool call, we throw an error, which will be handled by LangChain
          throw new Error(
            `Human in the loop required for tool call ${toolName}, but user didn't approve.`
          );
        }
      }

      // Try to execute the tool
      const result = await executeZodTool({
        zodToolSchema,
        toolDefinition,
        client,
        userId,
      })(input);
      return result;
    } catch (error) {
      // If the tool requires authorization, we interrupt the flow and ask the user to authorize the tool
      if (error instanceof Error && isAuthorizationRequiredError(error)) {
        const response = await client.tools.authorize({
          tool_name: toolName,
          user_id: userId,
        });

        // We interrupt the flow here, and pass everything the handler needs to get the user's authorization
        const interrupt_response = interrupt({
          authorization_required: true,
          authorization_response: response,
          tool_name: toolName,
          url: response.url ?? "",
        });

        // If the user authorized the tool, we retry the tool call without interrupting the flow
        if (interrupt_response.authorized) {
          const result = await executeZodTool({
            zodToolSchema,
            toolDefinition,
            client,
            userId,
          })(input);
          return result;
        } else {
          // If the user didn't authorize the tool, we throw an error, which will be handled by LangChain
          throw new Error(
            `Authorization required for tool call ${toolName}, but user didn't authorize.`
          );
        }
      }
      throw error;
    }
  };
}
````

### Create the tool retrieval helper

The last helper function of this module is the `getTools` helper. This function will take the configurations you defined in the `main.ts` file, and retrieve all of the configured tool definitions from Arcade. Those definitions will then be converted to LangGraph `Function` tools, and will be returned in a format that LangChain can present to the LLM so it can use the tools and pass the arguments correctly. You will pass the `executeOrInterruptTool` helper you wrote in the previous section so all the bindings to the human-in-the-loop and auth handling are programmed when LancChain invokes a tool.


````typescript
// Initialize the Arcade client
export const arcade = new Arcade();

export type GetToolsProps = {
  arcade: Arcade;
  toolkits?: string[];
  tools?: string[];
  userId: string;
  limit?: number;
}


export async function getTools({
  arcade,
  toolkits = [],
  tools = [],
  userId,
  limit = 100,
}: GetToolsProps) {

  if (toolkits.length === 0 && tools.length === 0) {
      throw new Error("At least one tool or toolkit must be provided");
  }

  // Todo(Mateo): Add pagination support
  const from_toolkits = await Promise.all(toolkits.map(async (tkitName) => {
      const definitions = await arcade.tools.list({
          toolkit: tkitName,
          limit: limit
      });
      return definitions.items;
  }));

  const from_tools = await Promise.all(tools.map(async (toolName) => {
      return await arcade.tools.get(toolName);
  }));

  const all_tools = [...from_toolkits.flat(), ...from_tools];
  const unique_tools = Array.from(
      new Map(all_tools.map(tool => [tool.qualified_name, tool])).values()
  );

  const arcadeTools = toZod({
    tools: unique_tools,
    client: arcade,
    executeFactory: executeOrInterruptTool,
    userId: userId,
  });

  // Convert Arcade tools to LangGraph tools
  const langchainTools = arcadeTools.map(({ name, description, execute, parameters }) =>
    (tool as Function)(execute, {
      name,
      description,
      schema: parameters,
    })
  );

  return langchainTools;
}
````

## Building the Agent

Back on the `main.ts` file, you can now call the helper functions you wrote to build the agent.

### Retrieve the configured tools

Use the `getTools` helper you wrote to retrieve the tools from Arcade in LangChain format:

````typescript
const tools = await getTools({
  arcade,
  toolkits: toolkits,
  tools: isolatedTools,
  userId: arcadeUserID,
  limit: toolLimit,
});
````

### Write an interrupt handler

When LangChain is interrupted, it will emit an event in the stream that you will need to handle and resolve based on the user's behavior. For a human-in-the-loop interrupt, you will call the `confirm` helper you wrote earlier, and indicate to the harness whether the human approved the specific tool call or not. For an auth interrupt, you will present the OAuth URL to the user, and wait for them to finishe the OAuth dance before resolving the interrupt with `{authorized: true}` or `{authorized: false}` if an error occurred:

````typescript
async function handleInterrupt(
  interrupt: Interrupt,
  rl: readline.Interface
): Promise<{ authorized: boolean }> {
  const value = interrupt.value;
  const authorization_required = value.authorization_required;
  const hitl_required = value.hitl_required;
  if (authorization_required) {
    const tool_name = value.tool_name;
    const authorization_response = value.authorization_response;
    console.log("⚙️: Authorization required for tool call", tool_name);
    console.log(
      "⚙️: Please authorize in your browser",
      authorization_response.url
    );
    console.log("⚙️: Waiting for you to complete authorization...");
    try {
      await arcade.auth.waitForCompletion(authorization_response.id);
      console.log("⚙️: Authorization granted. Resuming execution...");
      return { authorized: true };
    } catch (error) {
      console.error("⚙️: Error waiting for authorization to complete:", error);
      return { authorized: false };
    }
  } else if (hitl_required) {
    console.log("⚙️: Human in the loop required for tool call", value.tool_name);
    console.log("⚙️: Please approve the tool call", value.input);
    const approved = await confirm("Do you approve this tool call?", rl);
    return { authorized: approved };
  }
  return { authorized: false };
}
````

### Create an Agent instance

Here you create the agent using the `createAgent` function. You pass the system prompt, the model, the tools, and the checkpointer. When the agent runs, it will automatically use the helper function you wrote earlier to handle tool calls and authorization requests.

````typescript
const agent = createAgent({
  systemPrompt: systemPrompt,
  model: agentModel,
  tools: tools,
  checkpointer: new MemorySaver(),
});
````

### Write the invoke helper

This last helper function handles the streaming of the agent’s response, and captures the interrupts. When the system detects an interrupt, it adds the interrupt to the `interrupts` array, and the flow interrupts. If there are no interrupts, it will just stream the agent’s to your console.

````typescript
async function streamAgent(
  agent: any,
  input: any,
  config: any
): Promise<Interrupt[]> {
  const stream = await agent.stream(input, {
    ...config,
    streamMode: "updates",
  });
  const interrupts: Interrupt[] = [];

  for await (const chunk of stream) {
    if (chunk.__interrupt__) {
      interrupts.push(...(chunk.__interrupt__ as Interrupt[]));
      continue;
    }
    for (const update of Object.values(chunk)) {
      for (const msg of (update as any)?.messages ?? []) {
        console.log("🤖: ", msg.toFormattedString());
      }
    }
  }

  return interrupts;
}
````

### Write the main function

Finally, write the main function that will call the agent and handle the user input.

Here the `config` object configures the `thread_id`, which tells the agent to store the state of the conversation into that specific thread. Like any typical agent loop, you:

1. Capture the user input
2. Stream the agent's response
3. Handle any authorization interrupts
4. Resume the agent after authorization
5. Handle any errors
6. Exit the loop if the user wants to quit

````typescript
async function main() {
  const config = { configurable: { thread_id: threadID } };
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.green("Welcome to the chatbot! Type 'exit' to quit."));
  while (true) {
    const input = await rl.question("> ");
    if (input.toLowerCase() === "exit") {
      break;
    }
    rl.pause();

    try {
      let agentInput: any = {
        messages: [{ role: "user", content: input }],
      };

      // Loop until no more interrupts
      while (true) {
        const interrupts = await streamAgent(agent, agentInput, config);

        if (interrupts.length === 0) {
          break; // No more interrupts, we're done
        }

        // Handle all interrupts
        const decisions: any[] = [];
        for (const interrupt of interrupts) {
          decisions.push(await handleInterrupt(interrupt, rl));
        }

        // Resume with decisions, then loop to check for more interrupts
        // Pass single decision directly, or array for multiple interrupts
        agentInput = new Command({ resume: decisions.length === 1 ? decisions[0] : decisions });
      }
    } catch (error) {
      console.error(error);
    }

    rl.resume();
  }
  console.log(chalk.red("👋 Bye..."));
  process.exit(0);
}

// Run the main function
main().catch((err) => console.error(err));
````

## Running the Agent

### Run the agent

```bash
bun run main.ts
```

You should see the agent responding to your prompts like any model, as well as handling any tool calls and authorization requests.

## Next Steps

- Clone the [repository](https://github.com/arcade-agents/ts-langchain-Reddit) and run it
- Add more toolkits to the `toolkits` array to expand capabilities
- Customize the `systemPrompt` to specialize the agent's behavior
- Explore the [Arcade documentation](https://docs.arcade.dev) for available toolkits

