import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PrimaryButton, QuietButton } from '../components/report';
import { claudeAIService } from '../lib/claudeAI';
import { clearAILogs, getAIStatusSnapshot, subscribeAIStatus } from '../lib/aiSession';
import { useT } from '../lib/i18n';

function formatTime(value, neverLabel = 'Never') {
  if (!value) return neverLabel;
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function statusTone(status) {
  if (status === 'Processing') return 'bg-info-tint text-info';
  if (status === 'Available') return 'bg-pos-tint text-pos';
  if (status === 'Error') return 'bg-neg-tint text-neg';
  if (status === 'Unchecked') return 'bg-warn-tint text-warn';
  return 'bg-well text-ink-muted';
}

function logTone(level) {
  const tones = {
    active: 'bg-info-tint text-info',
    success: 'bg-pos-tint text-pos',
    error: 'bg-neg-tint text-neg',
    info: 'bg-well text-ink-muted',
  };
  return tones[level] || tones.info;
}

function hasEvidence(log) {
  return Boolean(log.evidence?.sections?.length || log.details);
}

function DetailSection({ section }) {
  return (
    <section className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <h4 className="font-mono text-xs font-semibold uppercase text-ink-muted">{section.title}</h4>
      {section.text && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{section.text}</p>}
      {Array.isArray(section.facts) && section.facts.length > 0 && (
        <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {section.facts.map((fact) => (
            <div key={`${section.title}-${fact.label}`} className="min-w-0">
              <dt className="text-xs text-ink-muted">{fact.label}</dt>
              <dd className="truncate text-sm font-medium text-ink">{fact.value ?? 'n/a'}</dd>
            </div>
          ))}
        </dl>
      )}
      {Array.isArray(section.items) && section.items.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-muted">
          {section.items.map((item, index) => (
            <li key={`${section.title}-${index}`}>{item}</li>
          ))}
        </ul>
      )}
      {Array.isArray(section.rows) && section.rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-y border-line text-ink-muted">
                {Object.keys(section.rows[0]).map((key) => (
                  <th key={key} className="px-2 py-2 font-medium">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {section.rows.map((row, index) => (
                <tr key={`${section.title}-${index}`}>
                  {Object.values(row).map((value, valueIndex) => (
                    <td key={valueIndex} className="px-2 py-2 text-ink-muted">
                      {value ?? 'n/a'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {section.code && (
        <pre className="mt-3 max-h-56 overflow-auto rounded-md bg-well p-3 text-xs text-ink-muted">
          {section.code}
        </pre>
      )}
    </section>
  );
}

export default function AIStatusPage() {
  const t = useT();
  const [snapshot, setSnapshot] = useState(() => getAIStatusSnapshot());
  const [checking, setChecking] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const checkingRef = useRef(false);

  const runHealthCheck = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      await claudeAIService.checkHealth();
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => subscribeAIStatus(setSnapshot), []);

  useEffect(() => {
    runHealthCheck();
  }, [runHealthCheck]);

  const status = useMemo(() => {
    if (snapshot.active) return 'Processing';
    if (!snapshot.configured) return 'Inactive';
    if (snapshot.lastError) return 'Error';
    if (snapshot.lastSuccessAt) return 'Available';
    return 'Unchecked';
  }, [snapshot]);

  // Display labels for the internal (English) status value, which must stay
  // English for the statusTone() comparison above.
  const statusLabel = {
    Processing: t('Processing', 'Memproses'),
    Inactive: t('Inactive', 'Nonaktif'),
    Error: t('Error', 'Galat'),
    Available: t('Available', 'Tersedia'),
    Unchecked: t('Unchecked', 'Belum diperiksa'),
  };

  const toggleDetails = (id) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="report-enter">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-line pb-6">
        <div>
          <p className="font-mono text-xs text-ink-muted">{t('Claude runtime', 'Runtime Claude')}</p>
          <h2 className="mt-1 font-serif text-4xl font-medium tracking-tight">{t('AI Status', 'Status AI')}</h2>
        </div>
        <PrimaryButton onClick={runHealthCheck} loading={checking}>
          {t('Run live check', 'Jalankan pemeriksaan langsung')}
        </PrimaryButton>
      </header>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-line p-5">
          <p className="text-sm text-ink-muted">{t('Runtime status', 'Status runtime')}</p>
          <div className="mt-3 flex items-center gap-2">
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusTone(status)}`}>
              {statusLabel[status] ?? status}
            </span>
            {snapshot.active && (
              <span className="font-mono text-xs text-ink-muted">{t(`${snapshot.activeCount} active`, `${snapshot.activeCount} aktif`)}</span>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-line p-5">
          <p className="text-sm text-ink-muted">{t('Configuration', 'Konfigurasi')}</p>
          <p className="mt-3 text-sm font-medium">
            {snapshot.configured
              ? t('API key detected', 'Kunci API terdeteksi')
              : t('API key missing', 'Kunci API tidak ada')}
          </p>
        </div>

        <div className="rounded-lg border border-line p-5">
          <p className="text-sm text-ink-muted">{t('Last successful check', 'Pemeriksaan berhasil terakhir')}</p>
          <p className="mt-3 font-mono text-sm">{formatTime(snapshot.lastSuccessAt, t('Never', 'Belum pernah'))}</p>
        </div>
      </section>

      {snapshot.lastError && (
        <div role="alert" className="mt-5 rounded-md border border-neg/30 bg-neg-tint px-4 py-3">
          <p className="text-sm text-neg">{snapshot.lastError}</p>
        </div>
      )}

      <section className="mt-10 border-t border-line pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-serif text-2xl font-medium">{t('Session Activity', 'Aktivitas Sesi')}</h3>
            <p className="mt-1 font-mono text-xs text-ink-muted">
              {t('Last checked', 'Terakhir diperiksa')} {formatTime(snapshot.lastCheckedAt, t('Never', 'Belum pernah'))}
            </p>
          </div>
          <QuietButton onClick={clearAILogs}>{t('Clear log', 'Bersihkan log')}</QuietButton>
        </div>

        {snapshot.logs.length > 0 ? (
          <ol className="mt-5 divide-y divide-line border-y border-line">
            {snapshot.logs.map((log) => (
              <li key={log.id} className="grid gap-3 py-4 md:grid-cols-[8rem_1fr]">
                <div>
                  <p className="font-mono text-xs text-ink-muted">{formatTime(log.at)}</p>
                  <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${logTone(log.level)}`}>
                    {log.source}
                  </span>
                </div>
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="text-sm font-medium">{log.title}</p>
                    {hasEvidence(log) && (
                      <button
                        type="button"
                        onClick={() => toggleDetails(log.id)}
                        aria-expanded={expanded.has(log.id)}
                        className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-xs font-medium text-ink-muted transition-colors hover:border-ink-muted hover:text-ink sm:min-h-8"
                      >
                        {expanded.has(log.id) ? t('Hide details', 'Sembunyikan detail') : t('Details', 'Detail')}
                      </button>
                    )}
                  </div>
                  {log.summary && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{log.summary}</p>}
                  {log.details && <p className="mt-2 font-mono text-xs text-ink-muted">{log.details}</p>}
                  <div className={`details-collapse ${expanded.has(log.id) ? 'details-collapse-open' : ''}`} aria-hidden={!expanded.has(log.id)}>
                    <div>
                      <div className="mt-4 space-y-4 rounded-lg border border-line bg-well/30 p-4">
                        {log.evidence?.note && (
                          <p className="text-xs leading-relaxed text-ink-muted">{log.evidence.note}</p>
                        )}
                        {log.evidence?.sections?.map((section, index) => (
                          <DetailSection key={`${log.id}-${section.title}-${index}`} section={section} />
                        ))}
                        {!log.evidence?.sections?.length && log.details && (
                          <DetailSection section={{ title: t('Details', 'Detail'), text: log.details }} />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-5 rounded-lg border border-line p-5 text-sm text-ink-muted">
            {t('No AI activity has been recorded in this session.', 'Belum ada aktivitas AI yang tercatat pada sesi ini.')}
          </div>
        )}
      </section>
    </div>
  );
}
