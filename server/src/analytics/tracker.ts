import type { AnalyticsEntry, AnalyticsSummary, AnalyticsToolCall } from "@intune-agent/shared";

// Pricing per 1K tokens (Azure OpenAI GPT-4o approximate rates)
const PROMPT_COST_PER_1K = 0.005;
const COMPLETION_COST_PER_1K = 0.015;

let idCounter = 0;

class AnalyticsTracker {
  private entries: AnalyticsEntry[] = [];
  private maxEntries = 500;

  /** Start tracking a new request. Returns an entry builder. */
  startRequest(userMessage: string, model: string): RequestTracker {
    return new RequestTracker(userMessage, model, (entry) => {
      this.entries.push(entry);
      if (this.entries.length > this.maxEntries) {
        this.entries = this.entries.slice(-this.maxEntries);
      }
    });
  }

  getSummary(): AnalyticsSummary {
    const totalRequests = this.entries.length;
    const totalTokens = this.entries.reduce((s, e) => s + e.totalTokens, 0);
    const totalPromptTokens = this.entries.reduce((s, e) => s + e.promptTokens, 0);
    const totalCompletionTokens = this.entries.reduce((s, e) => s + e.completionTokens, 0);
    const totalCost = this.entries.reduce((s, e) => s + e.estimatedCost, 0);
    const totalDuration = this.entries.reduce((s, e) => s + e.totalDurationMs, 0);
    const totalToolCalls = this.entries.reduce((s, e) => s + e.toolCalls.length, 0);

    return {
      totalRequests,
      totalTokens,
      totalPromptTokens,
      totalCompletionTokens,
      totalCost,
      avgResponseMs: totalRequests > 0 ? totalDuration / totalRequests : 0,
      avgTokensPerRequest: totalRequests > 0 ? totalTokens / totalRequests : 0,
      totalToolCalls,
      entries: [...this.entries].reverse(), // newest first
    };
  }

  clear(): void {
    this.entries = [];
  }
}

export class RequestTracker {
  private startTime = Date.now();
  private promptTokens = 0;
  private completionTokens = 0;
  private iterations = 0;
  private toolCalls: AnalyticsToolCall[] = [];
  private error?: string;

  constructor(
    private userMessage: string,
    private model: string,
    private onComplete: (entry: AnalyticsEntry) => void
  ) {}

  addTokenUsage(prompt: number, completion: number): void {
    this.promptTokens += prompt;
    this.completionTokens += completion;
    this.iterations++;
  }

  addToolCall(call: AnalyticsToolCall): void {
    this.toolCalls.push(call);
  }

  setError(message: string): void {
    this.error = message;
  }

  finish(): void {
    const totalTokens = this.promptTokens + this.completionTokens;
    const estimatedCost =
      (this.promptTokens / 1000) * PROMPT_COST_PER_1K +
      (this.completionTokens / 1000) * COMPLETION_COST_PER_1K;

    this.onComplete({
      id: `analytics-${++idCounter}`,
      timestamp: new Date().toISOString(),
      userMessage: this.userMessage,
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens,
      estimatedCost,
      totalDurationMs: Date.now() - this.startTime,
      iterations: this.iterations,
      toolCalls: this.toolCalls,
      model: this.model,
      error: this.error,
    });
  }
}

export const analyticsTracker = new AnalyticsTracker();
