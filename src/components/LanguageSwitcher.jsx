import { useLang } from '../lib/i18n';
import { Segmented } from './Segmented';

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
    <Segmented
      role="group"
      ariaLabel="Language / Bahasa"
      className="backdrop-blur-sm"
      value={lang}
      onChange={setLang}
      options={OPTIONS.map(({ code, short, name, Flag }) => ({
        value: code,
        label: short,
        title: name,
        icon: (
          <span className="inline-flex h-3 w-[1.1rem] overflow-hidden rounded-[2px] ring-1 ring-ink/10">
            <Flag />
          </span>
        ),
      }))}
    />
  );
}
