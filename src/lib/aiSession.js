const STORAGE_KEY = 'idx-ai-session-log';
const MAX_LOGS = 80;

const listeners = new Set();

let state = {
  configured: false,
  activeCount: 0,
  lastCheckedAt: null,
  lastSuccessAt: null,
  lastError: null,
  logs: loadLogs(),
};

function loadLogs() {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLogs(logs) {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)));
}

function emit() {
  const snapshot = getAIStatusSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

function addLog(entry) {
  const log = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    at: new Date().toISOString(),
    level: entry.level || 'info',
    source: entry.source || 'AI',
    title: entry.title,
    summary: entry.summary,
    details: entry.details,
    evidence: entry.evidence,
  };
  state = { ...state, logs: [log, ...state.logs].slice(0, MAX_LOGS) };
  saveLogs(state.logs);
  emit();
  return log;
}

export function setAIConfigured(configured) {
  state = { ...state, configured: Boolean(configured) };
  emit();
}

export function startAIActivity({ source, title, summary, details, evidence }) {
  state = {
    ...state,
    activeCount: state.activeCount + 1,
    lastCheckedAt: new Date().toISOString(),
    lastError: null,
  };
  const log = addLog({
    level: 'active',
    source,
    title: title || 'AI request started',
    summary,
    details,
    evidence,
  });
  return log.id;
}

export function finishAIActivity(id, { source, title, summary, details, evidence, error } = {}) {
  const success = !error;
  state = {
    ...state,
    activeCount: Math.max(0, state.activeCount - 1),
    lastCheckedAt: new Date().toISOString(),
    lastSuccessAt: success ? new Date().toISOString() : state.lastSuccessAt,
    lastError: error ? String(error.message || error) : null,
  };
  addLog({
    level: success ? 'success' : 'error',
    source,
    title: title || (success ? 'AI request completed' : 'AI request failed'),
    summary,
    details: details || (id ? `Request id: ${id}` : undefined),
    evidence,
  });
}

export function recordAIEvent(entry) {
  return addLog(entry);
}

export function clearAILogs() {
  state = { ...state, logs: [] };
  saveLogs([]);
  emit();
}

export function getAIStatusSnapshot() {
  return {
    ...state,
    active: state.activeCount > 0,
    logs: [...state.logs],
  };
}

export function subscribeAIStatus(listener) {
  listeners.add(listener);
  listener(getAIStatusSnapshot());
  return () => listeners.delete(listener);
}
