const SoundTypes = {
    SOUND_MENTION: 'sound_mention',
    SOUND_REPLY: 'sound_reply',
    SOUND_DM: 'sound_dm',
    SOUND_CURRENT_MENTION: 'sound_current_mention',
    SOUND_CURRENT_REPLY: 'sound_current_reply',
    SOUND_CURRENT_NAME: 'sound_current_name',
    SOUND_USER_JOIN: 'sound_user_join',
    SOUND_USER_LEAVE: 'sound_user_leave',
    SOUND_MIC_ON: 'sound_mic_on',
    SOUND_MIC_OFF: 'sound_mic_off',
    SOUND_POPUP: 'sound_popup',
    SOUND_CONNECTED: 'sound_connected',
    SOUND_DISCONNECTED: 'sound_disconnected',
    SOUND_RECONNECTING: 'sound_reconnecting',
    NOTIFY_MENTION: 'notify_mention',
    NOTIFY_REPLY: 'notify_reply',
    NOTIFY_DM: 'notify_dm',
    NOTIFY_CURRENT_MENTION: 'notify_current_mention',
    NOTIFY_CURRENT_REPLY: 'notify_current_reply',
    NOTIFY_CURRENT_NAME: 'notify_current_name'
} as const;

type SoundType = typeof SoundTypes[keyof typeof SoundTypes];

const SoundFiles: Record<SoundType, string> = {
    [SoundTypes.SOUND_MENTION]: 'message',
    [SoundTypes.SOUND_REPLY]: 'message',
    [SoundTypes.SOUND_DM]: 'message',
    [SoundTypes.SOUND_CURRENT_MENTION]: 'message',
    [SoundTypes.SOUND_CURRENT_REPLY]: 'message',
    [SoundTypes.SOUND_CURRENT_NAME]: 'message',
    [SoundTypes.SOUND_USER_JOIN]: 'user-join',
    [SoundTypes.SOUND_USER_LEAVE]: 'user-leave',
    [SoundTypes.SOUND_MIC_ON]: 'mic-on',
    [SoundTypes.SOUND_MIC_OFF]: 'mic-off',
    [SoundTypes.SOUND_POPUP]: 'pop-up-message',
    [SoundTypes.SOUND_CONNECTED]: 'user-join',
    [SoundTypes.SOUND_DISCONNECTED]: 'user-leave',
    [SoundTypes.SOUND_RECONNECTING]: 'mic-off',
    [SoundTypes.NOTIFY_MENTION]: 'message',
    [SoundTypes.NOTIFY_REPLY]: 'message',
    [SoundTypes.NOTIFY_DM]: 'message',
    [SoundTypes.NOTIFY_CURRENT_MENTION]: 'message',
    [SoundTypes.NOTIFY_CURRENT_REPLY]: 'message',
    [SoundTypes.NOTIFY_CURRENT_NAME]: 'message',
};

const SoundLabels: Record<SoundType, string> = {
    [SoundTypes.SOUND_MENTION]: '🔔 Звук при @упоминании (в любом чате)',
    [SoundTypes.NOTIFY_MENTION]: '📬 Уведомление при @упоминании (в любом чате)',
    [SoundTypes.SOUND_REPLY]: '🔔 Звук при ответе на сообщение (в любом чате)',
    [SoundTypes.NOTIFY_REPLY]: '📬 Уведомление при ответе на сообщение (в любом чате)',
    [SoundTypes.SOUND_DM]: '🔔 Звук личного сообщения',
    [SoundTypes.NOTIFY_DM]: '📬 Уведомление о личном сообщении',
    [SoundTypes.SOUND_CURRENT_MENTION]: '🔔 Звук при @упоминании в текущем чате',
    [SoundTypes.NOTIFY_CURRENT_MENTION]: '📬 Уведомление при @упоминании в текущем чате',
    [SoundTypes.SOUND_CURRENT_REPLY]: '🔔 Звук при ответе в текущем чате',
    [SoundTypes.NOTIFY_CURRENT_REPLY]: '📬 Уведомление при ответе в текущем чате',
    [SoundTypes.SOUND_CURRENT_NAME]: '🔔 Звук при упоминании ника в текущем чате',
    [SoundTypes.NOTIFY_CURRENT_NAME]: '📬 Уведомление при упоминании ника в текущем чате',
    [SoundTypes.SOUND_USER_JOIN]: '🔔 Звук входа пользователя',
    [SoundTypes.SOUND_USER_LEAVE]: '🔔 Звук выхода пользователя',
    [SoundTypes.SOUND_MIC_ON]: '🔔 Звук включения микрофона',
    [SoundTypes.SOUND_MIC_OFF]: '🔔 Звук выключения микрофона',
    [SoundTypes.SOUND_POPUP]: '🔔 Звук всплывающего уведомления',
    [SoundTypes.SOUND_CONNECTED]: '🔔 Звук подключения к серверу',
    [SoundTypes.SOUND_DISCONNECTED]: '🔔 Звук отключения от сервера',
    [SoundTypes.SOUND_RECONNECTING]: '🔔 Звук попытки переподключения',
};

interface SoundGroup {
    name: string;
    types: SoundType[];
}

