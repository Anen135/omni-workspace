import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/features/dossier/dossier-model.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { dossierModel } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const section = data => ({ data, error: null });
const dossier = all => ({ account: { id: '101', name: 'Тестовый преподаватель' }, single: section(null), graphics: section(null), all: section(all) });

test('dossier maps verified indicator, profile and period fields without displaying metadata', () => {
  const model = dossierModel(dossier({
    profile_data: { fio_teach: 'Тестовый преподаватель', email_teach: 'test@example.invalid', rating: { rating: 0, position: 2 }, id_teach: 999, unknown_field: 'hidden' },
    single_data: { count_pairs: { indicator_value: 0 }, average_attendance: { indicator_value: '82,5' }, count_marks: { indicator_value: null }, unknown_metric: { indicator_value: 123 } },
    percents: { count_pairs: { semestr: 0, month: '12.5', week: null } },
  }));
  assert.deepEqual(model.metrics, [
    { id: 'count_pairs', label: 'Количество пар', value: 0, unit: undefined },
    { id: 'average_attendance', label: 'Средняя посещаемость', value: 82.5, unit: '%' },
    { id: 'count_marks', label: 'Количество оценок', value: null, unit: undefined },
  ]);
  assert.equal(model.profile.find(field => field.id === 'rating').value, 0);
  assert.equal(model.profile.some(field => field.id === 'id_teach' || field.id === 'unknown_field'), false);
  assert.deepEqual(model.periods[0].rows, [{ indicator: 'Количество пар', semester: '0 %', month: '12,5 %', week: null }]);
});

test('dossier dynamics preserves actual zero and signed values and rejects invalid dates or numeric text', () => {
  const model = dossierModel(dossier({ graphics_data: { count_pairs: [
    { month_date: '2026-01-01', graphic_value: 0 }, { month_date: '2026-02-01', graphic_value: '-2,5' },
    { month_date: '2026-02-30', graphic_value: 7 }, { month_date: 'invalid', graphic_value: 8 },
    { month_date: '2026-03-01', graphic_value: '12%' }, { month_date: '2026-04-01', graphic_value: null },
  ] } }));
  assert.deepEqual(model.series, [{ id: 'count_pairs', title: 'Количество пар', unit: undefined, points: [
    { label: 'январь 2026 г.', value: 0 }, { label: 'февраль 2026 г.', value: -2.5 },
  ] }]);
});

test('dossier maps subjects, feedback and assistance using explicit labels, preserving missing and escaped text', () => {
  const unsafe = '<img src=x onerror="window.injected=true">';
  const model = dossierModel(dossier({
    teach_specs_list: [{ name_spec: unsafe, read_now: 1 }, { name_spec: 'Второй предмет', read_now: '0' }, { name_spec: 'Без отметки' }, { read_now: 1 }],
    evaluation: { single_data: {
      evaluation_homework: [{ translate_key: 'everything_is_clear_tag', value: 0 }, { translate_key: 'unknown_tag', translate_prefix: 'tag', value: 77 }],
      evaluation_lesson_teach: [{ translate_key: 'clearly_explains_tag', value: '4' }],
      evaluation_lesson: [{ translate_key: 'little_practice_tag', value: null }],
    }, students_who_need_help: [{ fio: 'Тестовый студент', group: 'Тестовая группа', subject: 'Предмет', lesson_theme: unsafe, date_next_lesson: '2026-10-20', percent_hw_completion: 0 }] },
  }));
  assert.deepEqual(model.subjects[0].rows, [{ subject: unsafe, active: 'Да' }, { subject: 'Второй предмет', active: 'Нет' }, { subject: 'Без отметки', active: null }]);
  assert.deepEqual(model.feedback.map(table => table.rows), [[{ label: 'Всё понятно!', value: 0 }], [{ label: 'Понятно объясняет', value: 4 }], [{ label: 'Мало практики', value: null }]]);
  assert.deepEqual(model.assistance[0].rows[0], { student: 'Тестовый студент', group: 'Тестовая группа', subject: 'Предмет', topic: unsafe, date: '2026-10-20', completion: '0 %' });
});

test('dossier accepts endpoint data wrappers and independent section fallback', () => {
  const input = dossier({ data: { profile_data: { post_teach: 'Преподаватель' } } });
  input.single = section({ data: { count_pairs: { indicator_value: 4 } } });
  input.graphics = section({ data: { count_pairs: [{ graphic_value: 5, month_date: '2026-09-01' }] } });
  const model = dossierModel(input);
  assert.equal(model.metrics[0].value, 4); assert.equal(model.series[0].points[0].value, 5);
  assert.equal(model.profile[0].value, 'Преподаватель');
});

test('dossier leaves empty sections empty and preserves all records for paginated views', () => {
  const empty = dossierModel(dossier(null));
  for (const section of ['profile', 'metrics', 'series', 'subjects', 'periods', 'feedback', 'assistance']) assert.deepEqual(empty[section], []);
  const students = Array.from({ length: 55 }, (_, index) => ({ fio: `Студент ${index + 1}`, percent_hw_completion: index }));
  const model = dossierModel(dossier({ evaluation: { students_who_need_help: students } }));
  assert.equal(model.assistance[0].rows.length, 55); assert.equal(model.assistance[0].rows.at(-1).student, 'Студент 55');
});
