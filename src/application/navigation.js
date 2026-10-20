// Navigation between screens as a pure reducer. The simulation only runs on the 'playing' screen;
// nothing else in the code base checks which menu is open.
export const SCREENS = Object.freeze(['main_menu', 'playing', 'paused', 'settings', 'credits']);
export const createNavigation = () => ({ screen: 'main_menu', back: null, confirm: null });

/**
 * actions: start · pause · resume · open_settings · open_credits · back · to_main_menu
 *          ask { confirm: { id, ...data } } · cancel_confirm
 */
export function navigate(nav, action) {
  const to = (screen, extra = {}) => ({ ...nav, screen, confirm: null, ...extra });
  switch (action.type) {
    case 'start': return to('playing', { back: null });
    case 'pause': return nav.screen === 'playing' ? to('paused') : nav;
    case 'resume': return nav.screen === 'paused' ? to('playing') : nav;
    case 'open_settings': return ['main_menu', 'paused', 'playing'].includes(nav.screen) ? to('settings', { back: nav.screen === 'playing' ? 'paused' : nav.screen }) : nav;
    case 'open_credits': return nav.screen === 'main_menu' ? to('credits', { back: 'main_menu' }) : nav;
    case 'back':
      if (nav.confirm) return { ...nav, confirm: null };
      if (nav.screen === 'settings' || nav.screen === 'credits') return to(nav.back || 'main_menu', { back: null });
      if (nav.screen === 'paused') return to('playing');
      return nav;
    case 'to_main_menu': return to('main_menu', { back: null });
    case 'ask': return { ...nav, confirm: { ...action.confirm } };
    case 'cancel_confirm': return { ...nav, confirm: null };
    default: return nav;
  }
}
/** True only while the player is in the town with no menu or dialog open. */
export const simulationRunning = nav => nav.screen === 'playing' && !nav.confirm;
/** The 3D town is shown in game and behind in-game menus, never behind the main menu. */
export const worldVisible = nav => nav.screen === 'playing' || nav.screen === 'paused' || (nav.screen === 'settings' && nav.back === 'paused');
