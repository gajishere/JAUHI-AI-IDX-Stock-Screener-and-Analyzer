import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PrimaryButton, QuietButton } from '../components/report';
import { claudeAIService } from '../lib/claudeAI';
import { clearAILogs, getAIStatusSnapshot, subscribeAIStatus } from '../lib/aiSession';

function formatTime(value) {
  if (!value) return 'Never';
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
          <p className="font-mono text-xs text-ink-muted">Claude runtime</p>
          <h2 className="mt-1 font-serif text-4xl font-medium tracking-tight">AI Status</h2>
        </div>
        <PrimaryButton onClick={runHealthCheck} loading={checking}>
          Run live check
        </PrimaryButton>
      </header>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-line p-5">
          <p className="text-sm text-ink-muted">Runtime status</p>
          <div className="mt-3 flex items-center gap-2">
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusTone(status)}`}>
              {status}
            </span>
            {snapshot.active && (
              <span className="font-mono text-xs text-ink-muted">{snapshot.activeCount} active</span>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-line p-5">
          <p className="text-sm text-ink-muted">Configuration</p>
          <p className="mt-3 text-sm font-medium">{snapshot.configured ? 'API key detected' : 'API key missing'}</p>
        </div>

        <div className="rounded-lg border border-line p-5">
          <p className="text-sm text-ink-muted">Last successful check</p>
          <p className="mt-3 font-mono text-sm">{formatTime(snapshot.lastSuccessAt)}</p>
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
            <h3 className="font-serif text-2xl font-medium">Session Activity</h3>
            <p className="mt-1 font-mono text-xs text-ink-muted">
              Last checked {formatTime(snapshot.lastCheckedAt)}
            </p>
          </div>
          <QuietButton onClick={clearAILogs}>Clear log</QuietButton>
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
                        className="rounded-md border border-line px-3 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-ink-muted hover:text-ink"
                      >
                        {expanded.has(log.id) ? 'Hide details' : 'Details'}
                      </button>
                    )}
                  </div>
                  {log.summary && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{log.summary}</p>}
                  {log.details && <p className="mt-2 font-mono text-xs text-ink-muted">{log.details}</p>}
                  {expanded.has(log.id) && (
                    <div className="mt-4 space-y-4 rounded-lg border border-line bg-well/30 p-4">
                      {log.evidence?.note && (
                        <p className="text-xs leading-relaxed text-ink-muted">{log.evidence.note}</p>
                      )}
                      {log.evidence?.sections?.map((section, index) => (
                        <DetailSection key={`${log.id}-${section.title}-${index}`} section={section} />
                      ))}
                      {!log.evidence?.sections?.length && log.details && (
                        <DetailSection section={{ title: 'Details', text: log.details }} />
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-5 rounded-lg border border-line p-5 text-sm text-ink-muted">
            No AI activity has been recorded in this session.
          </div>
        )}
      </section>
    </div>
  );
}
