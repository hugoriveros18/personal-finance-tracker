/** This experiment accepts loopback/private-network Ollama servers only. */
export function isLocalOllamaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
    if (url.pathname !== '/' || url.search || url.hash) return false;
    if (['localhost', '[::1]', 'ollama', 'host.docker.internal'].includes(host)) return true;
    const parts = host.split('.').map(Number);
    if (
      parts.length !== 4 ||
      parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    )
      return false;
    return (
      parts[0] === 127 ||
      parts[0] === 10 ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31)
    );
  } catch {
    return false;
  }
}
