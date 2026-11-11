interface Props {
  text: string;
  /** Trechos de dado pessoal a destacar em vermelho. */
  pii?: string[];
  /** O canário, destacado em dourado quando aparece por extenso. */
  canary?: string;
}

const MARKER = /^\[(?:CPF|TELEFONE|EMAIL)_\d+\]$/;
const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Mostra um texto destacando o que importa:
 * vermelho = dado pessoal, verde = marcador que o substituiu, dourado = canário.
 */
export function Marked({ text, pii = [], canary }: Props) {
  const literals = [...new Set([...pii, ...(canary ? [canary] : [])])]
    .filter((v) => v.length > 0)
    .sort((a, b) => b.length - a.length)
    .map(escape);
  const pattern = new RegExp(`(${[...literals, '\\[(?:CPF|TELEFONE|EMAIL)_\\d+\\]'].join('|')})`, 'g');

  return (
    <span className="marked">
      {text.split(pattern).map((part, index) => {
        if (index % 2 === 0) return part;
        if (part === canary) return <mark key={index} className="m-canary">{part}</mark>;
        if (MARKER.test(part)) return <mark key={index} className="m-marker">{part}</mark>;
        return <mark key={index} className="m-pii">{part}</mark>;
      })}
    </span>
  );
}
