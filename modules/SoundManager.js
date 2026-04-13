// modules/SoundManager.js

class SoundManager {
    static SoundTypes = {
        // Звуки
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
        
        // Уведомления (баннеры)
        NOTIFY_MENTION: 'notify_mention',
        NOTIFY_REPLY: 'notify_reply',
        NOTIFY_DM: 'notify_dm',
        NOTIFY_CURRENT_MENTION: 'notify_current_mention',
        NOTIFY_CURRENT_REPLY: 'notify_current_reply',
        NOTIFY_CURRENT_NAME: 'notify_current_name'
    };

    static SoundFiles = {
        [SoundManager.SoundTypes.SOUND_MENTION]: 'message',
        [SoundManager.SoundTypes.SOUND_REPLY]: 'message',
        [SoundManager.SoundTypes.SOUND_DM]: 'message',
        [SoundManager.SoundTypes.SOUND_CURRENT_MENTION]: 'message',
        [SoundManager.SoundTypes.SOUND_CURRENT_REPLY]: 'message',
        [SoundManager.SoundTypes.SOUND_CURRENT_NAME]: 'message',
        [SoundManager.SoundTypes.SOUND_USER_JOIN]: 'user-join',
        [SoundManager.SoundTypes.SOUND_USER_LEAVE]: 'user-leave',
        [SoundManager.SoundTypes.SOUND_MIC_ON]: 'mic-on',
        [SoundManager.SoundTypes.SOUND_MIC_OFF]: 'mic-off',
        [SoundManager.SoundTypes.SOUND_POPUP]: 'pop-up-message'
    };

    static SoundLabels = {
        [SoundManager.SoundTypes.SOUND_MENTION]: '🔔 Звук при @упоминании (в любом чате)',
        [SoundManager.SoundTypes.NOTIFY_MENTION]: '📬 Уведомление при @упоминании (в любом чате)',
        [SoundManager.SoundTypes.SOUND_REPLY]: '🔔 Звук при ответе на сообщение (в любом чате)',
        [SoundManager.SoundTypes.NOTIFY_REPLY]: '📬 Уведомление при ответе на сообщение (в любом чате)',
        [SoundManager.SoundTypes.SOUND_DM]: '🔔 Звук личного сообщения',
        [SoundManager.SoundTypes.NOTIFY_DM]: '📬 Уведомление о личном сообщении',
        [SoundManager.SoundTypes.SOUND_CURRENT_MENTION]: '🔔 Звук при @упоминании в текущем чате',
        [SoundManager.SoundTypes.NOTIFY_CURRENT_MENTION]: '📬 Уведомление при @упоминании в текущем чате',
        [SoundManager.SoundTypes.SOUND_CURRENT_REPLY]: '🔔 Звук при ответе в текущем чате',
        [SoundManager.SoundTypes.NOTIFY_CURRENT_REPLY]: '📬 Уведомление при ответе в текущем чате',
        [SoundManager.SoundTypes.SOUND_CURRENT_NAME]: '🔔 Звук при упоминании ника в текущем чате',
        [SoundManager.SoundTypes.NOTIFY_CURRENT_NAME]: '📬 Уведомление при упоминании ника в текущем чате',
        [SoundManager.SoundTypes.SOUND_USER_JOIN]: '🔔 Звук входа пользователя',
        [SoundManager.SoundTypes.SOUND_USER_LEAVE]: '🔔 Звук выхода пользователя',
        [SoundManager.SoundTypes.SOUND_MIC_ON]: '🔔 Звук включения микрофона',
        [SoundManager.SoundTypes.SOUND_MIC_OFF]: '🔔 Звук выключения микрофона',
        [SoundManager.SoundTypes.SOUND_POPUP]: '🔔 Звук всплывающего уведомления'
    };

    static SoundGroups = [
        {
            name: '🔔 Звуки — Персональные (из любого чата)',
            types: [
                SoundManager.SoundTypes.SOUND_MENTION,
                SoundManager.SoundTypes.SOUND_REPLY,
                SoundManager.SoundTypes.SOUND_DM
            ]
        },
        {
            name: '📬 Уведомления — Персональные (из любого чата)',
            types: [
                SoundManager.SoundTypes.NOTIFY_MENTION,
                SoundManager.SoundTypes.NOTIFY_REPLY,
                SoundManager.SoundTypes.NOTIFY_DM
            ]
        },
        {
            name: '🔔 Звуки — В текущем чате',
            types: [
                SoundManager.SoundTypes.SOUND_CURRENT_MENTION,
                SoundManager.SoundTypes.SOUND_CURRENT_REPLY,
                SoundManager.SoundTypes.SOUND_CURRENT_NAME
            ]
        },
        {
            name: '📬 Уведомления — В текущем чате',
            types: [
                SoundManager.SoundTypes.NOTIFY_CURRENT_MENTION,
                SoundManager.SoundTypes.NOTIFY_CURRENT_REPLY,
                SoundManager.SoundTypes.NOTIFY_CURRENT_NAME
            ]
        },
        {
            name: '🔔 Звуки — Системные',
            types: [
                SoundManager.SoundTypes.SOUND_USER_JOIN,
                SoundManager.SoundTypes.SOUND_USER_LEAVE,
                SoundManager.SoundTypes.SOUND_MIC_ON,
                SoundManager.SoundTypes.SOUND_MIC_OFF,
                SoundManager.SoundTypes.SOUND_POPUP
            ]
        }
    ];

    static client = null;
    static initialized = false;
    static settingsCache = null;
    static storageKey = 'voicechat_sound_settings';

    static init(client) {
        this.client = client;
        this.initialized = true;
        this.loadSettings();
    }

    static loadSettings() {
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
            this.settingsCache = {};
            for (const type of Object.values(this.SoundTypes)) {
                this.settingsCache[type] = true;
            }
        }
    }

    static saveSettings() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.settingsCache));
        } catch (e) {}
    }

    static isEnabled(settingType) {
        if (!this.initialized) return true;
        return this.settingsCache?.[settingType] !== false;
    }

    static setEnabled(settingType, enabled) {
        if (!this.settingsCache) this.loadSettings();
        this.settingsCache[settingType] = enabled;
        this.saveSettings();
    }

    static playSound(soundType) {
        if (!this.isEnabled(soundType)) return false;
        const soundFile = this.SoundFiles[soundType];
        if (!soundFile) return false;
        if (this.client && typeof this.client.playSound === 'function') {
            this.client.playSound(soundFile);
            return true;
        }
        return false;
    }

    static shouldNotify(notifyType) {
        return this.isEnabled(notifyType);
    }

    static getSoundTypes() {
        return Object.values(this.SoundTypes);
    }

    static getGroupedSoundTypes() {
        return this.SoundGroups;
    }

    static getLabel(settingType) {
        return this.SoundLabels[settingType] || settingType;
    }

    static resetToDefaults() {
        for (const type of Object.values(this.SoundTypes)) {
            this.settingsCache[type] = true;
        }
        this.saveSettings();
    }

    static analyzePersonalEvents(message, currentUserId, currentUsername) {
        const result = {
            hasMention: false,
            hasReply: false,
            hasNameMention: false
        };

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

    static escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

export default SoundManager;
