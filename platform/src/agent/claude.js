'use strict';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

const SUBMIT_TOOL = {
  name: 'submit_diagnosis',
  description: 'Submit your root cause diagnosis and proposed fix.',
  input_schema: {
    type: 'object',
    required: ['root_cause', 'file_path', 'fixed_content', 'explanation'],
    properties: {
      root_cause:    { type: 'string', description: 'One paragraph: what broke, why, what the evidence shows.' },
      file_path:     { type: 'string', description: 'Repo-relative path to the file that needs fixing.' },
      fixed_content: { type: 'string', description: 'The complete corrected file content.' },
      explanation:   { type: 'string', description: 'One sentence describing what the fix changes.' },
    },
  },
};

/**
 * Stream a Claude diagnosis via SSE with extended thinking.
 * Calls onEvent({ type, ... }) for each meaningful event.
 * Types: 'thinking' (CoT stream), 'text' (reasoning prose), 'diagnosis' (structured result), 'error', 'done'
 */
async function streamDiagnosis(apiKey, systemPrompt, userMessage, onEvent) {
  console.log('[claude] starting diagnosis stream, model=%s', MODEL);

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'interleaved-thinking-2025-05-14',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 32000,
      stream: true,
      system: systemPrompt,
      thinking: { type: 'enabled', budget_tokens: 10000 },
      tools: [SUBMIT_TOOL],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[claude] API error %d: %s', res.status, body.slice(0, 300));
    onEvent({ type: 'error', message: `Anthropic API ${res.status}: ${body}` });
    return;
  }

  if (!res.body) {
    onEvent({ type: 'error', message: 'No response body from Anthropic API' });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let lineBuffer = '';
  let toolInput = '';
  let currentBlockType = null;
  let eventCount = 0;

  console.log('[claude] stream connected, reading events...');

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Accumulate partial data across chunks — the key fix
    lineBuffer += decoder.decode(value, { stream: true });
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop() ?? ''; // keep last (potentially incomplete) line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]' || !raw) continue;

      let evt;
      try { evt = JSON.parse(raw); } catch { continue; }
      eventCount++;

      if (evt.type === 'content_block_start') {
        currentBlockType = evt.content_block?.type ?? null;
        if (currentBlockType === 'tool_use') {
          toolInput = '';
        }
      } else if (evt.type === 'content_block_delta') {
        const delta = evt.delta;
        if (delta?.type === 'thinking_delta') {
          onEvent({ type: 'thinking', text: delta.thinking });
        } else if (delta?.type === 'text_delta') {
          onEvent({ type: 'text', text: delta.text });
        } else if (delta?.type === 'input_json_delta') {
          toolInput += delta.partial_json ?? '';
        }
      } else if (evt.type === 'content_block_stop') {
        if (currentBlockType === 'tool_use') {
          try {
            const result = JSON.parse(toolInput);
            console.log('[claude] diagnosis received: file=%s', result.file_path);
            onEvent({ type: 'diagnosis', result });
          } catch {
            console.error('[claude] failed to parse tool input (%d chars)', toolInput.length);
            onEvent({ type: 'error', message: 'Failed to parse diagnosis from Claude' });
          }
          toolInput = '';
        }
        currentBlockType = null;
      } else if (evt.type === 'message_stop') {
        onEvent({ type: 'done' });
      } else if (evt.type === 'error') {
        const msg = evt.error?.message ?? 'Stream error';
        console.error('[claude] stream error: %s', msg);
        onEvent({ type: 'error', message: msg });
      }
    }
  }

  // Process any remaining data in the buffer
  if (lineBuffer.startsWith('data: ')) {
    const raw = lineBuffer.slice(6).trim();
    if (raw && raw !== '[DONE]') {
      try {
        const evt = JSON.parse(raw);
        if (evt.type === 'message_stop') {
          onEvent({ type: 'done' });
        }
      } catch { /* incomplete, ignore */ }
    }
  }

  console.log('[claude] stream ended, %d events processed', eventCount);
}

module.exports = { streamDiagnosis };
