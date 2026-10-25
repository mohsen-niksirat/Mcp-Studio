import { ToolItem, ChatConfig, ChatMessage, ChatToolCall } from '../types';
import { api } from './api';

export class ChatSandboxService {
  static async sendUserMessage(
    userText: string,
    history: ChatMessage[],
    tools: ToolItem[],
    config: ChatConfig,
    onProgress: (partialAssistantMsg: ChatMessage) => void
  ): Promise<ChatMessage> {
    const assistantId = `msg-${Date.now()}-ai`;
    let assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      timestamp: Date.now()
    };

    if (config.provider === 'mock') {
      return this.handleMockChat(userText, tools, assistantMsg, onProgress);
    }

    if (config.provider === 'gemini') {
      return this.handleGeminiChat(userText, history, tools, config, assistantMsg, onProgress);
    }

    if (config.provider === 'ollama' || config.provider === 'openai') {
      return this.handleOpenAIChat(userText, history, tools, config, assistantMsg, onProgress);
    }

    throw new Error(`Unsupported AI provider: ${config.provider}`);
  }

  // --- Provider: Mock / Heuristic Simulator (Zero Keys Required) ---
  private static async handleMockChat(
    userText: string,
    tools: ToolItem[],
    assistantMsg: ChatMessage,
    onProgress: (msg: ChatMessage) => void
  ): Promise<ChatMessage> {
    const lower = userText.toLowerCase();

    // Check for Math
    const mathTool = tools.find((t) => t.name.includes('calc') || t.name.includes('math'));
    const isMath = /calc|math|power|add|\+|\*|\/|\-|multiply|divide|square|\^/i.test(lower);

    // Check for System Monitor
    const sysTool = tools.find((t) => t.name.includes('system') || t.name.includes('monitor'));
    const isSys = /system|cpu|ram|memory|spec|hardware|os|host|platform/i.test(lower);

    // Check for Mock Data
    const userTool = tools.find((t) => t.name.includes('user') || t.name.includes('data'));
    const isUserGen = /generate|mock|users|profiles|records|fake/i.test(lower);

    if (mathTool && isMath) {
      let op = 'multiply';
      let a = 12;
      let b = 8;

      if (lower.includes('power') || lower.includes('^')) {
        op = 'power';
        a = 2;
        b = 10;
      } else if (lower.includes('divide') || lower.includes('/')) {
        op = 'divide';
        a = 100;
        b = 4;
      } else if (lower.includes('add') || lower.includes('+')) {
        op = 'add';
        a = 45;
        b = 55;
      }

      // Extract numbers if present
      const numbers = userText.match(/\d+(\.\d+)?/g);
      if (numbers && numbers.length >= 2) {
        a = Number(numbers[0]);
        b = Number(numbers[1]);
      }

      return this.executeAndSynthesize(
        assistantMsg,
        mathTool.name,
        { operation: op, a, b },
        `I called the \`${mathTool.name}\` tool to evaluate your expression.`,
        onProgress
      );
    }

    if (sysTool && isSys) {
      return this.executeAndSynthesize(
        assistantMsg,
        sysTool.name,
        { unit: 'GB', includeNetwork: true },
        `I queried the current system metrics using the \`${sysTool.name}\` MCP tool.`,
        onProgress
      );
    }

    if (userTool && isUserGen) {
      const countMatch = userText.match(/\d+/);
      const count = countMatch ? Number(countMatch[0]) : 4;

      return this.executeAndSynthesize(
        assistantMsg,
        userTool.name,
        { count, role: 'developer' },
        `I invoked \`${userTool.name}\` to generate ${count} mock developer records.`,
        onProgress
      );
    }

    // Default response if no tool matched
    assistantMsg.content = `I understand you said: "${userText}".\n\nI have access to ${tools.length} MCP tools: ${tools.map((t) => `\`${t.name}\``).join(', ')}. Ask me to calculate numbers, inspect system health, or generate test records!`;
    onProgress({ ...assistantMsg });
    return assistantMsg;
  }

  // --- Helper: Execute Tool and synthesize response ---
  private static async executeAndSynthesize(
    assistantMsg: ChatMessage,
    toolName: string,
    args: Record<string, any>,
    summaryPrefix: string,
    onProgress: (msg: ChatMessage) => void
  ): Promise<ChatMessage> {
    const toolCallId = `call-${Date.now()}`;
    const toolCall: ChatToolCall = {
      id: toolCallId,
      name: toolName,
      args,
      status: 'calling'
    };

    assistantMsg.toolCalls = [toolCall];
    assistantMsg.content = `Analyzing request and executing MCP tool: \`${toolName}\`...`;
    onProgress({ ...assistantMsg });

    const start = Date.now();
    try {
      const result = await api.callTool(toolName, args);
      const latencyMs = result.latencyMs !== undefined ? result.latencyMs : Date.now() - start;

      toolCall.status = 'success';
      toolCall.result = result;
      toolCall.latencyMs = latencyMs;

      let resultText = '';
      if (result.content?.[0]?.text) {
        resultText = result.content[0].text;
      } else if (result.structuredData) {
        resultText = JSON.stringify(result.structuredData, null, 2);
      } else {
        resultText = JSON.stringify(result, null, 2);
      }

      assistantMsg.content = `${summaryPrefix}\n\n${resultText}`;
      onProgress({ ...assistantMsg });
    } catch (err: any) {
      toolCall.status = 'error';
      toolCall.error = err.message || 'Execution error';
      assistantMsg.content = `Attempted to call \`${toolName}\`, but encountered an error: ${toolCall.error}`;
      onProgress({ ...assistantMsg });
    }

    return assistantMsg;
  }

  // --- Provider: Google Gemini with Function Calling ---
  private static async handleGeminiChat(
    userText: string,
    history: ChatMessage[],
    tools: ToolItem[],
    config: ChatConfig,
    assistantMsg: ChatMessage,
    onProgress: (msg: ChatMessage) => void
  ): Promise<ChatMessage> {
    if (!config.apiKey) {
      throw new Error('Please provide a Google Gemini API Key in Chat Settings.');
    }

    // Format tools for Gemini API
    const functionDeclarations = tools.map((t) => {
      // Clean schema properties for Gemini
      const cleanProps: Record<string, any> = {};
      const props = t.inputSchema?.properties || {};
      for (const [key, val] of Object.entries<any>(props)) {
        cleanProps[key] = {
          type: val.type?.toUpperCase() || 'STRING',
          description: val.description || ''
        };
        if (val.enum) cleanProps[key].enum = val.enum;
      }

      return {
        name: t.name,
        description: t.description || `Tool ${t.name}`,
        parameters: {
          type: 'OBJECT',
          properties: cleanProps,
          required: t.inputSchema?.required || []
        }
      };
    });

    const modelName = config.model || 'gemini-2.0-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${config.apiKey}`;

    // Build contents
    const contents: any[] = [];
    history.forEach((m) => {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      });
    });
    contents.push({
      role: 'user',
      parts: [{ text: userText }]
    });

    const reqBody: any = {
      contents,
      tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
      generationConfig: {
        temperature: config.temperature ?? 0.7
      }
    };

    if (config.systemPrompt) {
      reqBody.systemInstruction = {
        parts: [{ text: config.systemPrompt }]
      };
    }

    assistantMsg.content = 'Thinking with Gemini...';
    onProgress({ ...assistantMsg });

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini API error (${res.status})`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    // Check for Function Call
    const callPart = parts.find((p: any) => p.functionCall);
    if (callPart) {
      const fn = callPart.functionCall;
      const toolName = fn.name;
      const args = fn.args || {};

      const toolCall: ChatToolCall = {
        id: `call-${Date.now()}`,
        name: toolName,
        args,
        status: 'calling'
      };
      assistantMsg.toolCalls = [toolCall];
      assistantMsg.content = `Calling MCP Tool: \`${toolName}\`...`;
      onProgress({ ...assistantMsg });

      // Execute via MCP
      const start = Date.now();
      try {
        const toolResult = await api.callTool(toolName, args);
        toolCall.status = 'success';
        toolCall.result = toolResult;
        toolCall.latencyMs = toolResult.latencyMs || Date.now() - start;

        // Send tool response back to Gemini for final answer
        contents.push(candidate.content);
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: toolName,
                response: {
                  output: toolResult.content?.[0]?.text || toolResult.structuredData || toolResult
                }
              }
            }
          ]
        });

        const secondRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents })
        });

        if (secondRes.ok) {
          const secondData = await secondRes.json();
          const finalCandidate = secondData.candidates?.[0];
          const textPart = finalCandidate?.content?.parts?.find((p: any) => p.text);
          assistantMsg.content = textPart?.text || 'Tool executed successfully.';
        } else {
          assistantMsg.content = `Tool executed: ${toolResult.content?.[0]?.text || JSON.stringify(toolResult.structuredData)}`;
        }
      } catch (err: any) {
        toolCall.status = 'error';
        toolCall.error = err.message;
        assistantMsg.content = `Error executing tool: ${err.message}`;
      }
    } else {
      const textPart = parts.find((p: any) => p.text);
      assistantMsg.content = textPart?.text || 'No response returned from model.';
    }

    onProgress({ ...assistantMsg });
    return assistantMsg;
  }

  // --- Provider: OpenAI / Ollama compatible endpoint ---
  private static async handleOpenAIChat(
    userText: string,
    history: ChatMessage[],
    tools: ToolItem[],
    config: ChatConfig,
    assistantMsg: ChatMessage,
    onProgress: (msg: ChatMessage) => void
  ): Promise<ChatMessage> {
    const isOllama = config.provider === 'ollama';
    const baseUrl = config.endpoint || (isOllama ? 'http://localhost:11434/v1' : 'https://api.openai.com/v1');
    const model = config.model || (isOllama ? 'llama3.1' : 'gpt-4o-mini');

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const formattedTools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description || '',
        parameters: t.inputSchema
      }
    }));

    const messages: any[] = [];
    if (config.systemPrompt) {
      messages.push({ role: 'system', content: config.systemPrompt });
    }
    history.forEach((m) => {
      messages.push({ role: m.role, content: m.content });
    });
    messages.push({ role: 'user', content: userText });

    assistantMsg.content = `Connecting to ${isOllama ? 'Ollama' : 'OpenAI'} (${model})...`;
    onProgress({ ...assistantMsg });

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        tools: formattedTools.length > 0 ? formattedTools : undefined,
        temperature: config.temperature ?? 0.7
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error (${res.status})`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    const message = choice?.message;

    if (message?.tool_calls?.length > 0) {
      const tc = message.tool_calls[0];
      const toolName = tc.function.name;
      let args = {};
      try {
        args = JSON.parse(tc.function.arguments);
      } catch (e) {
        args = {};
      }

      const toolCall: ChatToolCall = {
        id: tc.id || `call-${Date.now()}`,
        name: toolName,
        args,
        status: 'calling'
      };
      assistantMsg.toolCalls = [toolCall];
      assistantMsg.content = `Calling tool: \`${toolName}\`...`;
      onProgress({ ...assistantMsg });

      try {
        const toolResult = await api.callTool(toolName, args);
        toolCall.status = 'success';
        toolCall.result = toolResult;

        const outputStr = toolResult.content?.[0]?.text || JSON.stringify(toolResult.structuredData || toolResult);
        messages.push(message);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: outputStr
        });

        // Second turn
        const secondRes = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ model, messages })
        });

        if (secondRes.ok) {
          const secondData = await secondRes.json();
          assistantMsg.content = secondData.choices?.[0]?.message?.content || outputStr;
        } else {
          assistantMsg.content = outputStr;
        }
      } catch (err: any) {
        toolCall.status = 'error';
        toolCall.error = err.message;
        assistantMsg.content = `Tool execution failed: ${err.message}`;
      }
    } else {
      assistantMsg.content = message?.content || 'No text response received.';
    }

    onProgress({ ...assistantMsg });
    return assistantMsg;
  }
}
