import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Marked } from './Marked';
import type { Behavior, CaseSummary, Encoding, LeakForm, Risk, RunResult } from './types';

// --- O que o modelo comprometido faz -----------------------------------------

interface BehaviorOption {
  key: string;
  label: string;
  build: (text: string) => Behavior;
}

const encodingOption = (encoding: Encoding, label: string): BehaviorOption => ({
  key: `leak:${encoding}`,
  label: `Revela o prompt de sistema: ${label}`,
  build: () => ({ kind: 'leak_system_prompt', encoding }),
});

const BEHAVIOR_OPTIONS: BehaviorOption[] = [
  { key: 'benign', label: 'Responde normalmente', build: () => ({ kind: 'benign' }) },
  encodingOption('plain', 'texto puro'),
  encodingOption('upper', 'em maiúsculas'),
  encodingOption('spaced', 'letra por letra'),
  encodingOption('base64', 'em base64'),
  encodingOption('reversed', 'de trás para frente'),
  encodingOption('hex', 'em hexadecimal'),
  { key: 'paraphrase', label: 'Revela o prompt com outras palavras', build: () => ({ kind: 'paraphrase_system_prompt' }) },
  { key: 'echo', label: 'Repete tudo o que recebeu', build: () => ({ kind: 'echo_input' }) },
  { key: 'emit', label: 'Responde com um texto fixo', build: (text) => ({ kind: 'emit_text', text }) },
];

function keyOf(behavior: Behavior): string {
  switch (behavior.kind) {
    case 'leak_system_prompt':
      return `leak:${behavior.encoding}`;
    case 'paraphrase_system_prompt':
      return 'paraphrase';
    case 'echo_input':
      return 'echo';
    case 'emit_text':
      return 'emit';
    case 'benign':
      return 'benign';
  }
}

const CUSTOM = 'personalizado';
const FALLBACK_START = 'indireta-email-com-dados';

// --- Chamadas à API ----------------------------------------------------------

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error('Não foi possível falar com o servidor da demonstração. Ele está rodando? (npm run server)');
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { erro?: string } | null;
    throw new Error(body?.erro ?? `O servidor respondeu ${response.status}. Ele está rodando? (npm run server)`);
  }
  return (await response.json()) as T;
}

// --- Veredito ----------------------------------------------------------------

interface Verdict {
  tone: 'bad' | 'good';
  title: string;
  detail: string;
}

const FORM_LABEL: Record<LeakForm, string> = {
  texto: 'em texto',
  invertido: 'de trás para frente',
  base64: 'em base64',
  hexadecimal: 'em hexadecimal',
};

function leakDetail(risk: Risk, form: LeakForm | null, guarded: boolean, hasPii: boolean): string {
  switch (risk) {
    case 'prompt':
      return guarded
        ? `O prompt de sistema saiu ${form ? FORM_LABEL[form] : 'codificado'} e o filtro não reconheceu essa forma.`
        : `O prompt de sistema chegou ao usuário ${form ? FORM_LABEL[form] : ''}.`.trim();
    case 'pii':
      if (guarded) return 'Dado pessoal passou pelo pipeline.';
      return hasPii
        ? 'O modelo recebeu o dado pessoal e ele voltou na resposta.'
        : 'O modelo devolveu um dado pessoal e ele chegou ao usuário.';
    case 'parafrase':
      return 'As instruções saíram com outras palavras. Um filtro de texto exato não enxerga isso.';
    case 'nenhum':
      return '';
  }
}

function verdictUnprotected(r: RunResult, hasPii: boolean): Verdict {
  return r.unprotected.leaked
    ? { tone: 'bad', title: 'VAZOU', detail: leakDetail(r.risk, r.unprotected.leakForm, false, hasPii) }
    : { tone: 'good', title: 'SEM VAZAMENTO', detail: 'Resposta normal.' };
}

