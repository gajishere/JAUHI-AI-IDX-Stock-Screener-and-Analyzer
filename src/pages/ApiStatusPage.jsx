import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pill, PrimaryButton, QuietButton, Row, Section } from '../components/report';
import { claudeAIService } from '../lib/claudeAI';
import { clearAILogs, getAIStatusSnapshot, subscribeAIStatus } from '../lib/aiSession';
import { checkIdxHealth } from '../lib/idxApi';
import { clearIdxLogs, getIdxStatusSnapshot, subscribeIdxStatus } from '../lib/idxSession';
import { useT } from '../lib/i18n';

function formatTime(value, neverLabel = 'Never') {
  if (!value) return neverLabel;
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function statusPillTone(status) {
  const tones = { Processing: 'info', Available: 'pos', Error: 'neg', Unchecked: 'warn', Inactive: 'muted' };
  return tones[status] || 'muted';
}

function logPillTone(level) {
  const tones = { active: 'info', success: 'pos', error: 'neg', info: 'muted' };
  return tones[level] || 'muted';
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

// Both Claude and the IDX proxy report the same snapshot shape
// (configured / active / lastError / lastSuccessAt), so the runtime-status
// derivation is shared.
function deriveStatus(snapshot) {
  if (snapshot.active) return 'Processing';
  if (!snapshot.configured) return 'Inactive';
  if (snapshot.lastError) return 'Error';
  if (snapshot.lastSuccessAt) return 'Available';
  return 'Unchecked';
}

function ServicePanel({ title, subtitle, snapshot, statusLabel, t }) {
  const status = deriveStatus(snapshot);
  return (
    <Section
      title={title}
      aside={
        <div className="flex items-center gap-2">
          {snapshot.active && (
            <span className="font-mono text-xs text-ink-muted">
              {t(`${snapshot.activeCount} active`, `${snapshot.activeCount} aktif`)}
            </span>
          )}
          <Pill tone={statusPillTone(status)}>{statusLabel[status] ?? status}</Pill>
        </div>
      }
    >
      <p className="-mt-2 mb-3 font-mono text-xs text-ink-muted">{subtitle}</p>
      <div className="grid gap-x-12 md:grid-cols-2">
        <Row
          label={t('Configuration', 'Konfigurasi')}
          value={
            snapshot.configured ? t('API key detected', 'Kunci API terdeteksi') : t('API key missing', 'Kunci API tidak ada')
          }
          tone={snapshot.configured ? 'text-pos' : 'text-warn'}
        />
        <Row
          label={t('Last successful check', 'Pemeriksaan berhasil terakhir')}
          value={formatTime(snapshot.lastSuccessAt, t('Never', 'Belum pernah'))}
        />
      </div>

      {snapshot.lastError && (
        <div role="alert" className="mt-4 rounded-md border border-neg/30 bg-neg-tint px-4 py-3">
          <p className="text-sm text-neg">{snapshot.lastError}</p>
        </div>
      )}
    </Section>
  );
}

export default function ApiStatusPage() {
  const t = useT();
  const [claudeSnapshot, setClaudeSnapshot] = useState(() => getAIStatusSnapshot());
  const [idxSnapshot, setIdxSnapshot] = useState(() => getIdxStatusSnapshot());
  const [checking, setChecking] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const checkingRef = useRef(false);

  const runHealthCheck = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      await Promise.all([claudeAIService.checkHealth(), checkIdxHealth()]);
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => subscribeAIStatus(setClaudeSnapshot), []);
  useEffect(() => subscribeIdxStatus(setIdxSnapshot), []);

  useEffect(() => {
    runHealthCheck();
  }, [runHealthCheck]);

  // Display labels for the internal (English) status value, which must stay
  // English for the deriveStatus() comparison.
  const statusLabel = {
    Processing: t('Processing', 'Memproses'),
    Inactive: t('Inactive', 'Nonaktif'),
    Error: t('Error', 'Galat'),
    Available: t('Available', 'Tersedia'),
    Unchecked: t('Unchecked', 'Belum diperiksa'),
  };

  const logs = useMemo(
    () => [...claudeSnapshot.logs, ...idxSnapshot.logs].sort((a, b) => new Date(b.at) - new Date(a.at)),
    [claudeSnapshot.logs, idxSnapshot.logs],
  );
  const lastCheckedAt = useMemo(() => {
    const times = [claudeSnapshot.lastCheckedAt, idxSnapshot.lastCheckedAt].filter(Boolean);
    if (times.length === 0) return null;
    return times.reduce((latest, value) => (new Date(value) > new Date(latest) ? value : latest));
  }, [claudeSnapshot.lastCheckedAt, idxSnapshot.lastCheckedAt]);

  const clearAllLogs = () => {
    clearAILogs();
    clearIdxLogs();
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
          <p className="font-mono text-xs text-ink-muted">{t('Claude & IDX runtime', 'Runtime Claude & IDX')}</p>
          <h2 className="mt-1 font-serif text-4xl font-medium tracking-tight">{t('API Status', 'Status API')}</h2>
        </div>
        <PrimaryButton onClick={runHealthCheck} loading={checking}>
          {t('Run live check', 'Jalankan pemeriksaan langsung')}
        </PrimaryButton>
      </header>

      <div className="space-y-6">
        <ServicePanel
          title={t('Claude', 'Claude')}
          subtitle={t('AI analysis', 'Analisis AI')}
          snapshot={claudeSnapshot}
          statusLabel={statusLabel}
          t={t}
        />
        <ServicePanel
          title={t('IDX Data', 'Data IDX')}
          subtitle={t('Broker tape & bandarmology', 'Aliran broker & bandarmologi')}
          snapshot={idxSnapshot}
          statusLabel={statusLabel}
          t={t}
        />

        <Section
          title={t('Session activity', 'Aktivitas sesi')}
          aside={<QuietButton onClick={clearAllLogs}>{t('Clear log', 'Bersihkan log')}</QuietButton>}
        >
          <p className="-mt-2 mb-4 font-mono text-xs text-ink-muted">
            {t('Last checked', 'Terakhir diperiksa')} {formatTime(lastCheckedAt, t('Never', 'Belum pernah'))}
          </p>

          {logs.length > 0 ? (
            <ol className="divide-y divide-line border-y border-line">
              {logs.map((log) => (
                <li key={log.id} className="grid gap-3 py-4 md:grid-cols-[8rem_1fr]">
                  <div>
                    <p className="font-mono text-xs text-ink-muted">{formatTime(log.at)}</p>
                    <Pill tone={logPillTone(log.level)} className="mt-2">
                      {log.source}
                    </Pill>
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
            <div className="rounded-lg border border-line p-5 text-sm text-ink-muted">
              {t('No API activity has been recorded in this session.', 'Belum ada aktivitas API yang tercatat pada sesi ini.')}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
