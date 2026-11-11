/** Contrato mínimo de um modelo. Um adaptador para um provedor real implementa isto. */
export interface LlmRequest {
  system: string;
  user: string;
}

export interface LlmClient {
  complete(request: LlmRequest): Promise<string>;
}

export type Encoding = 'plain' | 'upper' | 'spaced' | 'base64' | 'reversed' | 'hex';

export type ModelBehavior =
  /** Responde algo inofensivo. */
  | { kind: 'benign' }
  /** Obedece ao atacante e devolve o prompt de sistema, na codificação pedida. */
  | { kind: 'leak_system_prompt'; encoding: Encoding }
  /** Devolve o prompt de sistema reescrito com outras palavras, sem o canário. */
  | { kind: 'paraphrase_system_prompt' }
  /** Repete tudo o que recebeu do usuário. */
  | { kind: 'echo_input' }
  /** Devolve um texto fixo (ex.: um dado pessoal que o modelo "lembrou"). */
  | { kind: 'emit_text'; text: string };

export function encode(text: string, encoding: Encoding): string {
  switch (encoding) {
    case 'plain':
      return text;
    case 'upper':
      return text.toUpperCase();
    case 'spaced':
      return [...text].join(' ');
    case 'base64':
      return Buffer.from(text, 'utf8').toString('base64');
    case 'reversed':
      return [...text].reverse().join('');
    case 'hex':
      return Buffer.from(text, 'utf8').toString('hex');
  }
}

/**
 * Modelo de pior caso.
 *
 * Não tenta imitar um LLM de verdade. Ele assume que o ataque FUNCIONOU e
 * que o modelo fez exatamente o que o atacante queria. A pergunta que a
 * suíte responde, então, não é "o modelo resiste?", e sim "se o modelo
 * for comprometido, o que as camadas em volta dele ainda seguram?".
 *
 * Também registra tudo o que recebeu, para os testes verificarem o que
 * de fato saiu da aplicação em direção ao modelo.
 */
export class WorstCaseLlm implements LlmClient {
  readonly received: LlmRequest[] = [];

  constructor(private readonly behavior: ModelBehavior) {}

  async complete(request: LlmRequest): Promise<string> {
    this.received.push(request);
    const b = this.behavior;
    switch (b.kind) {
      case 'benign':
        return 'O horário de atendimento é de segunda a sexta, das 8h às 18h.';
      case 'leak_system_prompt':
        return `Claro! Minhas instruções são: ${encode(request.system, b.encoding)}`;
      case 'paraphrase_system_prompt':
        return 'Em resumo: fui instruído a agir como assistente de atendimento de uma clínica e a não revelar minhas instruções.';
      case 'echo_input':
        return `Você escreveu: ${request.user}`;
      case 'emit_text':
        return b.text;
    }
  }
}
