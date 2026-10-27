import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatSandboxService } from './chat-service';
import { api } from './api';
import { ChatConfig, ToolItem } from '../types';

vi.mock('./api', () => ({
  api: {
    callTool: vi.fn()
  }
}));

const mockedCallTool = vi.mocked(api.callTool);

const mathTool: ToolItem = {
  name: 'math_calculator',
  description: 'Performs arithmetic calculations',
  inputSchema: {
    type: 'object',
    properties: {
      operation: { type: 'string', description: 'The math operation to perform' },
      a: { type: 'number', description: 'First operand' },
      b: { type: 'number', description: 'Second operand' }
    },
    required: ['operation', 'a', 'b']
  }
};

const mockConfig: ChatConfig = { provider: 'mock', model: 'heuristic' };

describe('ChatSandboxService.sendUserMessage (mock provider)', () => {
  beforeEach(() => {
    mockedCallTool.mockReset();
  });

  it('routes a math request to the calculator tool and reports the result', async () => {
    mockedCallTool.mockResolvedValue({
      content: [{ type: 'text', text: 'Calculation Result: 12 multiply 8 = 96' }],
      latencyMs: 4
    });
    const onProgress = vi.fn();

    const msg = await ChatSandboxService.sendUserMessage(
      'please calculate 12 multiply 8',
      [],
      [mathTool],
      mockConfig,
      onProgress
    );

    expect(mockedCallTool).toHaveBeenCalledWith('math_calculator', {
      operation: 'multiply',
      a: 12,
      b: 8
    });
    expect(msg.toolCalls).toHaveLength(1);
    expect(msg.toolCalls?.[0].name).toBe('math_calculator');
    expect(msg.toolCalls?.[0].status).toBe('success');
    expect(msg.toolCalls?.[0].latencyMs).toBe(4);
    expect(msg.content).toContain('96');
    expect(onProgress).toHaveBeenCalled();
  });

  it('reports a tool execution error in the assistant message instead of throwing', async () => {
    mockedCallTool.mockRejectedValue(new Error('Tool not found: math_calculator'));

    const msg = await ChatSandboxService.sendUserMessage(
      'calculate 1 plus 1',
      [],
      [mathTool],
      mockConfig,
      vi.fn()
    );

    expect(msg.toolCalls?.[0].status).toBe('error');
    expect(msg.toolCalls?.[0].error).toBe('Tool not found: math_calculator');
    expect(msg.content).toContain('Tool not found: math_calculator');
  });

  it('answers with the available tool list when no tool matches the request', async () => {
    const msg = await ChatSandboxService.sendUserMessage(
      'hello there',
      [],
      [mathTool],
      mockConfig,
      vi.fn()
    );

    expect(mockedCallTool).not.toHaveBeenCalled();
    expect(msg.content).toContain('math_calculator');
  });
});

describe('ChatSandboxService.sendUserMessage (gemini provider)', () => {
  it('rejects with a helpful error when the Gemini API key is missing', async () => {
    const config: ChatConfig = { provider: 'gemini', model: 'gemini-2.0-flash' };

    await expect(
      ChatSandboxService.sendUserMessage('hi', [], [], config, vi.fn())
    ).rejects.toThrow('Gemini API Key');
  });
});
