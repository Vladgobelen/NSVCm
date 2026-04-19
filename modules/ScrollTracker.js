// modules/ScrollTracker.js
import TextChatManager from './TextChatManager.js';

class ScrollTracker {
    static client = null;
    static _scrollToBottomBtn = null;
    static _scrollCheckTimeout = null;
    static _scrollBindInterval = null;
    static _lastViewedMessages = new Map();
    static _lastSentReadIds = new Map();
    static _maxSeenMessageId = new Map();
    static _firstUnreadId = new Map();
    static _unreadMessageIds = new Map();
    static _currentUnreadIndex = new Map();
    static _savePositionTimeout = null;
    static _buttonMode = 'bottom';

    static setClient(client) {
        this.client = client;
        this.setupScrollToBottomButton();
    }

    static _getButtonMode() {
        if (this._buttonMode === null) {
            try {
                const saved = localStorage.getItem('scrollButtonMode');
                this._buttonMode = (saved === 'unread') ? 'unread' : 'bottom';
            } catch (e) {
                this._buttonMode = 'bottom';
            }
        }
        return this._buttonMode;
    }

    static _setButtonMode(mode) {
        this._buttonMode = mode;
        try {
            localStorage.setItem('scrollButtonMode', mode);
        } catch (e) {}
        this._updateButtonAppearance();
    }

    static _updateButtonAppearance() {
        if (!this._scrollToBottomBtn) return;
        const mode = this._getButtonMode();
        if (mode === 'unread') {
            this._scrollToBottomBtn.innerHTML = '🔽';
            this._scrollToBottomBtn.title = 'Прокрутить к следующему непрочитанному (ПКМ для настроек)';
        } else {
            this._scrollToBottomBtn.innerHTML = '↓';
            this._scrollToBottomBtn.title = 'Прокрутить вниз (ПКМ для настроек)';
        }
    }

