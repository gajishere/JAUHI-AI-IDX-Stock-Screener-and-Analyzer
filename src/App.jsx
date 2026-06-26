import { Link, useLocation } from 'react-router-dom';
import ApiStatusPage from './pages/ApiStatusPage';
import AutoScreeningPage from './pages/AutoScreeningPage';
import LandingPage from './pages/LandingPage';
import StockAnalysisPage from './pages/StockAnalysisPage';
import StockScreeningPage from './pages/StockScreeningPage';
import { NavMenu } from './components/NavMenu';
import { SettingsMenu } from './components/SettingsMenu';
import { GlassFilter } from './components/LiquidGlass';
import CosmicBackdrop from './components/CosmicBackdrop';
import Logo from './components/Logo';
import { useT } from './lib/i18n';

function App() {
  const t = useT();
  const location = useLocation();
  // The marketing landing page is the front door (route '/'); the live
  // auto-screener now lives at its own '/auto-screening' route.
  const isLandingPage = location.pathname === '/';
  const isAutoPage = location.pathname === '/auto-screening';
  const isAnalysisPage = location.pathname === '/analysis';
  const isScreeningPage = location.pathname === '/screening';
  const isApiStatusPage = location.pathname === '/api-status';

  return (
    <>
    {/* Cosmoq starfield + aurora — kept OUTSIDE the overflow-x-clip wrapper below
        so the fixed deep-space layer always spans the full viewport (the clip would
        otherwise crop it at the scrollbar gutter). */}
    <CosmicBackdrop />
    <div className="flex min-h-screen flex-col overflow-x-clip pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
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
            <h1 className="display min-w-0 font-serif text-2xl font-medium tracking-tight sm:text-3xl">
              <Link
                to="/"
                className="tactile-soft flex min-w-0 items-start gap-3 rounded-md"
                aria-label={t('IDX Stock Analysis & Screening — home', 'Analisis & Penyaringan Saham IDX — beranda')}
              >
                <Logo className="mt-1 h-5 w-auto shrink-0 sm:mt-[3px] sm:h-6" />
                <span className="min-w-0">
                  {t('IDX Stock Analysis', 'Analisis Saham IDX')}{' '}
                  <span className="font-normal italic text-ink-muted">&</span>{' '}
                  {t('Screening', 'Penyaringan')}
                </span>
              </Link>
            </h1>
            <div className="-mt-1 flex shrink-0 items-center gap-2.5 sm:-mt-1.5">
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
        <div className="route-panel" hidden={!isLandingPage}>
          <LandingPage />
        </div>
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
          <div className="flex items-start justify-between gap-4">
            <p className="text-xs text-ink-muted">
              {t(
                'Research notes are generated from live market data and are not investment advice.',
                'Catatan riset dihasilkan dari data pasar real-time dan bukan merupakan nasihat investasi.',
              )}
            </p>
            <p className="text-xs text-ink-muted shrink-0">JAUHI AI Version 4.0</p>
          </div>
        </div>
      </footer>
    </div>
    </>
  );
}

export default App;
