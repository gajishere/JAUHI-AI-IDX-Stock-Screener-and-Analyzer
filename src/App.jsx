import { Link, useLocation } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import AIStatusPage from './pages/AIStatusPage';
import StockAnalysisPage from './pages/StockAnalysisPage';
import StockScreeningPage from './pages/StockScreeningPage';

function App() {
  const location = useLocation();
  const isAnalysisPage = location.pathname === '/analysis' || location.pathname === '/';
  const isScreeningPage = location.pathname === '/screening';
  const isAIStatusPage = location.pathname === '/ai-status';

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto w-full max-w-4xl px-6 pt-12">
          <div className="space-y-6">
            <p className="font-mono text-xs text-ink-muted">
              Indonesia Stock Exchange · flow research desk
            </p>
            <h1 className="mt-0 font-serif text-2xl font-medium tracking-tight sm:text-3xl">
              IDX Stock Analysis <span className="font-normal italic text-ink-muted">&</span> Screening
            </h1>
            <nav className="mt-4 flex gap-6">
              <Link
                to="/analysis"
                className={`-mb-px border-b-2 pb-3 text-sm font-medium transition-colors duration-150 ${
                  isAnalysisPage
                    ? 'border-brand text-ink'
                    : 'border-transparent text-ink-muted hover:border-brand/20 hover:text-ink/80'
                }`}
              >
                Stock Analysis
              </Link>
              <Link
                to="/screening"
                className={`-mb-px border-b-2 pb-3 text-sm font-medium transition-colors duration-150 ${
                  isScreeningPage
                    ? 'border-brand text-ink'
                    : 'border-transparent text-ink-muted hover:border-brand/20 hover:text-ink/80'
                }`}
              >
                Stock Screening
              </Link>
              <Link
                to="/ai-status"
                className={`-mb-px border-b-2 pb-3 text-sm font-medium transition-colors duration-150 ${
                  isAIStatusPage
                    ? 'border-brand text-ink'
                    : 'border-transparent text-ink-muted hover:border-brand/20 hover:text-ink/80'
                }`}
              >
                AI Status
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
        {/* Both surfaces stay mounted and are toggled with `hidden`, so each tab
            keeps its full state — screening results, uploaded screenshots, the
            in-progress flow — when you switch between them. Screening shows on
            /screening; everything else (including the default route) shows
            Analysis. `hidden` is display:none, so the inactive tab also leaves
            the accessibility tree and tab order. */}
        <div hidden={!isAnalysisPage}>
          <StockAnalysisPage />
        </div>
        <div hidden={!isScreeningPage}>
          <StockScreeningPage />
        </div>
        <div hidden={!isAIStatusPage}>
          <AIStatusPage />
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-4xl px-6 py-8">
          <p className="text-xs text-ink-muted">
            Research notes are computed from public market data and are not investment advice.
          </p>
        </div>
      </footer>
      <Analytics />
    </div>
  );
}

export default App;