    static setupScrollToBottomButton() {
        if (this._scrollToBottomBtn) return;
        
        const btn = document.createElement('button');
        btn.id = 'scroll-to-bottom-btn';
        btn.innerHTML = '↓';
        btn.title = 'Прокрутить вниз (ПКМ для настроек)';
        btn.style.cssText = `
            position: fixed; 
            bottom: 85px; 
            left: 50%; 
            transform: translateX(-50%); 
            width: 40px; 
            height: 40px; 
            border-radius: 50%; 
            background: #5865f2; 
            color: white; 
            border: 2px solid #2d2d44; 
            cursor: pointer; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            font-size: 20px; 
            z-index: 10000; 
            box-shadow: 0 4px 12px rgba(0,0,0,0.4); 
            transition: opacity 0.2s ease, transform 0.2s ease; 
            opacity: 0; 
            pointer-events: none;
        `;
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const mode = this._getButtonMode();
            if (mode === 'unread') {
                this._jumpToNextUnread();
            } else {
                const container = document.querySelector('.messages-container');
                if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
            }
        });
        
        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._showButtonContextMenu(e);
        });
        
        document.body.appendChild(btn);
        this._scrollToBottomBtn = btn;
        this._updateButtonAppearance();
        
        const tryBindScroll = () => {
            const container = document.querySelector('.messages-container');
            if (container) {
                container.addEventListener('scroll', () => this._checkScrollVisibility(container));
                this._checkScrollVisibility(container);
                if (this._scrollBindInterval) clearInterval(this._scrollBindInterval);
            }
        };
        tryBindScroll();
        this._scrollBindInterval = setInterval(tryBindScroll, 500);
    }

    static _showButtonContextMenu(event) {
        const { clientX: x, clientY: y } = event;
        const existingMenu = document.querySelector('.scroll-button-context-menu');
        if (existingMenu) existingMenu.remove();
        
        const menu = document.createElement('div');
        menu.className = 'scroll-button-context-menu';
        menu.style.cssText = `
            position: fixed; 
            background: #2d2d44; 
            border: 1px solid #404060; 
            border-radius: 8px; 
            padding: 8px 0; 
            min-width: 240px; 
            z-index: 10001; 
            box-shadow: 0 4px 20px rgba(0,0,0,0.4); 
            left: ${x}px; 
            top: ${y}px;
        `;
        
        const currentMode = this._getButtonMode();
        
        const modeItem = document.createElement('div');
        modeItem.className = 'context-menu-item';
        modeItem.style.cssText = 'padding: 10px 16px; cursor: pointer; display: flex; align-items: center; gap: 10px; color: #e0e0e0; transition: background 0.2s;';
        modeItem.innerHTML = currentMode === 'unread' ? '⬇️ При клике переносить в конец' : '🔽 При клике листать непрочитанные';
        modeItem.addEventListener('mouseenter', () => modeItem.style.background = '#3d3d5c');
        modeItem.addEventListener('mouseleave', () => modeItem.style.background = 'transparent');
        modeItem.addEventListener('click', () => {
            const newMode = currentMode === 'unread' ? 'bottom' : 'unread';
            this._setButtonMode(newMode);
            if (newMode === 'unread') {
                const roomId = this.client?.currentRoom;
                if (roomId) this._scanUnreadMessages(roomId);
            }
            menu.remove();
        });
        menu.appendChild(modeItem);
        
        const separator = document.createElement('div');
        separator.style.cssText = 'height: 1px; background: #404060; margin: 4px 0;';
        menu.appendChild(separator);
        
        const aboveItem = document.createElement('div');
        aboveItem.className = 'context-menu-item';
        aboveItem.style.cssText = 'padding: 10px 16px; cursor: pointer; display: flex; align-items: center; gap: 10px; color: #e0e0e0; transition: background 0.2s;';
        aboveItem.innerHTML = '📖 Прочитать всё выше';
        aboveItem.addEventListener('mouseenter', () => aboveItem.style.background = '#3d3d5c');
        aboveItem.addEventListener('mouseleave', () => aboveItem.style.background = 'transparent');
        aboveItem.addEventListener('click', async () => {
            menu.remove();
            const roomId = this.client?.currentRoom;
            if (!roomId) return;
            const firstUnread = this._firstUnreadId.get(roomId);
            if (firstUnread) {
                await TextChatManager.markMessagesAboveAsRead(this.client, roomId, firstUnread);
                this._firstUnreadId.delete(roomId);
                this._unreadMessageIds.delete(roomId);
                this._currentUnreadIndex.delete(roomId);
                this._hideButton();
            }
        });
        menu.appendChild(aboveItem);
        
        const allItem = document.createElement('div');
        allItem.className = 'context-menu-item';
        allItem.style.cssText = 'padding: 10px 16px; cursor: pointer; display: flex; align-items: center; gap: 10px; color: #e0e0e0; transition: background 0.2s;';
        allItem.innerHTML = '✅ Прочитать всё в чате';
        allItem.addEventListener('mouseenter', () => allItem.style.background = '#3d3d5c');
        allItem.addEventListener('mouseleave', () => allItem.style.background = 'transparent');
        allItem.addEventListener('click', async () => {
            menu.remove();
            const roomId = this.client?.currentRoom;
            if (roomId) {
                await TextChatManager.markAllMessagesAsRead(this.client, roomId);
                this._firstUnreadId.delete(roomId);
                this._unreadMessageIds.delete(roomId);
                this._currentUnreadIndex.delete(roomId);
                this._hideButton();
            }
        });
        menu.appendChild(allItem);
        
        document.body.appendChild(menu);
        
        const closeHandler = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeHandler);
                document.removeEventListener('contextmenu', closeHandler);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', closeHandler);
            document.addEventListener('contextmenu', closeHandler);
        }, 10);
    }

    static _jumpToNextUnread() {
        const roomId = this.client?.currentRoom;
        if (!roomId) return;
        
        const container = document.querySelector('.messages-container');
        if (!container) return;
        
        let unreadIds = this._unreadMessageIds.get(roomId) || [];
        if (unreadIds.length === 0) {
            this._scanUnreadMessages(roomId);
            unreadIds = this._unreadMessageIds.get(roomId) || [];
        }
        
        if (unreadIds.length === 0) return;
        
        let currentIndex = this._currentUnreadIndex.get(roomId) || 0;
        if (currentIndex >= unreadIds.length) {
            currentIndex = 0;
        }
        
        const targetId = unreadIds[currentIndex];
        const found = this.scrollToMessage(targetId, container, true);
        
        if (found) {
            this._currentUnreadIndex.set(roomId, currentIndex + 1);
        } else {
            TextChatManager.loadMessagesAround(this.client, roomId, targetId, 50).then(() => {
                setTimeout(() => {
                    const retryFound = this.scrollToMessage(targetId, container, true);
                    if (retryFound) {
                        this._currentUnreadIndex.set(roomId, currentIndex + 1);
                    }
                }, 300);
            }).catch(() => {});
        }
    }

