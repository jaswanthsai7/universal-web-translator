import { BaseProvider } from './BaseProvider';
import { ProviderType } from '../types';
import { logger } from '../utils/logger';

export class CustomAPIProvider extends BaseProvider {
  readonly id: ProviderType = 'custom';
  readonly name: string = 'Custom AI / OpenAI / Ollama API';
  readonly supportsAutoDetect: boolean = true;

  private endpoint: string;
  private apiKey: string;
  private model: string;

  constructor(
    endpoint: string = 'https://api.openai.com/v1/chat/completions',
    apiKey: string = '',
    model: string = 'gpt-4o-mini'
  ) {
    super();
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.model = model || 'gpt-4o-mini';
  }

  updateConfig(endpoint: string, apiKey: string, model: string) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.model = model;
  }

  async translate(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<string[]> {
    if (texts.length === 0) return [];
    if (!this.endpoint) {
      throw new Error('Custom API endpoint is not configured');
    }

    const sl = sourceLanguage === 'auto' ? 'the source language' : sourceLanguage;
    const tl = targetLanguage;

    const systemPrompt = `You are a high-speed, accurate translator for dynamic websites and web UIs. Translate the following JSON array of strings from ${sl} to ${tl}.
RULES:
1. Preserve UI shortcuts, formatting, and variables.
2. Return ONLY a valid JSON array of strings matching the exact length and order of the input array.
3. Do NOT wrap in markdown code blocks like \`\`\`json. Output raw JSON array only.`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const payload = {
      model: this.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(texts) },
      ],
      temperature: 0.2,
    };

    const res = await this.fetchWithTimeout(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    }, 15000);

    if (!res.ok) {
      throw new Error(`Custom API returned ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim() || '';

    try {
      // Clean possible markdown code fence
      const cleanJson = rawContent.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed) && parsed.length === texts.length) {
        return parsed.map((item: any) => String(item));
      }
    } catch (parseErr) {
      logger.warn('Failed to parse JSON response from Custom AI API:', rawContent);
    }

    // If parsing failed or length mismatched, return original
    return texts;
  }
}
