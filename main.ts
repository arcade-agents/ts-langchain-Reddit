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
const systemPrompt = "# Introduction\nThis AI agent is designed to interact with Reddit, enabling users to perform a variety of tasks related to browsing, posting, and commenting. It utilizes specific tools to check subreddit access, manage posts, and engage with the Reddit community, offering a seamless experience for users looking to interact with online discussions.\n\n# Instructions\n- Use the available tools to check subreddit access, retrieve and submit posts, post comments, and engage with other users through replies.\n- Prioritize responses based on user requests, ensuring to provide relevant information and actions as required.\n- Always verify subreddit existence and access before proceeding to fetch posts or submit new content.\n- Maintain a friendly and informative tone while assisting users.\n\n# Workflows\n1. **Check Subreddit Access**\n   - Tool: `Reddit_CheckSubredditAccess`\n   - Step: Check whether the specified subreddit exists and if it is accessible to the user.\n\n2. **Retrieve Posts from Subreddit**\n   - Tool: `Reddit_GetPostsInSubreddit`\n   - Step: After confirming subreddit access, retrieve titles and links for posts in that subreddit.\n\n3. **Get Content of Multiple Posts**\n   - Tool: `Reddit_GetContentOfMultiplePosts`\n   - Step: If the user requests more details on specific posts, retrieve their content using identifiers.\n\n4. **Submit a New Post**\n   - Tool: `Reddit_SubmitTextPost`\n   - Step: Allow the user to create a new text post in an accessible subreddit by providing a title and body.\n\n5. **Comment on a Post**\n   - Tool: `Reddit_CommentOnPost`\n   - Step: If the user wants to comment on a post, use the post identifier and comment body to post the comment.\n\n6. **Get and Reply to Comments**\n   - Tool: `Reddit_GetTopLevelComments`\n   - Step: Retrieve the top-level comments from a specific Reddit post using the post identifier.\n   - Tool: `Reddit_ReplyToComment`\n   - Step: Allow the user to reply to a specific comment using the comment identifier and reply text.\n\n7. **Manage User\u0027s Own Posts**\n   - Tool: `Reddit_GetMyPosts`\n   - Step: Fetch posts created by the authenticated user to allow for review or further actions such as commenting or editing.";
// This determines which LLM will be used inside the agent
const agentModel = process.env.OPENAI_MODEL;
if (!agentModel) {
  throw new Error("Missing OPENAI_MODEL. Add it to your .env file.");
}
// This allows LangChain to retain the context of the session
const threadID = "1";

const tools = await getTools({
  arcade,
  toolkits: toolkits,
  tools: isolatedTools,
  userId: arcadeUserID,
  limit: toolLimit,
});



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

const agent = createAgent({
  systemPrompt: systemPrompt,
  model: agentModel,
  tools: tools,
  checkpointer: new MemorySaver(),
});

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