import type { RewardedAdService } from '../ads/RewardedAdService';
import type { AudioManager } from '../audio/AudioManager';
import type { InputManager } from '../input/InputManager';
import type { LocalSettings } from '../persistence/LocalSettings';
import type { Platform } from '../platform/Platform';
import type { GameRenderer } from '../render/GameRenderer';
import type { MenuScene } from '../render/MenuScene';
import type { ThumbnailRenderer } from '../render/ThumbnailRenderer';
import type { PurchaseService } from '../shop/PurchaseService';
import type { UIRoot } from '../ui/UIRoot';
import type { GameAuthority } from './GameAuthority';
import type { RaceMode } from '../game/RaceVerifier';
import type { AnalyticsService } from '../analytics/AnalyticsService';

export type ScreenId =
  | 'menu'
  | 'modes'
  | 'characters'
  | 'shop'
  | 'locker'
  | 'quests'
  | 'achievements'
  | 'season'
  | 'settings'
  | 'profile';

/** Services shared by every screen. */
export interface AppContext {
  authority: GameAuthority;
  settings: LocalSettings;
  audio: AudioManager;
  platform: Platform;
  input: InputManager;
  renderer: GameRenderer;
  menu: MenuScene;
  thumbs: ThumbnailRenderer;
  rewarded: RewardedAdService;
  purchases: PurchaseService;
  analytics: AnalyticsService;
  ui: UIRoot;
  go(screen: ScreenId, params?: Record<string, unknown>): void;
  startRace(trackId: string, mode: RaceMode): void;
  /** Queues for an online race against other players (needs our server and accepted terms). */
  startOnline(): void;
  /** Base URL of our server when connected to it, else null (online races unavailable). */
  readonly serverUrl: string | null;
  /** Shows an error from an authority call as a friendly toast. */
  fail(err: unknown): void;
}
