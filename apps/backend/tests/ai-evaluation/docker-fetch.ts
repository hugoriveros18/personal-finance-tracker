import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Run synthetic provider HTTP calls inside the existing backend's Docker network.
// This avoids publishing Ollama or changing running services for a local evaluation.
const bridge = `
const chunks=[];
for await (const chunk of process.stdin) chunks.push(chunk);
const input=JSON.parse(Buffer.concat(chunks).toString());
const response=await fetch(input.url, { method:input.method, headers:input.headers,
  body:input.body, signal:AbortSignal.timeout(120000) });
process.stdout.write(JSON.stringify({status:response.status,body:await response.text()}));
`;
export const dockerFetch: typeof fetch = async (url, init) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      [
        'compose',
        '-f',
        'docker-compose.yml',
        '-f',
        'docker-compose.ollama.yml',
        'exec',
        '-T',
        'backend',
        'node',
        '--input-type=module',
        '-e',
        bridge,
      ],
      {
        cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    let output = '';
    let errors = '';
    const abort = () => {
      child.kill();
      reject(init?.signal?.reason ?? new Error('Aborted'));
    };
    init?.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
      if (output.length > 256_000) {
        child.kill();
        reject(new Error('Oversized bridge response'));
      }
    });
    child.stderr.on('data', (chunk) => {
      errors += String(chunk);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      init?.signal?.removeEventListener('abort', abort);
      if (code !== 0) {
        reject(new TypeError(`Docker provider request failed: ${errors.slice(0, 500)}`));
        return;
      }
      try {
        const result = JSON.parse(output) as { status: number; body: string };
        resolve(new Response(result.body, { status: result.status }));
      } catch (error) {
        reject(error);
      }
    });
    if (init?.signal?.aborted) {
      abort();
      return;
    }
    child.stdin.end(
      JSON.stringify({
        url: String(url),
        method: init?.method ?? 'GET',
        headers: init?.headers,
        body: init?.body,
      }),
    );
  });
