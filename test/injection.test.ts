import { describe, expect, it } from 'vitest';
import { WorstCaseLlm } from '../src/llm.js';
import { runGuarded, withCanary } from '../src/pipeline.js';
import { BASE_SYSTEM_PROMPT, loadCases, runCase } from '../src/suite.js';

const cases = loadCases();
const attacks = cases.filter((c) => c.category !== 'legitima');

describe('linha de base: sem proteção, todo ataque vaza', () => {
  it.each(attacks)('$id', async (testCase) => {
    const outcome = await runCase(testCase);
    expect(outcome.unprotectedLeaked).toBe(true);
  });
});

describe('pipeline protegido contém o ataque', () => {
  it.each(attacks.filter((c) => !c.knownGap))('$id', async (testCase) => {
    const outcome = await runCase(testCase);
    expect(outcome.guardedLeaked).toBe(false);
  });
});

describe('lacunas conhecidas (falham de propósito até serem corrigidas)', () => {
  // it.fails: o teste passa enquanto a asserção falha. No dia em que a
  // defesa cobrir o caso, ele quebra e avisa que a lacuna pode sair da lista.
  it.fails.each(attacks.filter((c) => c.knownGap))('$id', async (testCase) => {
    const outcome = await runCase(testCase);
    expect(outcome.guardedLeaked).toBe(false);
  });
});

describe('uso legítimo não é bloqueado', () => {
  it.each(cases.filter((c) => c.category === 'legitima'))('$id', async (testCase) => {
    const outcome = await runCase(testCase);
    expect(outcome.guardedStatus).toBe('ok');
  });
});

describe('o dado pessoal não chega ao modelo', () => {
  it('o modelo recebe marcadores no lugar de CPF, telefone e e-mail', async () => {
    const llm = new WorstCaseLlm({ kind: 'benign' });
    await runGuarded(
      llm,
      withCanary(BASE_SYSTEM_PROMPT),
      'Sou a Maria, CPF 529.982.247-25, celular (18) 99876-5432, maria.exemplo@email.com.',
    );

    const sent = llm.received[0]?.user ?? '';
    expect(sent).toContain('[CPF_1]');
    expect(sent).not.toMatch(/529|99876|maria\.exemplo@/);
  });
});
