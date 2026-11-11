/**
 * Remoção de dados pessoais antes de o texto sair da aplicação.
 *
 * Cada dado encontrado vira um marcador estável ([CPF_1], [EMAIL_1]...).
 * O mesmo valor recebe sempre o mesmo marcador, então o modelo ainda
 * consegue raciocinar sobre "a mesma pessoa" sem ver o dado.
 *
 * Limite conhecido: isto é detecção por padrão. Pega CPF, telefone e
 * e-mail; não pega nome, endereço nem dado de saúde escrito em texto livre.
 */

export type EntityType = 'CPF' | 'TELEFONE' | 'EMAIL';

export interface Entity {
  type: EntityType;
  placeholder: string;
  value: string;
}

export interface Redaction {
  text: string;
  entities: Entity[];
  /** Cada trecho original que foi mascarado, do jeito que estava escrito. Usado para destacar na tela. */
  matched: string[];
}

const CPF_PATTERN = /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g;
const PHONE_PATTERN = /(?<![\d\w])(?:\+?55[\s-]?)?(?:\(\d{2}\)|\d{2})[\s-]?9?\d{4}[\s-]?\d{4}(?!\d)/g;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

/** Valida os dois dígitos verificadores de um CPF. */
export function isValidCpf(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  const checkDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += Number(digits[i]) * (length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
}

export function redact(input: string, previous: Entity[] = []): Redaction {
  const entities = [...previous];
  const matched: string[] = [];

  const placeholderFor = (type: EntityType, value: string): string => {
    const key = type === 'EMAIL' ? value.toLowerCase() : value.replace(/\D/g, '');
    const known = entities.find(
      (e) => e.type === type && (type === 'EMAIL' ? e.value.toLowerCase() : e.value.replace(/\D/g, '')) === key,
    );
    if (known) return known.placeholder;

    const index = entities.filter((e) => e.type === type).length + 1;
    const placeholder = `[${type}_${index}]`;
    entities.push({ type, placeholder, value });
    return placeholder;
  };

  let text = input;

  // CPF primeiro: 11 dígitos seguidos também parecem um celular com DDD.
  // Com pontuação de CPF, mascara sempre. Só dígitos, mascara se os verificadores baterem.
  text = text.replace(CPF_PATTERN, (match) => {
    const punctuated = /[.-]/.test(match);
    if (!(punctuated || isValidCpf(match))) return match;
    matched.push(match);
    return placeholderFor('CPF', match);
  });
  text = text.replace(PHONE_PATTERN, (match) => {
    matched.push(match);
    return placeholderFor('TELEFONE', match);
  });
  text = text.replace(EMAIL_PATTERN, (match) => {
    matched.push(match);
    return placeholderFor('EMAIL', match);
  });

  return { text, entities, matched };
}

/** Devolve os valores originais aos marcadores. Só para texto que volta ao dono do dado. */
export function restore(text: string, entities: Entity[]): string {
  return entities.reduce((acc, e) => acc.split(e.placeholder).join(e.value), text);
}
