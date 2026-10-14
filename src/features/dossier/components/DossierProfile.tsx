export type DossierProfileField = {
  id: string;
  label: string;
  value: string | number | null;
};

export function DossierProfile({ fields }: { fields: DossierProfileField[] }) {
  return <dl className="dossier-profile">
    {fields.map(field => <div className="dossier-profile-field" key={field.id}>
      <dt>{field.label}</dt>
      <dd>{field.value === null || field.value === '' ? '—' : field.value}</dd>
    </div>)}
  </dl>;
}
