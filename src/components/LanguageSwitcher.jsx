import { useLang } from '../lib/i18n';

// SVG flags rather than emoji — Windows does not render regional-indicator
// emoji as flags (it shows the country letters), so the symbols are drawn
// directly to stay reliable across platforms.
function FlagUK() {
  return (
    <svg viewBox="0 0 60 30" className="h-full w-full" aria-hidden="true">
      <clipPath id="lang-uk-clip">
        <path d="M0,0 v30 h60 v-30 z" />
      </clipPath>
      <g clipPath="url(#lang-uk-clip)">
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
}

function FlagID() {
  return (
    <svg viewBox="0 0 60 30" className="h-full w-full" aria-hidden="true">
      <rect width="60" height="15" fill="#ce1126" />
      <rect width="60" height="15" y="15" fill="#fff" />
    </svg>
  );
}

const OPTIONS = [
  { code: 'en', short: 'EN', name: 'English', Flag: FlagUK },
  { code: 'id', short: 'ID', name: 'Bahasa Indonesia', Flag: FlagID },
];

export function LanguageSwitcher() {
  const { lang, setLang } = useLang();

  return (
    <div
      role="group"
      aria-label="Language / Bahasa"
      className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line/70 bg-well/40 p-1 shadow-sm shadow-ink/5 backdrop-blur-sm"
    >
      {OPTIONS.map(({ code, short, name, Flag }) => {
        const active = lang === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={active}
            title={name}
            className={`tactile-soft inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium sm:min-h-9 ${
              active ? 'bg-brand text-on-brand' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <span className="inline-flex h-3 w-[1.1rem] overflow-hidden rounded-[2px] ring-1 ring-ink/10">
              <Flag />
            </span>
            {short}
          </button>
        );
      })}
    </div>
  );
}
