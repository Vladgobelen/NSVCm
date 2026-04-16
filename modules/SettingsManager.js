// modules/SettingsManager.js

/**
 * Менеджер пользовательских настроек интерфейса
 * Управляет настройками, не связанными со звуком
 */
class SettingsManager {
    static storageKey = 'voicechat_ui_settings';
    static settingsCache = null;
    static initialized = false;

    /**
     * Инициализация менеджера
     */
    static init() {
        if (this.initialized) return;
        
        this.loadSettings();
        this.initialized = true;
        console.log('⚙️ [SettingsManager] Инициализирован');
    }

    /**
     * Загружает настройки из localStorage
     */
    static loadSettings() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                this.settingsCache = JSON.parse(saved);
            } else {
                // Настройки по умолчанию
                this.settingsCache = {
                    copyOnClick: true  // Копировать сообщение по клику
                };
                this.saveSettings();
            }
            
            // Обеспечиваем наличие всех полей
            if (this.settingsCache.copyOnClick === undefined) {
                this.settingsCache.copyOnClick = true;
                this.saveSettings();
            }
        } catch (e) {
            console.error('⚙️ [SettingsManager] Ошибка загрузки настроек:', e);
            this.settingsCache = { copyOnClick: true };
        }
    }

    /**
     * Сохраняет настройки в localStorage
     */
    static saveSettings() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.settingsCache));
        } catch (e) {
            console.error('⚙️ [SettingsManager] Ошибка сохранения настроек:', e);
        }
    }

    /**
     * Получить настройку копирования по клику
     * @returns {boolean}
     */
    static getCopyOnClick() {
        if (!this.initialized) this.init();
        return this.settingsCache?.copyOnClick !== false; // По умолчанию true
    }

    /**
     * Установить настройку копирования по клику
     * @param {boolean} enabled 
     */
    static setCopyOnClick(enabled) {
        if (!this.settingsCache) this.loadSettings();
        this.settingsCache.copyOnClick = enabled;
        this.saveSettings();
        console.log(`⚙️ [SettingsManager] copyOnClick ${enabled ? 'включен' : 'выключен'}`);
    }

    /**
     * Экспорт настроек
     * @returns {Object}
     */
    static exportSettings() {
        return { ...this.settingsCache };
    }

    /**
     * Импорт настроек
     * @param {Object} settings 
     */
    static importSettings(settings) {
        if (settings.copyOnClick !== undefined) {
            this.settingsCache.copyOnClick = settings.copyOnClick;
        }
        this.saveSettings();
    }
}

export default SettingsManager;
