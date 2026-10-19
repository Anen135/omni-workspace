import { CheckCheck, LoaderCircle, X } from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import type { RemoteRecord, Section } from '../../services/omni-client';
import { SectionView } from '../../components/data/RemoteData';
import { StudentProfile } from '../../features/students/StudentProfile';

export function WorkspaceError({ message, busy, authNeeded, onRetry }: { message: string; busy: boolean; authNeeded: boolean; onRetry: () => void }) {
  return <div className="warning" role="alert">{message}<button className="text-button" disabled={busy} onClick={onRetry}>{authNeeded ? 'Открыть вход' : 'Повторить'}</button></div>;
}

export function TeacherSwitchingState() {
  return <section className="panel connection-card" role="status"><LoaderCircle className="spin" size={26}/><h2>Переключаю преподавателя…</h2><p>Загружаю его расписание, группы и домашние задания.</p></section>;
}

export function WorkspaceLoading() {
  return <div role="status" className="live-loading"><LoaderCircle className="spin" size={17}/>Загружаю данные Omni…</div>;
}

export function StudentDetailDialog({ dialogRef, detail, onClose }: {
  dialogRef: RefObject<HTMLDialogElement | null>; detail: { title: string; student?: RemoteRecord; sections: Section[] }; onClose: () => void;
}) {
  return <dialog ref={dialogRef} onCancel={onClose} aria-label={detail.title}>
    <div className="modal-header"><h2>{detail.title}</h2><button className="icon" aria-label="Закрыть" onClick={onClose}><X size={20}/></button></div>
    <div className="modal-body">{detail.student ? <StudentProfile student={detail.student} details={detail.sections[0]} attendance={detail.sections[1]}/> : detail.sections.map((section, index) => <SectionView key={index} section={section}/>)}</div>
  </dialog>;
}

export function WorkspaceToast({ message, onClose }: { message: string; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  useEffect(() => { setClosing(false); }, [message]);
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(onClose, 180);
    return () => window.clearTimeout(timer);
  }, [closing, onClose]);
  return <div className={`toast workspace-toast${closing ? ' closing' : ''}`} role="status"><CheckCheck size={17}/>{message}<button className="icon" aria-label="Закрыть уведомление" onClick={() => setClosing(true)}><X size={16}/></button></div>;
}
