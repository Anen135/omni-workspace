import { record, rows, type Section } from '../../services/omni-client';
import type { DossierMetric } from './components/DossierOverview';
import type { DossierProfileField } from './components/DossierProfile';
import type { DossierSeries } from './components/DossierDynamics';
import type { DossierTable } from './components/DossierDetails';

export type TeacherDossierData = { account: { id: string; name: string }; single: Section; graphics: Section; all: Section };

// Explicit bindings and labels verified against Omni's dossier template and translations.
const indicators = [
  ['count_groups', 'Количество групп за семестр'],
  ['can_read_subject', 'Предметы, которые может вести преподаватель'],
  ['count_pairs', 'Количество пар'],
  ['average_attendance', 'Средняя посещаемость', '%'],
  ['avg_exams_mark', 'Средняя оценка по экзаменам'],
  ['count_studs_in_pairs', 'Студенто-пары'],
  ['number_passed_test_by_students', 'Тесты, пройденные студентами'],
  ['number_of_losses', 'Количество потерь'],
  ['unmarked_pairs', 'Неотмеченные пары'],
  ['count_marks', 'Количество оценок'],
  ['count_homeworks_marked', 'Выставленные оценки за ДЗ'],
  ['avg_count_stud_in_groups', 'Среднее количество студентов в группах'],
  ['count_hw', 'Выданные домашние задания'],
  ['avg_progress_stud', 'Средняя успеваемость студентов', '%'],
] as const;
const feedbackLabels: Record<string, string> = {
  everything_is_cool_tag: 'Всё круто!', everything_is_clear_tag: 'Всё понятно!', boring_tag: 'Скучно',
  task_is_too_difficult_tag: 'Задание слишком сложное', i_like_tag: 'Мне нравится',
  its_not_clear_but_it_had_to_be_done_tag: 'Непонятно, но нужно было сделать', task_is_too_simple_tag: 'Задание слишком простое',
  everything_is_super_tag: 'Всё супер!', did_not_answer_questions_tag: 'Не отвечал на вопросы',
  clearly_explains_tag: 'Понятно объясняет', cool_teacher_tag: 'Классный преподаватель!',
  was_noisy_tag: 'Было шумно', topic_was_not_explained_tag: 'Тема не была объяснена', teacher_shouts_tag: 'Преподаватель кричит',
  difficult_tag: 'Сложно', didnt_have_time_to_pass_the_topic_tag: 'Не успели пройти тему',
  little_practice_tag: 'Мало практики', little_theory_tag: 'Мало теории', why_are_we_teaching_this_tag: 'Зачем мы это учим?',
};
const feedbackGroups = [
  ['evaluation_homework', 'Оценка домашних заданий'],
  ['evaluation_lesson_teach', 'Оценка работы преподавателя'],
  ['evaluation_lesson', 'Оценка урока'],
] as const;

