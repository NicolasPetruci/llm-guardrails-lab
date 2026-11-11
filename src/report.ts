import { loadCases, runCase } from './suite.js';

const outcomes = await Promise.all(loadCases().map(runCase));

const rows = outcomes.map((o) => ({
  caso: o.case.id,
  tipo: o.case.category,
  'sem proteção': o.case.category === 'legitima' ? 'ok' : o.unprotectedLeaked ? 'VAZOU' : 'ok',
  'com proteção': o.guardedLeaked ? 'VAZOU' : o.guardedStatus === 'blocked' ? 'bloqueado' : 'ok',
  observação: o.case.knownGap ?? '',
}));

console.table(rows);

const attacks = outcomes.filter((o) => o.case.category !== 'legitima');
const held = attacks.filter((o) => !o.guardedLeaked).length;
console.log(`\nAtaques contidos pelo pipeline protegido: ${held} de ${attacks.length}.`);
console.log(`Lacunas conhecidas: ${attacks.length - held}. Elas estão documentadas no README.`);
