import { describe, expect, it } from 'vitest';
import { isLocalOllamaUrl } from './local-config.js';

describe('Local provider configuration', () => {
  it.each([
    'http://127.0.0.1:11434',
    'http://localhost:11434',
    'http://[::1]:11434',
    'http://ollama:11434',
    'http://host.docker.internal:11434',
    'http://172.20.0.1:11434',
    'https://192.168.1.5',
    'http://10.0.0.1',
  ])('accepts local address %s', (url) => {
    expect(isLocalOllamaUrl(url)).toBe(true);
  });
  it.each([
    'https://ollama.com',
    'https://api.openai.com',
    'http://8.8.8.8',
    'http://172.15.0.1',
    'http://172.32.0.1',
    'http://localhost.evil.com',
    'http://user:password@localhost',
    'http://localhost/api',
    'http://localhost/?token=x',
    'file:///tmp/model',
  ])('rejects non-local or ambiguous address %s', (url) => {
    expect(isLocalOllamaUrl(url)).toBe(false);
  });
});