function scalar(value: unknown): string | number | null {
  return typeof value === 'string' && value.trim() ? value : typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function numeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^-?\d+(?:[.,]\d+)?$/.test(value.trim())) return null;
  const result = Number(value.trim().replace(',', '.'));
  return Number.isFinite(result) ? result : null;
}
function dataRecord(value: unknown) {
  const object = record(value);
  return Object.hasOwn(object, 'data') ? record(object.data) : object;
}
function periodLabel(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function dossierModel(dossier: TeacherDossierData) {
  const all = dataRecord(dossier.all.data);
  const single = record(all.single_data ?? dataRecord(dossier.single.data));
  const graphics = record(all.graphics_data ?? dataRecord(dossier.graphics.data));
  const profileData = record(all.profile_data);
  const rating = record(profileData.rating);
  const profile: DossierProfileField[] = [
    ['fio_teach', 'Преподаватель', profileData.fio_teach], ['post_teach', 'Должность', profileData.post_teach],
    ['mobilphone_teach', 'Телефон', profileData.mobilphone_teach], ['email_teach', 'Электронная почта', profileData.email_teach],
    ['adr_teach', 'Адрес', profileData.adr_teach], ['birthdat_teach', 'Дата рождения', profileData.birthdat_teach],
    ['work_start', 'Работает с', profileData.work_start], ['rating', 'Рейтинг', rating.rating], ['position', 'Место в филиале', rating.position],
  ].filter(([, , value]) => scalar(value) !== null).map(([id, label, value]) => ({ id: String(id), label: String(label), value: scalar(value) }));

  const metrics: DossierMetric[] = [];
  const series: DossierSeries[] = [];
  const periodRows: DossierTable['rows'] = [];
  const percents = record(all.percents);
  for (const [id, label, unit] of indicators) {
    const metric = record(single[id]);
    if (Object.keys(metric).length) metrics.push({ id, label, value: numeric(metric.indicator_value), unit });
    const points = rows(graphics[id]).flatMap(point => {
      const value = numeric(point.graphic_value);
      const label = periodLabel(point.month_date);
      return value === null || !label ? [] : [{ label, value }];
    });
    if (points.length) series.push({ id, title: label, unit, points });
    const percentage = record(percents[id]);
    if (Object.keys(percentage).length) {
      const percent = (value: unknown) => { const result = numeric(value); return result === null ? null : `${result.toLocaleString('ru-RU')} %`; };
      periodRows.push({ indicator: label, semester: percent(percentage.semestr), month: percent(percentage.month), week: percent(percentage.week) });
    }
  }
  const subjects: DossierTable[] = [{ id: 'subjects', title: 'Предметы преподавателя', columns: [{ key: 'subject', label: 'Предмет' }, { key: 'active', label: 'Ведётся сейчас' }], rows: rows(all.teach_specs_list).flatMap(item => {
    const subject = scalar(item.name_spec);
    if (subject === null) return [];
    return [{ subject, active: item.read_now === 1 || item.read_now === '1' ? 'Да' : item.read_now === 0 || item.read_now === '0' ? 'Нет' : null }];
  }) }].filter(table => table.rows.length);
  const periods: DossierTable[] = periodRows.length ? [{ id: 'periods', title: 'Показатели по периодам', columns: [{ key: 'indicator', label: 'Показатель' }, { key: 'semester', label: 'Семестр' }, { key: 'month', label: 'Месяц' }, { key: 'week', label: 'Неделя' }], rows: periodRows }] : [];
  const evaluationData = record(all.evaluation);
  const evaluations = record(evaluationData.single_data);
  const feedback: DossierTable[] = feedbackGroups.flatMap(([id, title]) => {
    const values = rows(evaluations[id]).flatMap(item => {
      const label = feedbackLabels[String(item.translate_key)] || (!item.translate_prefix ? title : '');
      return label ? [{ label, value: numeric(item.value) }] : [];
    });
    return values.length ? [{ id, title, columns: [{ key: 'label', label: 'Показатель' }, { key: 'value', label: 'Значение' }], rows: values }] : [];
  });
  const assistance: DossierTable[] = [{ id: 'assistance', title: 'Студенты, которым нужна помощь', columns: [
    { key: 'student', label: 'Студент' }, { key: 'group', label: 'Группа' }, { key: 'subject', label: 'Предмет' },
    { key: 'topic', label: 'Тема урока' }, { key: 'date', label: 'Следующая пара' }, { key: 'completion', label: 'Выполнение ДЗ' },
  ], rows: rows(evaluationData.students_who_need_help).map(item => {
    const completion = numeric(item.percent_hw_completion);
    return { student: scalar(item.fio), group: scalar(item.group), subject: scalar(item.subject), topic: scalar(item.lesson_theme), date: scalar(item.date_next_lesson), completion: completion === null ? null : `${completion.toLocaleString('ru-RU')} %` };
  }) }].filter(table => table.rows.length);
  return { profile, metrics, series, subjects, periods, feedback, assistance,
    errors: { metrics: all.single_data != null ? dossier.all.error : dossier.single.error,
      dynamics: all.graphics_data != null ? dossier.all.error : dossier.graphics.error } };
}
