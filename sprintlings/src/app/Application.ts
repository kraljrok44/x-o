import { AnalyticsService } from '../analytics/AnalyticsService';
import { analyticsAllowed } from '../analytics/PrivacyConsent';
import { interstitialAllowed } from '../ads/AdEligibility';
import { RewardedAdService } from '../ads/RewardedAdService';
import { AudioManager } from '../audio/AudioManager';
import { EconomyError } from '../economy/EconomyError';
import type { RaceMode } from '../game/RaceVerifier';
import { getValidatedRemix } from '../game/TrackValidator';
import { InputManager } from '../input/InputManager';
import { createBrowserStore } from '../persistence/KeyValueStore';
import { LocalSettings, defaultSettings } from '../persistence/LocalSettings';
import { createPlatform } from '../platform/createPlatform';
import type { Platform } from '../platform/Platform';
import { GameRenderer, detectQuality } from '../render/GameRenderer';
import { MenuScene } from '../render/MenuScene';
import { ThumbnailRenderer } from '../render/ThumbnailRenderer';
import { achievementsScreen } from '../ui/AchievementsScreen';
import { characterSelect } from '../ui/CharacterSelect';
import { h } from '../ui/dom';
import { t } from '../ui/i18n';
import { inventoryScreen } from '../ui/InventoryScreen';
import { mainMenu } from '../ui/MainMenu';
import { modeSelect } from '../ui/ModeSelect';
import { preRace } from '../ui/PreRace';
import { profileScreen } from '../ui/ProfileScreen';
import { questScreen } from '../ui/QuestScreen';
import { resultsScreen } from '../ui/ResultsScreen';
import { seasonScreen } from '../ui/SeasonScreen';
import { settingsScreen } from '../ui/SettingsScreen';
import { shopScreen } from '../ui/ShopScreen';
import { UIRoot, type Screen } from '../ui/UIRoot';
import type { AppContext, ScreenId } from './AppContext';
import { createAuthority } from './createAuthority';
import { showFatal } from './GameBootstrap';
import { RaceController } from './RaceController';
import { MatchmakingClient } from '../network/MatchmakingClient';
import { OnlineLink } from '../network/OnlineLink';
import { ensureTerms, showTerms, termsAccepted } from '../ui/TermsDialog';
import { SceneManager } from './SceneManager';
import { APP_TRANSITIONS, StateMachine, type AppState } from './StateMachine';

/**
 * Wires every system together and owns the main loop.
 * Boot order: platform SDK -> settings -> renderer -> storage/authority ->
 * scenes and UI -> main menu.
 */
export class Application implements AppContext {
  authority!: AppContext['authority'];
  settings!: LocalSettings;
  audio = new AudioManager();
  platform!: Platform;
  input!: InputManager;
  renderer!: GameRenderer;
  menu!: MenuScene;
  thumbs!: ThumbnailRenderer;
  rewarded!: RewardedAdService;
  purchases!: AppContext['purchases'];
  analytics!: AnalyticsService;
  ui: UIRoot;
  private scenes!: SceneManager;
  private readonly state = new StateMachine<AppState>('boot', APP_TRANSITIONS);
  private race: RaceController | null = null;
  private last = performance.now();
  private loadingEl: HTMLElement | null = null;
  private loadBar: HTMLElement | null = null;

  constructor(private readonly root: HTMLElement) {
    this.ui = new UIRoot(root.querySelector('#ui')!, root.querySelector('#overlay')!, root.querySelector('#toasts')!);
  }

  private progress(p: number): void {
    if (this.loadBar) this.loadBar.style.width = `${Math.round(p * 100)}%`;
  }

  private showLoading(): void {
    this.loadBar = h('div');
    this.loadingEl = h(
      'div',
      { class: 'screen loading' },
      h('div', { class: 'logo' }, 'Sprint', h('span', null, 'lings')),
      h('div', { class: 'tagline' }, 'Jump · Dodge · Outsmart'),
      h('div', { class: 'loadbar' }, this.loadBar),
      h('div', { class: 'small', style: 'opacity:.7' }, t('Loading…')),
    );
    this.ui.show({ el: this.loadingEl });
  }