static _scanUnreadMessages(roomId) {
    const container = document.querySelector('.messages-container');
    if (!container) return;
    
    const messageElements = Array.from(container.querySelectorAll('.message[data-message-id]'));
    const unreadIds = [];
    const client = this.client || window.voiceClient;
    const currentUserId = client?.userId;
    
    for (const el of messageElements) {
        const msgId = el.dataset.messageId;
        if (!msgId) continue;
        
        // 🔥 ИСПРАВЛЕНИЕ: Проверяем ОБА класса — и read, и unread
        const isRead = el.classList.contains('message-read');
        const isUnread = el.classList.contains('message-unread');
        const isOwn = el.dataset.userId === currentUserId;
        
        // Сообщение непрочитано если:
        // - НЕ своё
        // - Либо есть класс message-unread, либо нет класса message-read
        if (!isOwn && (isUnread || !isRead)) {
            unreadIds.push(msgId);
        }
    }
    
    unreadIds.sort((a, b) => {
        const tsA = this._extractTimestamp(a);
        const tsB = this._extractTimestamp(b);
        return tsA - tsB;
    });
    
    this._unreadMessageIds.set(roomId, unreadIds);
    this._currentUnreadIndex.set(roomId, 0);
    
    if (unreadIds.length > 0) {
        const firstUnread = unreadIds[0];
        this._firstUnreadId.set(roomId, firstUnread);
    } else {
        // 🔥 ВАЖНО: Если непрочитанных нет, сбрасываем firstUnread
        // Но только если сервер тоже не прислал firstUnread
        // (это будет перезаписано при загрузке view-position)
    }
}

    static _extractTimestamp(id) {
        if (!id) return 0;
        const parts = id.split('_');
        if (parts.length >= 2) {
            const ts = parseInt(parts[1], 10);
            return isNaN(ts) ? 0 : ts;
        }
        return 0;
    }

    static _checkScrollVisibility(container) {
        if (!container || !this._scrollToBottomBtn) return;
        
        if (this._scrollCheckTimeout) clearTimeout(this._scrollCheckTimeout);
        
        this._scrollCheckTimeout = setTimeout(() => {
            const threshold = 150;
            const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
            
            if (distance > threshold) {
                this._scrollToBottomBtn.style.opacity = '1';
                this._scrollToBottomBtn.style.transform = 'translateX(-50%) scale(1)';
                this._scrollToBottomBtn.style.pointerEvents = 'auto';
            } else {
                this._scrollToBottomBtn.style.opacity = '0';
                this._scrollToBottomBtn.style.transform = 'translateX(-50%) scale(0.8)';
                this._scrollToBottomBtn.style.pointerEvents = 'none';
            }
        }, 50);
    }

    static _hideButton() {
        if (this._scrollToBottomBtn) {
            this._scrollToBottomBtn.style.opacity = '0';
            this._scrollToBottomBtn.style.transform = 'translateX(-50%) scale(0.8)';
            this._scrollToBottomBtn.style.pointerEvents = 'none';
        }
    }

    static scrollToBottom(container = null) {
        const target = container || document.querySelector('.messages-container');
        if (target) {
            target.scrollTop = target.scrollHeight;
            this._checkScrollVisibility(target);
        }
    }

    static scrollToMessage(messageId, container = null, highlight = true) {
        const target = container || document.querySelector('.messages-container');
        if (!target) {
            this.scrollToBottom();
            return false;
        }
        
        if (!messageId) {
            this.scrollToBottom(target);
            return false;
        }
        
        const msgEl = target.querySelector(`[data-message-id="${messageId}"]`);
        if (msgEl) {
            msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            if (highlight) {
                msgEl.style.transition = 'background 0.3s';
                msgEl.style.background = 'rgba(88, 101, 242, 0.2)';
                setTimeout(() => { msgEl.style.background = ''; }, 1500);
            }
            
            this._checkScrollVisibility(target);
            return true;
        }
        
        return false;
    }

