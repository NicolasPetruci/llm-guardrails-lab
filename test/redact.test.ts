import { describe, expect, it } from 'vitest';
import { isValidCpf, redact, restore } from '../src/redact.js';

describe('isValidCpf', () => {
  it('aceita CPF com dígitos verificadores corretos', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('11144477735')).toBe(true);
  });

  it('rejeita dígito verificador errado e sequências repetidas', () => {
    expect(isValidCpf('529.982.247-26')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
  });
});

describe('redact', () => {
  it('mascara CPF, telefone e e-mail', () => {
    const { text, entities } = redact('CPF 529.982.247-25, fone (18) 99876-5432, e-mail maria.exemplo@email.com.');
    expect(text).toBe('CPF [CPF_1], fone [TELEFONE_1], e-mail [EMAIL_1].');
    expect(entities.map((e) => e.type)).toEqual(['CPF', 'TELEFONE', 'EMAIL']);
  });

  it('usa o mesmo marcador para o mesmo valor escrito de formas diferentes', () => {
    const { text } = redact('Confirme: 529.982.247-25 e 52998224725 são o mesmo CPF.');
    expect(text).toBe('Confirme: [CPF_1] e [CPF_1] são o mesmo CPF.');
  });

  it('distingue celular de CPF quando ambos têm 11 dígitos', () => {
    const { text } = redact('CPF 11144477735, celular 18998765432.');
    expect(text).toBe('CPF [CPF_1], celular [TELEFONE_1].');
  });

  it('não mexe em números que não são dado pessoal', () => {
    const input = 'Foram 412 atendimentos em 2026, protocolo 12345.';
    expect(redact(input).text).toBe(input);
  });

  it('restore devolve os valores originais', () => {
    const original = 'Ligue para (18) 99876-5432 ou escreva para a@b.com.';
    const { text, entities } = redact(original);
    expect(restore(text, entities)).toBe(original);
  });
});
