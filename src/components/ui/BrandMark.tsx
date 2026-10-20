/** Canonical vector used by the workspace and scripts/generate-brand.mjs. */
export function BrandMark({ size = 34, className = '' }: { size?: number; className?: string }) {
  return <svg className={'omni-brand-mark ' + className} width={size} height={size} viewBox="0 0 128 128" fill="none" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <rect width="128" height="128" rx="36" fill="#6C4DF6"/>
    <path d="M91 64A27 27 0 1 1 64 37" stroke="white" strokeWidth="16" strokeLinecap="round"/>
    <circle cx="91" cy="37" r="9" fill="#CEC4FF"/>
  </svg>;
}
