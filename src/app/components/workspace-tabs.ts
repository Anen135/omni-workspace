import { BookOpen, CalendarDays, ClipboardCheck, FolderOpen, UserRound, Users } from 'lucide-react';

export const workspaceTabs = [
  { key: 'lesson', icon: BookOpen, title: 'Мой урок', eyebrow: 'ТЕКУЩАЯ РАБОТА' },
  { key: 'schedule', icon: CalendarDays, title: 'Расписание', eyebrow: 'НЕДЕЛЬНЫЙ ОБЗОР' },
  { key: 'groups', icon: Users, title: 'Ученики', eyebrow: 'УЧЕБНЫЕ ГРУППЫ' },
  { key: 'homework', icon: ClipboardCheck, title: 'Домашние задания', eyebrow: 'ПРОВЕРКА РАБОТ' },
  { key: 'materials', icon: FolderOpen, title: 'Материалы', eyebrow: 'БИБЛИОТЕКА' },
  { key: 'dossier', icon: UserRound, title: 'Досье преподавателя', eyebrow: 'ПРОФИЛЬ ПРЕПОДАВАТЕЛЯ' },
] as const;

export type WorkspaceTab = typeof workspaceTabs[number]['key'];
