export type Student = { id: string; name: string; initials: string; color: string; marks: number[]; attendance: number; homework: number };
export type Entry = { present: boolean; mark: string; comment: string };
export type Lesson = { entries: Record<string, Entry>; topic: string; reviews: Record<string, { mark: string; comment: string }> };
export const students: Student[] = [
  { id: 'demo-1', name: 'Александра Морозова', initials: 'АМ', color: 'purple', marks: [10, 11, 9, 10, 12], attendance: 96, homework: 8 },
  { id: 'demo-2', name: 'Михаил Волков', initials: 'МВ', color: 'blue', marks: [8, 9, 8, 10, 9], attendance: 88, homework: 7 },
  { id: 'demo-3', name: 'Полина Соколова', initials: 'ПС', color: 'pink', marks: [11, 12, 10, 12, 11], attendance: 100, homework: 9 },
  { id: 'demo-4', name: 'Артём Лебедев', initials: 'АЛ', color: 'orange', marks: [7, 8, 6, 9, 8], attendance: 80, homework: 6 },
  { id: 'demo-5', name: 'Дарья Кузнецова', initials: 'ДК', color: 'green', marks: [10, 9, 11, 10, 10], attendance: 92, homework: 8 },
  { id: 'demo-6', name: 'Иван Орлов', initials: 'ИО', color: 'blue', marks: [9, 8, 10, 9, 9], attendance: 88, homework: 7 },
  { id: 'demo-7', name: 'София Белова', initials: 'СБ', color: 'purple', marks: [12, 11, 12, 10, 12], attendance: 100, homework: 9 },
  { id: 'demo-8', name: 'Даниил Фомин', initials: 'ДФ', color: 'orange', marks: [8, 7, 9, 8, 10], attendance: 84, homework: 7 },
];
export const initialLesson: Lesson = {
  topic: 'CSS Grid. Создаём адаптивные интерфейсы',
  entries: Object.fromEntries(students.map((student, index) => [student.id, { present: index !== 5, mark: '', comment: '' }])),
  reviews: {},
};
export const previousLesson = Object.fromEntries(students.map((student, index) => [student.id, { present: index !== 3, mark: String(student.marks.at(-1)), comment: '' }]));
export const materials = [
  { id: 'guide', type: 'PDF · конспект', title: 'CSS Grid: от основ к практике', description: 'Основные свойства, схемы и примеры', content: 'CSS Grid: от основ к практике\n\nДемонстрационный конспект\n\ndisplay: grid — включает сетку.\ngrid-template-columns: repeat(3, 1fr) — создаёт три равные колонки.\ngap: 24px — задаёт расстояние между элементами.\n\nЗадание: создайте сетку карточек, которая перестраивается на небольшом экране.' },
  { id: 'homework', type: 'ДЗ · до 20 сентября', title: 'Адаптивная галерея', description: 'Практическая работа · 8 получателей', content: 'Адаптивная галерея\n\nДемонстрационное домашнее задание\n\nСоздайте галерею из 6 карточек на CSS Grid.\nНа широком экране — 3 колонки, на планшете — 2, на телефоне — 1.\nДобавьте состояния наведения и подписи к изображениям.\n\nПрикрепите HTML и CSS или ссылку на репозиторий.' },
];
export const sampleCode = `.gallery {\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  gap: 24px;\n  padding: 32px;\n}\n\n.card {\n  border-radius: 16px;\n  overflow: hidden;\n  background: #fff;\n}\n\n@media (max-width: 768px) {\n  .gallery {\n    grid-template-columns: repeat(2, 1fr);\n  }\n}\n\n@media (max-width: 480px) {\n  .gallery {\n    grid-template-columns: 1fr;\n  }\n}`;
