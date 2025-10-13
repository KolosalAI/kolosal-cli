/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { getCurrentGeminiMdFilename } from '@kolosal-ai/kolosal-ai-core';
import { CommandKind } from './types.js';
import { Text } from 'ink';
import React from 'react';

export const initCommand: SlashCommand = {
  name: 'init',
  description: 'Analyzes the project and creates a tailored KOLOSAL.md file.',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    _args: string,
  ): Promise<SlashCommandActionReturn> => {
    if (!context.services.config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }
    const targetDir = context.services.config.getTargetDir();
    const contextFileName = getCurrentGeminiMdFilename();
    const contextFilePath = path.join(targetDir, contextFileName);

    try {
      if (fs.existsSync(contextFilePath)) {
        // If file exists but is empty (or whitespace), continue to initialize
        try {
          const existing = fs.readFileSync(contextFilePath, 'utf8');
          if (existing && existing.trim().length > 0) {
            // File exists and has content - ask for confirmation to overwrite
            if (!context.overwriteConfirmed) {
              return {
                type: 'confirm_action',
                // TODO: Move to .tsx file to use JSX syntax instead of React.createElement
                // For now, using React.createElement to maintain .ts compatibility for PR review
                prompt: React.createElement(
                  Text,
                  null,
                  `A ${contextFileName} file already exists in this directory. Do you want to regenerate it?`,
                ),
                originalInvocation: {
                  raw: context.invocation?.raw || '/init',
                },
              };
            }
            // User confirmed overwrite, continue with regeneration
          }
        } catch {
          // If we fail to read, conservatively proceed to (re)create the file
        }
      }

      // Ensure an empty context file exists before prompting the model to populate it
      try {
        fs.writeFileSync(contextFilePath, '', 'utf8');
        context.ui.addItem(
          {
            type: 'info',
            text: `Empty ${contextFileName} created. Now analyzing the project to populate it.`,
          },
          Date.now(),
        );
      } catch (err) {
        return {
          type: 'message',
          messageType: 'error',
          content: `Failed to create ${contextFileName}: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Unexpected error preparing ${contextFileName}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    return {
      type: 'submit_prompt',
      content: `
You are Kolosal Cli, an interactive CLI agent. Your goal is to analyze the current directory and generate a comprehensive ${contextFileName} file to serve as instructional context for future interactions.

Begin with a concise checklist (3-7 bullets) of your planned steps to ensure a complete and structured analysis. Adjust as needed if unexpected conditions arise.

**Analysis Process:**

1. **Initial Exploration**
   - List all files and directories to obtain a high-level understanding of the structure.
   - Read the README file (such as \`README.md\` or \`README.txt\`) if it exists, as it often provides the most useful starting point.

2. **Iterative Deep Dive (up to 10 files)**
   - Based on your findings from initial exploration, choose the most significant files (e.g., configuration files, main source files, documentation) for a deeper review.
   - Read these files iteratively—after each, refine your perspective and determine which files to examine next. Limit your total to 10 files, and let new insights inform your selections.

3. **Identify Project Type**
   - **Code Project:** Look for indicators such as \`package.json\`, \`requirements.txt\`, \`pom.xml\`, \`go.mod\`, \`Cargo.toml\`, \`build.gradle\`, or a \`src\` directory. Their presence suggests a software project.
   - **Non-Code Project:** If code-related files are absent, the directory might be primarily for documentation, research, notes, or other purposes.

After any major step (e.g., completing initial exploration or iterative file selection), provide a 1–3 sentence status micro-update summarizing key findings and the next step.

**${contextFileName} Content Generation**

- For a Code Project, compose the following Markdown sections in this order:
    1. **Project Overview:** Summarize the project's purpose, core technologies, and overall architecture.
    2. **Building and Running:** List important commands for building, running, and testing the project based on available files. If not found, use a placeholder such as "TODO: Add command".
    3. **Development Conventions:** Specify coding styles, testing strategies, or contribution guidelines you can deduce, or insert a TODO as needed.

- For a Non-Code Project, include these Markdown sections in this order:
    1. **Directory Overview:** State the directory's purpose and principal contents.
    2. **Key Files:** Enumerate and briefly explain the most important files.
    3. **Usage:** Describe the intended use of the directory's contents.

If any key file (e.g., README, config) is missing, do not flag a warning. Instead, omit the details or insert a suitable TODO placeholder.

**Final Output:**

Write the finalized contents to ${contextFileName} in well-structured Markdown. Use top-level headings matching the required sections for the determined project type.

## Output Format

Your output must be valid Markdown written to ${contextFileName}. Use only the sections and strict ordering specified below based on project type:

**Code Project:**

\`\`\`
# Project Overview

[Your summary]

# Building and Running

[Commands or TODO]

# Development Conventions

[Description or TODO]
\`\`\`

**Non-Code Project:**

\`\`\`
# Directory Overview

[Summary]

# Key Files

[List with explanations]

# Usage

[Description]
\`\`\`

Include only the relevant sections for the detected project type. Where information is lacking, provide a TODO or leave out non-applicable details as appropriate.
`,
    };
  },
};
