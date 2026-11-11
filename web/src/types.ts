export type Encoding = 'plain' | 'upper' | 'spaced' | 'base64' | 'reversed' | 'hex';

export type Behavior =
  | { kind: 'benign' }
  | { kind: 'leak_system_prompt'; encoding: Encoding }
  | { kind: 'paraphrase_system_prompt' }
  | { kind: 'echo_input' }
  | { kind: 'emit_text'; text: string };

export type Risk = 'prompt' | 'pii' | 'parafrase' | 'nenhum';
export type LeakForm = 'texto' | 'invertido' | 'base64' | 'hexadecimal';

export interface CaseSummary {
  id: string;
  category: 'direta' | 'indireta' | 'legitima';
  risk: Risk;
  payload: string;
  behavior: Behavior;
  knownGap: string | null;
  unprotectedLeaked: boolean;
  guardedLeaked: boolean;
  guardedStatus: 'ok' | 'blocked';
}

export interface Entity {
  type: string;
  placeholder: string;
  value: string;
}

export interface RunResult {
  risk: Risk;
  knownGap: string | null;
  systemPrompt: string;
  canary: string;
  /** Trechos que o redator reconhece, para destacar nos dois lados. */
  pii: string[];
  unprotected: {
    sentToModel: { system: string; user: string };
    output: string;
    leaked: boolean;
    leakForm: LeakForm | null;
  };
  guarded: {
    sentToModel: { system: string; user: string };
    rawOutput: string;
    output: string;
    status: 'ok' | 'blocked';
    canaryFound: boolean;
    entities: Entity[];
    leaked: boolean;
    leakForm: LeakForm | null;
  };
}
