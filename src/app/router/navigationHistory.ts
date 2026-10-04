/**
 * BOSS Navigation History Tracker
 * Manages in-app route history stack for Back/Forward navigation.
 */

type Listener = () => void;

let historyStack: string[] = [window.location.pathname];
let currentIndex = 0;
const listeners = new Set<Listener>();

export const navigationHistory = {
  push(path: string) {
    if (historyStack[currentIndex] === path) return;
    historyStack = historyStack.slice(0, currentIndex + 1);
    historyStack.push(path);
    currentIndex = historyStack.length - 1;
    listeners.forEach((l) => l());
  },

  canGoBack(): boolean {
    return currentIndex > 0;
  },

  canGoForward(): boolean {
    return currentIndex < historyStack.length - 1;
  },

  back() {
    if (this.canGoBack()) {
      currentIndex--;
      const target = historyStack[currentIndex];
      window.history.pushState({}, '', target);
      window.dispatchEvent(new PopStateEvent('popstate'));
      listeners.forEach((l) => l());
    }
  },

  forward() {
    if (this.canGoForward()) {
      currentIndex++;
      const target = historyStack[currentIndex];
      window.history.pushState({}, '', target);
      window.dispatchEvent(new PopStateEvent('popstate'));
      listeners.forEach((l) => l());
    }
  },

  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
