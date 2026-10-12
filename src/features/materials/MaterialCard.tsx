import { ExternalLink, FileText } from 'lucide-react';
import { FilePreview } from '../../components/files/FilePreview';
import { MaterialContent } from './MaterialContent';
import type { TeachingMaterial } from './teaching-materials';

export function MaterialCard({ material, typeName }: { material: TeachingMaterial; typeName: string }) {
  return <article className="method-card">
    <span className="method-type">{typeName || 'Учебный материал'}</span>
    <h3><FileText size={17}/>{material.title}</h3>
    {material.description && <p>{material.description}</p>}
    <div className="method-links">
      {material.file && <FilePreview url={material.file}/>}
      {material.url && material.url !== material.file && <a className="button secondary" href={material.url} target="_blank" rel="noopener noreferrer">Открыть материал<ExternalLink size={14}/></a>}
    </div>
    {!!material.content && <details className="method-content"><summary>Читать содержимое</summary><MaterialContent value={material.content}/></details>}
    {!material.file && !material.url && !material.content && <p className="muted">У этого материала нет доступного файла или ссылки.</p>}
  </article>;
}
