class SettingsManager {
    static storageKey: string = 'voicechat_ui_settings';
    static settingsCache: Record<string, any> | null = null;
    static initialized: boolean = false;

    static init(): void {
        if (this.initialized) return;
        this.loadSettings();
        this.initialized = true;
    }

    static loadSettings(): void {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                this.settingsCache = JSON.parse(saved);
            } else {
                this.settingsCache = { copyOnClick: false };
                this.saveSettings();
            }
            if (this.settingsCache!.copyOnClick === undefined) {
                this.settingsCache!.copyOnClick = true;
                this.saveSettings();
            }
        } catch (e) {
            this.settingsCache = { copyOnClick: false };
        }
    }

    static saveSettings(): void {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.settingsCache));
        } catch (e) {}
    }

    static getCopyOnClick(): boolean {
        if (!this.initialized) this.init();
        return this.settingsCache?.copyOnClick !== false;
    }

    static setCopyOnClick(enabled: boolean): void {
        if (!this.settingsCache) this.loadSettings();
        this.settingsCache!.copyOnClick = enabled;
        this.saveSettings();
    }

    static exportSettings(): Record<string, any> {
        return { ...this.settingsCache };
    }

    static importSettings(settings: Record<string, any>): void {
        if (settings.copyOnClick !== undefined) {
            this.settingsCache!.copyOnClick = settings.copyOnClick;
        }
        this.saveSettings();
    }
}

export default SettingsManager;
