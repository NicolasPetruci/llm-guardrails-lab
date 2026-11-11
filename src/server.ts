import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { type Encoding, type ModelBehavior } from './llm.js';
import { redact } from './redact.js';
import { customCase, loadCases, runDetailed } from './suite.js';

/**
 * Servidor local só para a tela de demonstração. Ele chama exatamente o
 * mesmo pipeline que os testes usam; a tela não reimplementa nada.
 * Escuta apenas em 127.0.0.1.
 */

const PORT = Number(process.env.PORT ?? 3100);
const MAX_BODY_BYTES = 20_000;
const MAX_PAYLOAD_CHARS = 4_000;
const ENCODINGS: Encoding[] = ['plain', 'upper', 'spaced', 'base64', 'reversed', 'hex'];

function parseBehavior(raw: unknown): ModelBehavior | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const b = raw as Record<string, unknown>;
  switch (b.kind) {
    case 'benign':
    case 'paraphrase_system_prompt':
    case 'echo_input':
      return { kind: b.kind };
    case 'leak_system_prompt':
      return ENCODINGS.includes(b.encoding as Encoding) ? { kind: b.kind, encoding: b.encoding as Encoding } : null;
    case 'emit_text':
      return typeof b.text === 'string' && b.text.length <= MAX_PAYLOAD_CHARS ? { kind: b.kind, text: b.text } : null;
    default:
      return null;
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('corpo grande demais'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

const unique = (values: string[]): string[] => [...new Set(values)];

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/cases') {
    const cases = await Promise.all(
      loadCases().map(async (c) => {
        const run = await runDetailed(c);
        return {
          id: c.id,
          category: c.category,
          risk: c.risk,
          payload: c.payload,
          behavior: c.behavior,
          knownGap: c.knownGap ?? null,
          unprotectedLeaked: run.unprotectedLeaked,
          guardedLeaked: run.guardedLeaked,
          guardedStatus: run.guarded.status,
        };
      }),
    );
    return send(res, 200, cases);
  }

  if (req.method === 'POST' && url.pathname === '/run') {
    const body = (await readJson(req)) as { payload?: unknown; behavior?: unknown; caseId?: unknown };
    const behavior = parseBehavior(body.behavior);
    if (typeof body.payload !== 'string' || body.payload.length === 0 || body.payload.length > MAX_PAYLOAD_CHARS || !behavior) {
      return send(res, 400, { erro: 'Envie "payload" (texto de até 4000 caracteres) e um "behavior" válido.' });
    }

    const preset = loadCases().find((c) => c.id === body.caseId);
    const testCase = preset && preset.payload === body.payload ? preset : customCase(body.payload, behavior);
    // Se a pessoa mudou o comportamento de um caso pronto, ele vira personalizado.
    const effective = preset && JSON.stringify(preset.behavior) === JSON.stringify(behavior) ? testCase : customCase(body.payload, behavior);

    const run = await runDetailed(effective);

    // Todo trecho que o redator reconhece, para a tela destacar nos dois lados.
    const pii = unique([
      ...redact(body.payload).matched,
      ...redact(run.unprotected.output).matched,
      ...redact(run.guarded.trace?.rawOutput ?? '').matched,
    ]);

    return send(res, 200, {
      risk: effective.risk,
      knownGap: effective.knownGap ?? null,
      systemPrompt: run.systemPrompt,
      canary: run.canary,
      pii,
      unprotected: {
        sentToModel: run.unprotected.sentToModel,
        output: run.unprotected.output,
        leaked: run.unprotectedLeaked,
        leakForm: run.unprotectedLeakForm,
      },
      guarded: {
        sentToModel: run.guarded.sentToModel,
        rawOutput: run.guarded.trace?.rawOutput ?? '',
        output: run.guarded.output,
        status: run.guarded.status,
        canaryFound: run.guarded.trace?.canaryFound ?? false,
        entities: run.guarded.trace?.entities ?? [],
        leaked: run.guardedLeaked,
        leakForm: run.guardedLeakForm,
      },
    });
  }

  return send(res, 404, { erro: 'Rota não encontrada.' });
}

createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    send(res, 400, { erro: error instanceof Error ? error.message : 'Erro inesperado.' });
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`llm-guardrails-lab: servidor da demonstração em http://127.0.0.1:${PORT}`);
});
