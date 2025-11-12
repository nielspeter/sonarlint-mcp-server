/**
 * Error handling utilities for the SonarLint MCP Server
 */

/**
 * Custom error class for SLOOP-specific errors
 */
export class SloopError extends Error {
  constructor(
    message: string,
    public userMessage: string,
    public recoverable: boolean = false
  ) {
    super(message);
    this.name = 'SloopError';
  }
}

/**
 * Handle tool errors and format them for MCP responses
 */
export function handleToolError(error: unknown) {
  console.error("[MCP] Error handling tool call:", error);

  if (error instanceof SloopError) {
    return {
      content: [
        {
          type: "text" as const,
          text: `❌ **Error**: ${error.userMessage}`,
        },
      ],
      isError: true,
    };
  }

  const errorMessage = error instanceof Error ? error.message : String(error);

  return {
    content: [
      {
        type: "text" as const,
        text: `❌ **Error**: ${errorMessage}`,
      },
    ],
    isError: true,
  };
}
