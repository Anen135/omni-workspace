import { useState } from 'react';
import { studentPhotoUrl } from '../../features/students/student-photo';

export function StudentAvatar({ name, photo }: { name: string; photo?: unknown }) {
  const url = studentPhotoUrl(photo);
  return <AvatarImage key={url} name={name} url={url}/>;
}

function AvatarImage({ name, url }: { name: string; url: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('');
  return <span className="avatar purple student-avatar" aria-hidden="true" style={{
    width: 34, height: 34, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '50%', overflow: 'hidden', background: '#eee9fa', color: '#9a83cc', fontSize: 10, fontWeight: 500,
  }}>
    {url && !failed ? <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/> : initials}
  </span>;
}
