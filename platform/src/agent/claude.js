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
 * Stream a Claude diagnosis via SSE.
 * Calls onEvent({ type, ... }) for each meaningful event.
 * Types: 'text' (streaming prose), 'tool_result' (diagnosis object), 'error'
 */
async function streamDiagnosis(apiKey, systemPrompt, userMessage, onEvent) {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      stream: true,
      system: systemPrompt,
      tools: [SUBMIT_TOOL],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    onEvent({ type: 'error', message: `Anthropic API ${res.status}: ${body}` });
    return;
  }

  let toolInput = '';
  let inToolUse = false;

  for await (const chunk of res.body) {
    const text = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]' || !raw) continue;

      let evt;
      try { evt = JSON.parse(raw); } catch { continue; }

      if (evt.type === 'content_block_delta') {
        const delta = evt.delta;
        if (delta?.type === 'text_delta') {
          onEvent({ type: 'text', text: delta.text });
        } else if (delta?.type === 'input_json_delta') {
          inToolUse = true;
          toolInput += delta.partial_json ?? '';
        }
      } else if (evt.type === 'content_block_stop' && inToolUse) {
        try {
          const result = JSON.parse(toolInput);
          onEvent({ type: 'diagnosis', result });
        } catch {
          onEvent({ type: 'error', message: 'Failed to parse tool result' });
        }
        toolInput = '';
        inToolUse = false;
      } else if (evt.type === 'message_stop') {
        onEvent({ type: 'done' });
      } else if (evt.type === 'error') {
        onEvent({ type: 'error', message: evt.error?.message ?? 'Stream error' });
      }
    }
  }
}

module.exports = { streamDiagnosis };