const SoundGroups: SoundGroup[] = [
    { name: '🔔 Звуки — Персональные', types: [SoundTypes.SOUND_MENTION, SoundTypes.SOUND_REPLY, SoundTypes.SOUND_DM] },
    { name: '📬 Уведомления — Персональные', types: [SoundTypes.NOTIFY_MENTION, SoundTypes.NOTIFY_REPLY, SoundTypes.NOTIFY_DM] },
    { name: '🔔 Звуки — В текущем чате', types: [SoundTypes.SOUND_CURRENT_MENTION, SoundTypes.SOUND_CURRENT_REPLY, SoundTypes.SOUND_CURRENT_NAME] },
    { name: '📬 Уведомления — В текущем чате', types: [SoundTypes.NOTIFY_CURRENT_MENTION, SoundTypes.NOTIFY_CURRENT_REPLY, SoundTypes.NOTIFY_CURRENT_NAME] },
    { name: '🔔 Звуки — Системные', types: [SoundTypes.SOUND_USER_JOIN, SoundTypes.SOUND_USER_LEAVE, SoundTypes.SOUND_MIC_ON, SoundTypes.SOUND_MIC_OFF, SoundTypes.SOUND_POPUP, SoundTypes.SOUND_CONNECTED, SoundTypes.SOUND_DISCONNECTED, SoundTypes.SOUND_RECONNECTING] },
];

class SoundManager {
    static SoundTypes = SoundTypes;

    static client: any = null;
    static initialized: boolean = false;
    static settingsCache: Record<string, boolean> | null = null;
    static storageKey: string = 'voicechat_sound_settings';
    static _lastPlayTime: Record<string, number> = {};
    static _playLocks: Set<string> = new Set();

    static init(client: any): void {
        this.client = client;
        this.initialized = true;
        this.loadSettings();
    }

    static debugSettings(): void {
        console.log('🔊 [SOUND] ========== ТЕКУЩИЕ НАСТРОЙКИ ЗВУКОВ ==========');
        for (const type of Object.values(this.SoundTypes)) {
            const enabled = this.isEnabled(type);
            const label = SoundLabels[type] || type;
            console.log(`🔊 [SOUND] ${label}: ${enabled ? '✅ ВКЛ' : '❌ ВЫКЛ'}`);
        }
        console.log('🔊 [SOUND] =============================================');
    }

    static isEnabled(settingType: SoundType): boolean {
        if (!this.initialized) return true;
        const enabled = this.settingsCache?.[settingType] !== false;
        console.log(`🔊 [SOUND] isEnabled(${settingType}) = ${enabled}`);
        return enabled;
    }

    static loadSettings(): void {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                this.settingsCache = JSON.parse(saved);
            } else {
                this.settingsCache = {};
                for (const type of Object.values(this.SoundTypes)) {
                    this.settingsCache[type] = true;
                }
                this.saveSettings();
            }
        } catch (e) {
            console.error('❌ [SoundManager] Ошибка загрузки настроек:', e);
            this.settingsCache = {};
            for (const type of Object.values(this.SoundTypes)) {
                this.settingsCache[type] = true;
            }
        }
    }

    static saveSettings(): void {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.settingsCache));
        } catch (e) {
            console.error('❌ [SoundManager] Ошибка сохранения настроек:', e);
        }
    }

    static setEnabled(settingType: SoundType, enabled: boolean): void {
        if (!this.settingsCache) this.loadSettings();
        this.settingsCache![settingType] = enabled;
        this.saveSettings();
    }

    static playSound(soundType: SoundType): boolean {
        const now = Date.now();
        const last = this._lastPlayTime[soundType] || 0;
        if (now - last < 800) return false;

        if (this._playLocks.has(soundType)) return false;

        this._lastPlayTime[soundType] = now;
        this._playLocks.add(soundType);

        const soundFile = SoundFiles[soundType];
        if (!soundFile) {
            setTimeout(() => this._playLocks.delete(soundType), 200);
            return false;
        }

        if (!this.isEnabled(soundType)) {
            setTimeout(() => this._playLocks.delete(soundType), 200);
            return false;
        }

        if (this.client && typeof this.client.playSound === 'function') {
            try {
                this.client.playSound(soundFile);
            } catch (e) {
                console.error('❌ [SoundManager] Ошибка воспроизведения:', e);
            }
        }

        setTimeout(() => this._playLocks.delete(soundType), 400);
        return true;
    }

    static shouldNotify(notifyType: SoundType): boolean {
        return this.isEnabled(notifyType);
    }

    static getSoundTypes(): SoundType[] {
        return Object.values(this.SoundTypes);
    }

    static getGroupedSoundTypes(): SoundGroup[] {
        return SoundGroups;
    }

    static getLabel(settingType: SoundType): string {
        return SoundLabels[settingType] || settingType;
    }

    static resetToDefaults(): void {
        for (const type of Object.values(this.SoundTypes)) {
            this.settingsCache![type] = true;
        }
        this.saveSettings();
    }

    static analyzePersonalEvents(
        message: any,
        currentUserId: string,
        currentUsername: string
    ): { hasMention: boolean; hasReply: boolean; hasNameMention: boolean } {
        const result = { hasMention: false, hasReply: false, hasNameMention: false };
        if (!message || !currentUserId) return result;

        if (message.replyTo && message.replyTo.userId === currentUserId) {
            result.hasReply = true;
        }

        if (message.text && currentUsername) {
            const lowerText = message.text.toLowerCase();
            const lowerUsername = currentUsername.toLowerCase();
            const escapedUsername = this.escapeRegExp(lowerUsername);
            const mentionPattern = new RegExp(`@${escapedUsername}(?=[\\s,.!?;:()\\[\\]{}"']|$)`, 'i');
            if (mentionPattern.test(lowerText)) {
                result.hasMention = true;
            }
            if (!result.hasMention) {
                const namePattern = new RegExp(`(?<=^|[\\s,.!?;:()\\[\\]{}"'])${escapedUsername}(?=[\\s,.!?;:()\\[\\]{}"']|$)`, 'i');
                if (namePattern.test(lowerText)) {
                    result.hasNameMention = true;
                }
            }
        }
        return result;
    }

    static escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

export default SoundManager;