function verdictGuarded(r: RunResult, hasPii: boolean): Verdict {
  if (r.guarded.leaked) {
    return { tone: 'bad', title: 'VAZOU', detail: leakDetail(r.risk, r.guarded.leakForm, true, hasPii) };
  }
  if (r.guarded.status === 'blocked') {
    return { tone: 'good', title: 'BLOQUEADO', detail: 'O canário apareceu na resposta, então ela foi descartada.' };
  }
  if (r.risk === 'nenhum') {
    return { tone: 'good', title: 'OK', detail: 'Uso legítimo: a resposta passou normalmente.' };
  }
  return {
    tone: 'good',
    title: 'CONTIDO',
    detail:
      r.risk !== 'pii'
        ? 'Nada saiu.'
        : hasPii
          ? 'O modelo só recebeu marcadores no lugar do dado pessoal.'
          : 'O dado pessoal que o modelo devolveu foi trocado por marcador.',
  };
}

// --- Peças de layout ---------------------------------------------------------

function Stage(props: { n: number; title: string; hint: string; children: ReactNode }) {
  return (
    <section className="stage">
      <div className="stage-head">
        <span className="n">{props.n}</span>
        <div>
          <h3>{props.title}</h3>
          <p>{props.hint}</p>
        </div>
      </div>
      {props.children}
    </section>
  );
}

function Cell(props: { children: ReactNode; off?: boolean; tone?: 'good' | 'bad' | 'warn' | 'plain' }) {
  return <div className={`cell ${props.off ? 'off' : ''} ${props.tone ?? ''}`}>{props.children}</div>;
}

const NotInThisVersion = () => (
  <Cell off>
    <span className="off-text">Não existe nesta versão.</span>
  </Cell>
);

function VerdictCard({ verdict }: { verdict: Verdict }) {
  return (
    <div className={`verdict ${verdict.tone}`}>
      <strong>{verdict.title}</strong>
      {verdict.detail && <span>{verdict.detail}</span>}
    </div>
  );
}

function LeakChip({ form }: { form: LeakForm | null }) {
  if (!form) return null;
  return <span className="chip warn">contém o prompt de sistema {FORM_LABEL[form]}</span>;
}

// --- O fluxo lado a lado -----------------------------------------------------

