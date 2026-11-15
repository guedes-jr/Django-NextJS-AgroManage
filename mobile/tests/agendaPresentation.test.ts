import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agendaActivityCount, agendaDayLabel, agendaWeekLabel } from '../src/features/agenda/presentation';
import { agendaMessages } from '../src/features/agenda/messages';
import { languages } from '../src/i18n/messages';

test('activity totals use localized numbers and singular/plural in every language', () => {
  const singular = ['1 atividade', '1 activity', '1 actividad', '1 atividade'];
  const plural = ['2 atividades', '2 activities', '2 actividades', '2 atividades'];
  languages.forEach((language, index) => {
    assert.equal(agendaActivityCount(language, 1), singular[index]);
    assert.equal(agendaActivityCount(language, 2), plural[index]);
    assert.match(agendaActivityCount(language, 0), /^0 /);
  });
  assert.equal(agendaActivityCount('en', 1234), '1,234 activities');
  assert.equal(agendaActivityCount('pt-BR', 1234), '1.234 atividades');
});

test('calendar accessibility identifies weekday, full date and today', () => {
  assert.equal(agendaDayLabel('en', '2026-11-13', '2026-11-13'), 'Friday, November 13, 2026. Today');
  assert.equal(agendaDayLabel('en', '2026-11-14', '2026-11-13'), 'Saturday, November 14, 2026');
  assert.match(agendaDayLabel('pt-BR', '2028-02-29'), /terça-feira, 29 de fevereiro de 2028/);
  for (const language of languages) {
    assert.ok(agendaDayLabel(language, '2026-11-13', '2026-11-13').endsWith(agendaMessages[language].today));
  }
});

test('weeks spanning New Year identify both years without cluttering same-year weeks', () => {
  for (const language of languages) {
    const across = agendaWeekLabel(language, '2026-12-28', '2027-01-03');
    assert.match(across, /2026/);
    assert.match(across, /2027/);
    assert.doesNotMatch(agendaWeekLabel(language, '2026-11-09', '2026-11-15'), /2026/);
  }
});

test('empty day is distinct from an empty period in every language', () => {
  for (const language of languages) {
    const t = agendaMessages[language];
    assert.ok(t.emptyDay.trim().length > 0);
    assert.notEqual(t.emptyDay, t.empty);
  }
});
