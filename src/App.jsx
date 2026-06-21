import { useLocation } from 'react-router-dom';
import ApiStatusPage from './pages/ApiStatusPage';
import AutoScreeningPage from './pages/AutoScreeningPage';
import StockAnalysisPage from './pages/StockAnalysisPage';
import StockScreeningPage from './pages/StockScreeningPage';
import { NavMenu } from './components/NavMenu';
import { SettingsMenu } from './components/SettingsMenu';
import { GlassFilter } from './components/LiquidGlass';
import Logo from './components/Logo';
import { useT } from './lib/i18n';

function App() {
  const t = useT();
  const location = useLocation();
  // The live auto-screener is the default landing page (route '/').
  const isAutoPage = location.pathname === '/' || location.pathname === '/auto-screening';
  const isAnalysisPage = location.pathname === '/analysis';
  const isScreeningPage = location.pathname === '/screening';
  const isApiStatusPage = location.pathname === '/api-status';

  return (
    <div className="flex min-h-screen flex-col pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {/* Single shared refraction filter for every liquid-glass surface. */}
      <GlassFilter />
      <header className="border-b border-line">
        <div className="mx-auto w-full max-w-4xl px-5 pb-6 pt-[max(2rem,env(safe-area-inset-top))] sm:px-6 sm:pb-8 sm:pt-12">
          <p className="font-mono text-xs text-ink-muted">
            {t('Indonesia Stock Exchange · flow research desk', 'Bursa Efek Indonesia · meja riset aliran dana')}
          </p>
          {/* Wordmark and the two icon controls share this row, so the icons pin
              to the title line — and because they're sized in the same step as the
              title (h-9 → sm:h-10 alongside text-2xl → sm:text-3xl), the pairing
              holds its vertical relationship at every breakpoint. The small top
              nudge centres the icons on the wordmark's cap band rather than its
              full line box. */}
          <div className="mt-2.5 flex items-start justify-between gap-4">
            <h1 className="flex min-w-0 items-start gap-3 font-serif text-2xl font-medium tracking-tight sm:text-3xl">
              <Logo className="mt-1 h-5 w-auto shrink-0 sm:mt-[3px] sm:h-6" />
              <span className="min-w-0">
                {t('IDX Stock Analysis', 'Analisis Saham IDX')}{' '}
                <span className="font-normal italic text-ink-muted">&</span>{' '}
                {t('Screening', 'Penyaringan')}
              </span>
            </h1>
            <div className="-mt-1 flex shrink-0 items-center gap-2 sm:-mt-1.5">
              <NavMenu />
              <SettingsMenu />
            </div>
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
        <div className="route-panel" hidden={!isAutoPage}>
          <AutoScreeningPage />
        </div>
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
        <div className="mx-auto w-full max-w-4xl px-5 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6">
          <p className="text-xs text-ink-muted">
            {t(
              'Research notes are generated from live market data and are not investment advice.',
              'Catatan riset dihasilkan dari data pasar real-time dan bukan merupakan nasihat investasi.',
            )}
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