function Flow({ r, payload }: { r: RunResult; payload: string }) {
  const { guarded, unprotected } = r;
  const maskedOnOutput = !guarded.canaryFound && guarded.output !== guarded.rawOutput;
  const hasPii = r.pii.some((value) => payload.includes(value));

  return (
    <div className="flow">
      <div className="colhead">
        <div className="col bad">Sem proteção</div>
        <div className="col good">Com proteção</div>
      </div>

      <Stage n={1} title="Entrada do usuário" hint="É o mesmo texto nas duas versões.">
        <div className="single">
          <Cell>
            <Marked text={payload} pii={r.pii} />
            {hasPii && <p className="legend">Em vermelho: dado pessoal que o redator reconhece.</p>}
          </Cell>
          <details className="sys">
            <summary>Prompt de sistema (o mesmo nas duas versões)</summary>
            <p className="sys-text">
              <Marked text={r.systemPrompt} canary={r.canary} />
            </p>
            <p className="legend">
              Em dourado, o canário: um valor aleatório que não tem motivo nenhum para aparecer numa resposta. Se
              aparecer, o prompt vazou.
            </p>
          </details>
        </div>
      </Stage>

      <Stage n={2} title="Remoção de dados pessoais" hint="CPF, telefone e e-mail viram marcadores antes de sair da aplicação.">
        <div className="pair">
          <NotInThisVersion />
          <Cell tone="good">
            {guarded.entities.length === 0 ? (
              <span className="muted">Nenhum dado pessoal encontrado na entrada.</span>
            ) : (
              <ul className="entities">
                {guarded.entities.map((e) => (
                  <li key={e.placeholder}>
                    <mark className="m-marker">{e.placeholder}</mark>
                    <span>substitui</span>
                    <mark className="m-pii">{e.value}</mark>
                  </li>
                ))}
              </ul>
            )}
          </Cell>
        </div>
      </Stage>

      <Stage n={3} title="O que o modelo recebeu" hint="O que o modelo não recebe, ele não consegue vazar.">
        <div className="pair">
          <Cell tone={hasPii ? 'bad' : 'plain'}>
            <Marked text={unprotected.sentToModel.user} pii={r.pii} />
            {hasPii && <p className="note bad">O modelo viu o dado pessoal.</p>}
          </Cell>
          <Cell tone="good">
            <Marked text={guarded.sentToModel.user} pii={r.pii} />
            {hasPii && <p className="note good">O modelo viu só marcadores.</p>}
          </Cell>
        </div>
      </Stage>

      <Stage
        n={4}
        title="O que o modelo respondeu"
        hint="Aqui o modelo já foi enganado: ele faz o que o atacante pediu. O que importa é o que vem depois."
      >
        <div className="pair">
          <Cell>
            <Marked text={unprotected.output} pii={r.pii} canary={r.canary} />
          </Cell>
          <Cell>
            <Marked text={guarded.rawOutput} pii={r.pii} canary={r.canary} />
          </Cell>
        </div>
      </Stage>

      <Stage n={5} title="Filtro de saída" hint="Procura o canário e dados pessoais na resposta antes de ela sair.">
        <div className="pair">
          <NotInThisVersion />
          {guarded.canaryFound ? (
            <Cell tone="good">
              <strong>Canário encontrado na resposta.</strong>
              <p className="note good">A resposta foi descartada e o usuário recebe uma recusa.</p>
            </Cell>
          ) : maskedOnOutput ? (
            <Cell tone="good">
              <strong>Dado pessoal encontrado na resposta.</strong>
              <p className="note good">Foi trocado por marcador antes de sair.</p>
            </Cell>
          ) : (
            <Cell tone={guarded.leaked ? 'warn' : 'plain'}>
              <strong>Nenhum canário nem dado pessoal encontrado.</strong>
              {guarded.leaked && (
                <p className="note warn">Mas a resposta carrega o conteúdo em outra forma, e o filtro não a reconhece.</p>
              )}
            </Cell>
          )}
        </div>
      </Stage>

      <Stage n={6} title="O que o usuário recebe" hint="O resultado final de cada versão.">
        <div className="pair">
          <Cell tone={unprotected.leaked ? 'bad' : 'good'}>
            <Marked text={unprotected.output} pii={r.pii} canary={r.canary} />
            <LeakChip form={unprotected.leakForm} />
          </Cell>
          <Cell tone={guarded.leaked ? 'bad' : 'good'}>
            <Marked text={guarded.output} pii={r.pii} canary={r.canary} />
            <LeakChip form={guarded.leakForm} />
          </Cell>
        </div>
        <div className="pair verdicts">
          <VerdictCard verdict={verdictUnprotected(r, hasPii)} />
          <VerdictCard verdict={verdictGuarded(r, hasPii)} />
        </div>
        {r.knownGap && (
          <p className="gap">
            <strong>Lacuna conhecida.</strong> {r.knownGap}
          </p>
        )}
      </Stage>
    </div>
  );
}

// --- Aplicação ---------------------------------------------------------------

