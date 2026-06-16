import { Link, useLocation } from 'react-router-dom';
import ApiStatusPage from './pages/ApiStatusPage';
import StockAnalysisPage from './pages/StockAnalysisPage';
import StockScreeningPage from './pages/StockScreeningPage';
import { SettingsMenu } from './components/SettingsMenu';
import { useT } from './lib/i18n';

function App() {
  const t = useT();
  const location = useLocation();
  const isAnalysisPage = location.pathname === '/analysis' || location.pathname === '/';
  const isScreeningPage = location.pathname === '/screening';
  const isApiStatusPage = location.pathname === '/api-status';

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto w-full max-w-4xl px-5 pt-8 sm:px-6 sm:pt-12">
          <div className="space-y-5 sm:space-y-6">
            <div className="flex items-start justify-between gap-4">
              <p className="font-mono text-xs text-ink-muted">
                {t('Indonesia Stock Exchange · flow research desk', 'Bursa Efek Indonesia · meja riset aliran dana')}
              </p>
              <SettingsMenu />
            </div>
            <h1 className="mt-0 font-serif text-2xl font-medium tracking-tight sm:text-3xl">
              {t('IDX Stock Analysis', 'Analisis Saham IDX')}{' '}
              <span className="font-normal italic text-ink-muted">&</span>{' '}
              {t('Screening', 'Penyaringan')}
            </h1>
            <nav className="-mx-2 mt-2 flex flex-wrap gap-x-3 gap-y-1 sm:mx-0 sm:mt-4 sm:gap-x-6">
              <Link
                to="/analysis"
                className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-2 text-sm font-medium transition-colors duration-150 sm:min-h-0 sm:px-0 sm:pb-3 ${
                  isAnalysisPage
                    ? 'border-brand text-ink'
                    : 'border-transparent text-ink-muted hover:border-brand/20 hover:text-ink/80'
                }`}
              >
                {t('Stock Analysis', 'Analisis Saham')}
              </Link>
              <Link
                to="/screening"
                className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-2 text-sm font-medium transition-colors duration-150 sm:min-h-0 sm:px-0 sm:pb-3 ${
                  isScreeningPage
                    ? 'border-brand text-ink'
                    : 'border-transparent text-ink-muted hover:border-brand/20 hover:text-ink/80'
                }`}
              >
                {t('Stock Screening', 'Penyaringan Saham')}
              </Link>
              <Link
                to="/api-status"
                className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-2 text-sm font-medium transition-colors duration-150 sm:min-h-0 sm:px-0 sm:pb-3 ${
                  isApiStatusPage
                    ? 'border-brand text-ink'
                    : 'border-transparent text-ink-muted hover:border-brand/20 hover:text-ink/80'
                }`}
              >
                {t('API Status', 'Status API')}
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 sm:px-6 sm:py-16">
        {/* Both surfaces stay mounted and are toggled with `hidden`, so each tab
            keeps its full state — screening results, uploaded screenshots, the
            in-progress flow — when you switch between them. Screening shows on
            /screening; everything else (including the default route) shows
            Analysis. `hidden` is display:none, so the inactive tab also leaves
            the accessibility tree and tab order. */}
        <div className="route-panel" hidden={!isAnalysisPage}>
          <StockAnalysisPage />
        </div>
        <div className="route-panel" hidden={!isScreeningPage}>
          <StockScreeningPage />
        </div>
        <div className="route-panel" hidden={!isApiStatusPage}>
          <ApiStatusPage />
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-6">
          <p className="text-xs text-ink-muted">
            {t(
              'Research notes are computed from public market data and are not investment advice.',
              'Catatan riset dihitung dari data pasar publik dan bukan merupakan nasihat investasi.',
            )}
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
