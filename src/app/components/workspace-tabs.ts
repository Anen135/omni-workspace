import { BookOpen, CalendarDays, CircleHelp, Settings, ClipboardCheck, FolderOpen, UserRound, Users } from 'lucide-react';

export const workspaceTabs = [
  { key: 'lesson', icon: BookOpen, title: 'Мой урок', eyebrow: 'ТЕКУЩАЯ РАБОТА' },
  { key: 'schedule', icon: CalendarDays, title: 'Расписание', eyebrow: 'НЕДЕЛЬНЫЙ ОБЗОР' },
  { key: 'groups', icon: Users, title: 'Студенты', eyebrow: 'Статистика и контакты' },
  { key: 'homework', icon: ClipboardCheck, title: 'Домашние задания', eyebrow: 'ПРОВЕРКА РАБОТ' },
  { key: 'materials', icon: FolderOpen, title: 'Материалы', eyebrow: 'БИБЛИОТЕКА' },
  { key: 'dossier', icon: UserRound, title: 'Досье преподавателя', eyebrow: 'ПРОФИЛЬ ПРЕПОДАВАТЕЛЯ' },
  { key: 'settings', icon: Settings, title: 'Настройки', eyebrow: 'Рабочее пространство' },
  { key: 'help', icon: CircleHelp, title: 'Справка', eyebrow: 'ПОМОЩЬ' },
] as const;

export type WorkspaceTab = typeof workspaceTabs[number]['key'] | 'ui-tests';