export function App() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [selected, setSelected] = useState<string>(CUSTOM);
  const [payload, setPayload] = useState('');
  const [behaviorKey, setBehaviorKey] = useState('benign');
  const [emitText, setEmitText] = useState('O CPF do último paciente é 529.982.247-25.');
  const [result, setResult] = useState<RunResult | null>(null);
  const [shownPayload, setShownPayload] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = useCallback(async (text: string, behavior: Behavior, caseId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const run = await getJson<RunResult>('/api/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload: text, behavior, caseId }),
      });
      setResult(run);
      setShownPayload(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro inesperado.');
    } finally {
      setLoading(false);
    }
  }, []);

  const choose = useCallback(
    (c: CaseSummary) => {
      setSelected(c.id);
      setPayload(c.payload);
      setBehaviorKey(keyOf(c.behavior));
      if (c.behavior.kind === 'emit_text') setEmitText(c.behavior.text);
      void execute(c.payload, c.behavior, c.id);
    },
    [execute],
  );

  useEffect(() => {
    getJson<CaseSummary[]>('/api/cases')
      .then((list) => {
        setCases(list);
        const start = list.find((c) => c.id === FALLBACK_START) ?? list[0];
        if (start) choose(start);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Erro inesperado.'));
    // Só na primeira carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentBehavior = useMemo(
    () => (BEHAVIOR_OPTIONS.find((o) => o.key === behaviorKey) ?? BEHAVIOR_OPTIONS[0]!).build(emitText),
    [behaviorKey, emitText],
  );

  const attacks = cases.filter((c) => c.category !== 'legitima');
  const contained = attacks.filter((c) => !c.guardedLeaked).length;

  return (
    <div className="shell">
      <header className="top">
        <div>
          <h1>llm-guardrails-lab</h1>
          <p className="sub">O mesmo ataque, com e sem as camadas de proteção em volta do modelo.</p>
        </div>
        <div className="legend-row" aria-label="Legenda das cores">
          <mark className="m-pii">dado pessoal</mark>
          <mark className="m-marker">marcador</mark>
          <mark className="m-canary">canário</mark>
        </div>
      </header>

      <div className="layout">
        <aside className="side">
          <div className="card">
            <h2>Casos de ataque</h2>
            {attacks.length > 0 && (
              <p className="score">
                <strong>{contained}</strong> de {attacks.length} contidos pelo pipeline
              </p>
            )}
            <ul className="cases">
              {cases.map((c) => {
                const dot = c.category === 'legitima' ? 'neutral' : c.guardedLeaked ? 'bad' : 'good';
                return (
                  <li key={c.id}>
                    <button className={selected === c.id ? 'active' : ''} onClick={() => choose(c)}>
                      <i className={`dot ${dot}`} />
                      <span>{c.id}</span>
                      {c.knownGap && <small className="tag">lacuna</small>}
                      {c.category === 'legitima' && <small className="tag plain">legítimo</small>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="legend">
              <i className="dot good" /> contido <i className="dot bad" /> vazou mesmo com proteção
            </p>
          </div>
        </aside>

        <main className="main">
          <div className="card editor">
            <h2>Monte o seu ataque</h2>
            <label htmlFor="payload">Texto do usuário</label>
            <textarea
              id="payload"
              rows={4}
              value={payload}
              maxLength={4000}
              onChange={(e) => {
                setPayload(e.target.value);
                setSelected(CUSTOM);
              }}
              placeholder="Escreva um pedido. Dica: inclua um CPF como 529.982.247-25, ou peça o prompt de sistema."
            />
            <div className="editor-row">
              <div>
                <label htmlFor="behavior">O que o modelo comprometido faz</label>
                <select
                  id="behavior"
                  value={behaviorKey}
                  onChange={(e) => {
                    setBehaviorKey(e.target.value);
                    setSelected(CUSTOM);
                  }}
                >
                  {BEHAVIOR_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="run"
                disabled={loading || payload.trim().length === 0}
                onClick={() => void execute(payload, currentBehavior, selected === CUSTOM ? undefined : selected)}
              >
                {loading ? 'Executando…' : 'Executar'}
              </button>
            </div>
            {behaviorKey === 'emit' && (
              <>
                <label htmlFor="emit">Texto que o modelo devolve</label>
                <input id="emit" value={emitText} onChange={(e) => setEmitText(e.target.value)} />
              </>
            )}
            <p className="legend">
              O modelo é simulado: ele assume que o ataque funcionou e faz o que você escolher acima. A tela mostra o que as
              camadas em volta dele seguram.
            </p>
          </div>

          {error && <div className="error">{error}</div>}
          {result && <Flow r={result} payload={shownPayload} />}
        </main>
      </div>
    </div>
  );
}