  async boot(): Promise<void> {
    this.showLoading();
    this.progress(0.05);
    this.platform = await createPlatform();
    this.platform.onMuteRequest = (m) => this.audio.applySettings({ ...this.settings.value.audio, muted: m || this.settings.value.audio.muted });
    this.platform.onPauseRequest = (paused) => {
      if (paused) {
        this.audio.suspend('portal');
        this.race?.pause();
      } else this.audio.resume('portal');
    };
    await this.platform.init();
    this.platform.loadingStart();
    this.progress(0.25);

    const browserStore = await createBrowserStore();
    this.settings = new LocalSettings(browserStore, defaultSettings(detectQuality()));
    await this.settings.load();
    document.body.classList.toggle('reduced-motion', this.settings.value.reducedMotion);
    this.audio.applySettings(this.settings.value.audio);
    this.progress(0.35);

    this.renderer = new GameRenderer(this.root, this.settings.value.graphics);
    this.renderer.onContextLost = () => showFatal(t('Something went wrong'), t('The graphics context was lost. Reload to continue.'));
    this.input = new InputManager(this.root);
    this.input.setBindings(this.settings.value.bindings);
    this.input.onActivity = () => this.audio.unlock();
    this.input.onPause = () => this.onEscape();
    this.ui.setClickSound(() => {
      this.audio.unlock();
      this.audio.play('click');
    });
    this.progress(0.5);

    const auth = await createAuthority(this.platform, browserStore);
    this.authority = auth.authority;
    this.purchases = auth.purchases;
    this.serverUrl = auth.serverUrl;
    await this.authority.init();
    if (!this.authority.profile.tutorialDone && this.authority.profile.name === 'Sprinter') {
      const portalName = await this.platform.userName();
      if (portalName) await this.authority.setName(portalName).catch(() => {});
    }
    this.progress(0.7);

    this.rewarded = new RewardedAdService(this.platform.ads, this.authority);
    this.platform.ads.onAdStart = () => this.audio.suspend('ad');
    this.platform.ads.onAdEnd = () => this.audio.resume('ad');
    this.analytics = new AnalyticsService(this.platform.usesOwnServer ? `${auth.serverUrl ?? ''}/api/analytics` : null, () => analyticsAllowed(this.settings, this.platform.id));
    this.menu = new MenuScene(this.renderer, 'forest');
    this.thumbs = new ThumbnailRenderer(this.renderer);
    this.scenes = new SceneManager(this.menu);
    this.settings.onChange((s) => {
      this.renderer.setQuality(s.graphics);
      this.audio.applySettings(s.audio);
    });
    window.addEventListener('resize', () => this.scenes.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.audio.suspend('hidden');
        this.race?.pause();
        void this.authority.flush();
      } else this.audio.resume('hidden');
    });
    window.addEventListener('pagehide', () => void this.authority.flush());
    this.progress(1);
    this.platform.loadingStop();
    this.state.go('menu');
    this.go('menu');
    this.audio.playMenuMusic();
    requestAnimationFrame(this.loop);
    this.analytics.track('boot', { platform: this.platform.id });
  }

  private readonly loop = (now: number): void => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    try {
      this.scenes.frame(dt);
      this.ui.update(dt);
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame(this.loop);
  };

  private onEscape(): void {
    if (this.race && (this.race.phase === 'racing' || this.race.phase === 'paused') && !this.ui.modalOpen) {
      this.race.togglePause();
      return;
    }
    if (this.race?.phase === 'paused' && this.ui.modalOpen) {
      this.race.resume();
      return;
    }
    this.ui.back();
  }

  fail(err: unknown): void {
    const msg = err instanceof EconomyError ? err.message : err instanceof Error ? err.message : String(err);
    this.audio.play('error');
    this.ui.toast(msg, 'bad', 3200);
  }

  go(screen: ScreenId, params: Record<string, unknown> = {}): void {
    const make: Record<ScreenId, () => Screen> = {
      menu: () => mainMenu(this),
      modes: () => modeSelect(this),
      characters: () => characterSelect(this),
      shop: () => shopScreen(this, params as { tab?: never }),
      locker: () => inventoryScreen(this),
      quests: () => questScreen(this),
      achievements: () => achievementsScreen(this),
      season: () => seasonScreen(this),
      settings: () => settingsScreen(this),
      profile: () => profileScreen(this),
    };
    this.ui.closeAllModals();
    this.ui.show(make[screen]());
  }

  async startRace(trackIdOrRemix: string, mode: RaceMode): Promise<void> {
    if (this.state.state !== 'menu' && this.state.state !== 'results' && this.state.state !== 'race') return;
    this.audio.unlock();
    let trackId = trackIdOrRemix;
    if (trackIdOrRemix.startsWith('remix:')) {
      this.ui.toast(t('Loading…'));
      await new Promise((r) => setTimeout(r, 30));
      trackId = getValidatedRemix(trackIdOrRemix.slice(6)).data.id;
    }
    let ticket;
    try {
      ticket = await this.authority.startRace(trackId, mode, this.settings.value.difficulty);
    } catch (e) {
      this.fail(e);
      return;
    }
    if (mode !== 'remix' && mode !== 'practice') this.settings.update({ lastTrack: trackId });
    this.disposeRace();
    const race = new RaceController(this, ticket);
    this.race = race;
    this.scenes.race = race;
    this.state.go('lobby');
    race.onRestart = () => {
      this.ui.closeAllModals();
      void this.startRaceFromResults(trackIdOrRemix, mode);
    };
    race.onQuit = () => this.toMenu();
    race.onFinished = (summary, settlement) => {
      this.state.go('results');
      const screen = resultsScreen(this, summary, settlement, {
        again: () => void this.afterResults(() => this.startRaceFromResults(trackIdOrRemix, mode)),
        done: () => void this.afterResults(() => this.toMenu()),
      });
      this.ui.show(screen);
    };
    this.ui.show(
      preRace(
        this,
        ticket,
        () => {
          this.state.go('race');
          this.ui.show(race.hudScreen());
          race.begin();
        },
        () => this.toMenu(),
        () => race.preload(),
      ),
    );
  }

  private async startRaceFromResults(trackIdOrRemix: string, mode: RaceMode): Promise<void> {
    this.disposeRace();
    if (this.state.state !== 'menu') this.state.go('menu');
    await this.startRace(trackIdOrRemix, mode);
  }

  /** Natural break: maybe show an interstitial (never during a race), then continue. */
  private async afterResults(next: () => void | Promise<void>): Promise<void> {
    const ads = this.platform.ads;
    const now = this.authority.now();
    if (ads.supportsInterstitial && interstitialAllowed(this.authority.profile, now).allowed) {
      this.authority.noteInterstitial();
      try {
        await ads.showInterstitial();
      } catch {
        /* never block progress on ad errors */
      }
    }
    await next();
  }

  private disposeRace(): void {
    if (this.race) {
      this.race.dispose();
      this.race = null;
      this.scenes.race = null;
    }
  }

  private toMenu(): void {
    this.disposeRace();
    this.platform.gameplayStop();
    if (this.state.state !== 'menu') this.state.go('menu');
    this.audio.playMenuMusic();
    this.go('menu');
    // Right after the tutorial race (and once per session until accepted): terms for online play and purchases.
    if (this.authority.profile.tutorialDone && !termsAccepted(this) && !this.termsAsked) {
      this.termsAsked = true;
      void showTerms(this, 'accept');
    }
  }

  private termsAsked = false;
  serverUrl: string | null = null;

  async startOnline(): Promise<void> {
    if (this.state.state !== 'menu' && this.state.state !== 'results') return;
    const token = this.authority.onlineToken?.() ?? null;
    if (!this.serverUrl || !token) {
      this.ui.toast(t('Online races need a connection to the game server. Please check your internet and reload.'), 'bad', 4000);
      return;
    }
    if (!(await ensureTerms(this))) return;
    this.audio.unlock();
    const client = new MatchmakingClient(this.serverUrl, token);
    const status = h('p', { style: 'text-align:center' }, t('Connecting…'));
    let cancelled = false;
    const modal = this.ui.modal(t('Online race'), h('div', { class: 'stack' }, h('div', { class: 'spinner' }), status), [
      {
        label: t('Cancel'),
        kind: 'ghost',
        run: () => {
          cancelled = true;
          client.send({ t: 'leave' });
          client.close();
        },
      },
    ], { dismissable: false });
    try {
      await client.connect();
    } catch {
      this.ui.closeModal(modal);
      if (!cancelled) this.ui.toast(t('Could not reach the race server. Please try again.'), 'bad');
      return;
    }
    if (cancelled) return client.close();
    client.onClose = () => {
      if (cancelled) return;
      this.ui.closeModal(modal);
      this.ui.toast(t('Connection to the race server was lost.'), 'bad');
    };
    client.onMessage = (m) => {
      if (m.t === 'queued') status.textContent = t('Finding riders… {n}/4 (bots fill empty seats)', { n: m.players });
      else if (m.t === 'error') {
        this.ui.closeModal(modal);
        client.close();
        this.ui.toast(m.message === 'unauthorized' ? t('Please reload the game to sign in again.') : m.message, 'bad');
      } else if (m.t === 'match') {
        this.ui.closeModal(modal);
        this.launchOnline(new OnlineLink(client, m.room));
      }
    };
    client.queue();
  }

  private launchOnline(link: OnlineLink): void {
    this.disposeRace();
    if (this.state.state !== 'menu') this.state.go('menu');
    const race = new RaceController(this, link.ticket, link);
    this.race = race;
    this.scenes.race = race;
    this.state.go('lobby');
    link.onDisconnect = () => {
      if (race.phase === 'results') return;
      this.ui.toast(t('Connection to the race server was lost.'), 'bad', 4000);
      this.toMenu();
    };
    race.onQuit = () => this.toMenu();
    race.onFinished = (summary, settlement) => {
      this.state.go('results');
      this.ui.show(
        resultsScreen(this, summary, settlement, {
          again: () => void this.afterResults(() => (this.toMenu(), this.startOnline())),
          done: () => void this.afterResults(() => this.toMenu()),
        }),
      );
    };
    let readySent = false;
    this.ui.show(
      preRace(
        this,
        link.ticket,
        () => {
          this.state.go('race');
          this.ui.show(race.hudScreen());
          race.begin();
        },
        () => this.toMenu(),
        () => {
          const p = race.preload();
          if (p >= 1 && !readySent) {
            readySent = true;
            link.ready();
          }
          return p;
        },
        { yourIndex: link.me, waitFor: () => link.started },
      ),
    );
  }
}
