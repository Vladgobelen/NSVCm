// modules/ConsoleCommandManager.js
'use strict';

import UIManager from './UIManager.js';
import MediaManager from './MediaManager.js';
import VolumeBoostManager from './VolumeBoostManager.js';
import MembersManager from './MembersManager.js';
import RnnoiseManager from './RnnoiseManager.js';
import AvatarManager from './AvatarManager.js';
import SoundManager from './SoundManager.js';

class ConsoleCommandManager {
    static client = null;
    
    static COMMANDS = {
        '-войс': { description: 'Выполнить JS код (локально)', requireAuth: true, requireOwner: true, public: false },
        '-ВОЙС': { description: 'Выполнить JS код и отправить результат в чат', requireAuth: true, requireOwner: true, public: true },
        '-debug': { description: 'Отладочная информация', requireAuth: true, requireOwner: false, public: true, handler: 'handleDebug' },
        '-eval': { description: 'Вычислить выражение', requireAuth: true, requireOwner: true, public: true, handler: 'handleEval' },
        '-state': { description: 'Состояние клиента', requireAuth: true, requireOwner: false, public: true, handler: 'handleState' },
        '-consumers': { description: 'Список потребителей аудио', requireAuth: true, requireOwner: false, public: true, handler: 'handleConsumers' },
        '-volume': { description: 'Управление громкостью', requireAuth: true, requireOwner: false, public: true, handler: 'handleVolume' },
        '-transports': { description: 'Состояние транспортов', requireAuth: true, requireOwner: true, public: true, handler: 'handleTransports' },
        '-help': { description: 'Справка', requireAuth: false, requireOwner: false, public: true, handler: 'handleHelp' }
    };

    static init(client) {
        this.client = client;
        console.log('✅ [ConsoleCommandManager] Инициализирован');
    }

    static getCommandPrefix(line) {
        for (const prefix of Object.keys(this.COMMANDS)) {
            if (line === prefix || line.startsWith(prefix + ' ')) {
                return prefix;
            }
        }
        return null;
    }

    static handleRemoteCommand(text, senderName, senderId) {
        const firstLine = text.split('\n')[0].trim();
        const commandPrefix = this.getCommandPrefix(firstLine);
        
        if (!commandPrefix) return { result: null, error: 'Неизвестная команда' };
        
        const command = this.COMMANDS[commandPrefix];
        
        if (!this.client) return { result: null, error: 'Клиент не инициализирован' };
        
        const lines = text.split('\n');
        let args = '';
        if (firstLine.length > commandPrefix.length) {
            args = firstLine.substring(commandPrefix.length).trim();
        }
        const body = lines.slice(1).join('\n').trim();

        try {
            let result;
            
            if (command.handler && typeof this[command.handler] === 'function') {
                result = this[command.handler](args, body);
            } else {
                const codeToExecute = body || args;
                if (!codeToExecute) {
                    result = this.handleVoiceHelp();
                } else {
                    result = this.executeJavaScript(codeToExecute);
                }
            }

            const isPublic = command.public === true;
            
            return { result, error: null, isPublic, commandPrefix };
            
        } catch (error) {
            console.error('🔧 [ConsoleCommand] Ошибка:', error);
            return { result: null, error: error.message, isPublic: command.public, commandPrefix };
        }
    }

    static executeJavaScript(code) {
        if (!code) throw new Error('Код не указан');
        
        const func = new Function(
            'client', 'UIManager', 'MediaManager', 'VolumeBoostManager',
            'MembersManager', 'RnnoiseManager', 'AvatarManager', 'SoundManager', 'console',
            `return (${code})`
        );
        
        return func(
            this.client, UIManager, MediaManager, VolumeBoostManager,
            MembersManager, RnnoiseManager, AvatarManager, SoundManager, console
        );
    }

    static formatValue(value) {
        if (value === undefined) return 'undefined';
        if (value === null) return 'null';
        if (typeof value === 'function') return '[Function]';
        if (typeof value === 'object') {
            try {
                return JSON.stringify(value, null, 2);
            } catch (e) {
                return String(value);
            }
        }
        return String(value);
    }

    static handleVoiceHelp() {
        return `Примеры:\n-войс\n2 + 2\n\n-ВОЙС\nclient.consumerState.size`;
    }

    static handleDebug(args, body) {
        return {
            socket: this.client.socket?.connected,
            room: this.client.currentRoom,
            mic: this.client.isMicActive,
            consumers: this.client.consumerState?.size || 0
        };
    }

    static handleEval(args, body) {
        const code = args || body;
        if (!code) throw new Error('Укажите выражение');
        return eval(code);
    }

    static handleState(args, body) {
        return {
            connected: this.client.isConnected,
            room: this.client.currentRoom,
            mic: { active: this.client.isMicActive, paused: this.client.isMicPaused },
            consumers: { total: this.client.consumerState?.size || 0 },
            transports: {
                send: this.client.sendTransport?.connectionState,
                recv: this.client.recvTransport?.connectionState
            }
        };
    }

    static handleConsumers(args, body) {
        const consumers = [];
        if (this.client.consumerState) {
            for (const [id, state] of this.client.consumerState) {
                const userId = window.producerUserMap?.get(id) || 'unknown';
                consumers.push({
                    id: id.substring(0, 8),
                    user: MembersManager.getMember(userId)?.username || userId,
                    status: state.status
                });
            }
        }
        return consumers.length ? consumers : 'Нет потребителей';
    }

    static handleVolume(args, body) {
        const parts = args.split(/\s+/);
        const sub = parts[0] || 'list';
        
        if (sub === 'list') {
            const vols = [];
            for (const [uid, gain] of VolumeBoostManager.gainNodes) {
                vols.push({ user: MembersManager.getMember(uid)?.username || uid, gain: gain.gain.value });
            }
            return vols.length ? vols : 'Нет регулировок';
        }
        if (sub === 'set' && parts.length >= 3) {
            VolumeBoostManager.setGain(parts[1], parseFloat(parts[2]));
            return `Громкость ${parts[1]} = ${parts[2]}`;
        }
        if (sub === 'get' && parts.length >= 2) {
            return VolumeBoostManager.getGain(parts[1]);
        }
        throw new Error('-volume list | set <id> <val> | get <id>');
    }

    static handleTransports(args, body) {
        return {
            send: { state: this.client.sendTransport?.connectionState },
            recv: { state: this.client.recvTransport?.connectionState }
        };
    }

    static handleHelp(args, body) {
        return Object.entries(this.COMMANDS).map(([p, c]) => `${p} - ${c.description}`).join('\n');
    }
}

export default ConsoleCommandManager;
