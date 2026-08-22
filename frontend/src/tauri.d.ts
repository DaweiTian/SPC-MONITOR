interface Window {
  __TAURI__: {
    core: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
    event: { listen: (event: string, handler: (payload: unknown) => void) => Promise<() => void>; emit: (event: string, payload?: unknown) => Promise<void> };
    window: {
      Window: {
        getByLabel: (label: string) => TauriWindow | null;
        getCurrent: () => TauriWindow;
      };
    };
    dialog: { open: (options?: { filters?: { name: string; extensions: string[] }[]; multiple?: boolean }) => Promise<string | string[] | null> };
  };
}

interface TauriWindow {
  show: () => Promise<void>;
  hide: () => Promise<void>;
  close: () => Promise<void>;
  setFocus: () => Promise<void>;
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  maximize: () => Promise<void>;
  unmaximize: () => Promise<void>;
  isVisible: () => Promise<boolean>;
  isMaximized: () => Promise<boolean>;
  setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void>;
}