static initScrollTracker(roomId, container = null) {
    const target = container || document.querySelector('.messages-container');
    if (!target || !roomId) return;
    if (target._scrollTrackerBound) return;
    
    target._scrollTrackerBound = true;
    target._isFirstScrollAfterInit = false;
    target._scrollInitializedAt = Date.now();
    
    this._lastViewedMessages.set(roomId, null);
    this._lastSentReadIds.set(roomId, null);
    
    // 🔥 ВАЖНО: НЕ проверяем has(), а всегда инициализируем заново
    // Старые значения уже должны быть очищены через clearLastViewedMessage
    
    this._unreadMessageIds.delete(roomId);
    this._currentUnreadIndex.delete(roomId);
    
    const handleScroll = () => {
        clearTimeout(target._scrollSaveTimeout);
        clearTimeout(target._readCheckTimeout);
        
        target._scrollSaveTimeout = setTimeout(() => {
            const messages = Array.from(target.querySelectorAll('.message[data-message-id]'));
            if (messages.length === 0) return;
            
            let bottomVisibleId = null;
            let topVisibleId = null;
            const targetRect = target.getBoundingClientRect();
            
            for (const msg of messages) {
                const rect = msg.getBoundingClientRect();
                
                if (rect.bottom > targetRect.top && rect.top < targetRect.bottom) {
                    if (!topVisibleId) {
                        topVisibleId = msg.dataset.messageId;
                    }
                    bottomVisibleId = msg.dataset.messageId;
                }
            }
            
            if (!bottomVisibleId && messages.length > 0) {
                let minDistance = Infinity;
                for (const msg of messages) {
                    const rect = msg.getBoundingClientRect();
                    const distance = Math.abs(rect.bottom - targetRect.bottom);
                    if (distance < minDistance) {
                        minDistance = distance;
                        bottomVisibleId = msg.dataset.messageId;
                    }
                }
            }
            
            if (bottomVisibleId) {
                const currentMax = this._maxSeenMessageId.get(roomId);
                if (!currentMax || this._compareMessageIds(bottomVisibleId, currentMax) > 0) {
                    this._maxSeenMessageId.set(roomId, bottomVisibleId);
                }
                this._lastViewedMessages.set(roomId, bottomVisibleId);
            }
            
            const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
            
            if (distanceToBottom > 150 && topVisibleId) {
                const currentFirstUnread = this._firstUnreadId.get(roomId);
                if (!currentFirstUnread || this._compareMessageIds(topVisibleId, currentFirstUnread) < 0) {
                    this._firstUnreadId.set(roomId, topVisibleId);
                }
            } else if (distanceToBottom <= 50) {
                this._firstUnreadId.set(roomId, null);
            }
        }, 300);
        
        target._readCheckTimeout = setTimeout(() => {
            const messages = Array.from(target.querySelectorAll('.message[data-message-id]'));
            if (messages.length === 0) return;
            
            const targetRect = target.getBoundingClientRect();
            const visibilityThreshold = targetRect.top + (targetRect.height * 0.15);
            let bottomVisibleId = null;
            
            for (let i = messages.length - 1; i >= 0; i--) {
                const rect = messages[i].getBoundingClientRect();
                if (rect.bottom > visibilityThreshold) {
                    bottomVisibleId = messages[i].dataset.messageId;
                    break;
                }
            }
            
            const maxSeen = this._maxSeenMessageId.get(roomId);
            
            if (maxSeen && this._lastSentReadIds.get(roomId) !== maxSeen) {
                this._lastSentReadIds.set(roomId, maxSeen);
                
                const client = this.client || window.voiceClient;
                const firstUnread = this._firstUnreadId.get(roomId);
                
                if (client && client.token) {
                    fetch(`${client.API_SERVER_URL}/api/messages/${roomId}/view-position`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json', 
                            'Authorization': `Bearer ${client.token}` 
                        },
                        body: JSON.stringify({ 
                            maxSeenId: maxSeen, 
                            firstUnreadId: firstUnread 
                        })
                    }).catch(err => console.error('Ошибка сохранения позиции скролла:', err));
                }
                
                if (client && bottomVisibleId) {
                    TextChatManager.markMessagesAsRead(client, roomId, bottomVisibleId);
                }
            }
        }, 500);
    };
    
    target.addEventListener('scroll', handleScroll, { passive: true });
    
    // 🔥 ИСПРАВЛЕНИЕ: Сканируем непрочитанные сразу, а не через 800мс
    // Но даём DOM время на рендеринг
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (roomId === this.client?.currentRoom) {
                this._scanUnreadMessages(roomId);
            }
        });
    });
}

    static _compareMessageIds(idA, idB) {
        const tsA = this._extractTimestamp(idA);
        const tsB = this._extractTimestamp(idB);
        if (tsA !== tsB) return tsA - tsB;
        return (idA || '').localeCompare(idB || '');
    }

    static saveLastViewedMessage(roomId, container = null) {
        const target = container || document.querySelector('.messages-container');
        if (!target || !roomId) return;
        
        const messages = Array.from(target.querySelectorAll('.message[data-message-id]'));
        if (messages.length > 0) {
            const lastId = messages[messages.length - 1].dataset.messageId;
            this._lastViewedMessages.set(roomId, lastId);
        }
    }

    static getLastViewedMessage(roomId) {
        return this._lastViewedMessages.get(roomId) || null;
    }

    static getMaxSeenMessageId(roomId) {
        return this._maxSeenMessageId.get(roomId) || null;
    }

    static getFirstUnreadId(roomId) {
        return this._firstUnreadId.get(roomId) || null;
    }

static setMaxSeenMessageId(roomId, messageId) {
    this._maxSeenMessageId.set(roomId, messageId); // не проверять на null
}

static setFirstUnreadId(roomId, messageId) {
    this._firstUnreadId.set(roomId, messageId); // не проверять на null
}

    static clearLastViewedMessage(roomId) {
        this._lastViewedMessages.delete(roomId);
        this._lastSentReadIds.delete(roomId);
        this._maxSeenMessageId.delete(roomId);
        this._firstUnreadId.delete(roomId);
        this._unreadMessageIds.delete(roomId);
        this._currentUnreadIndex.delete(roomId);
    }

    static getButtonMode() {
        return this._getButtonMode();
    }

    static refreshUnreadScan(roomId) {
        if (roomId) {
            this._scanUnreadMessages(roomId);
        }
    }
}

export default ScrollTracker;
