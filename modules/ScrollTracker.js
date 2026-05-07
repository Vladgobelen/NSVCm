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
    const isMobile = window.innerWidth <= 768;
    
    btn.innerHTML = this._getButtonMode() === 'unread' ? '🔽' : '↓';
    btn.title = isMobile 
        ? 'Нажмите для прокрутки (удерживайте для настроек)' 
        : 'Прокрутить вниз (ПКМ для настроек)';
    
    btn.addEventListener('touchstart', (e) => {
        longPressTimer = setTimeout(() => {
            e.preventDefault();
            this._showButtonContextMenu(e.touches[0]);
        }, 500);
    });
    btn.addEventListener('touchend', () => {
        clearTimeout(longPressTimer);
    });
    btn.addEventListener('touchmove', () => {
        clearTimeout(longPressTimer);
    });
    
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
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
    
    let longPressTimer;
}

static _checkScrollVisibility(container) {
    if (!container || !this._scrollToBottomBtn) return;
    
    if (this._scrollCheckTimeout) clearTimeout(this._scrollCheckTimeout);
    
    this._scrollCheckTimeout = setTimeout(() => {
        const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
        const isMobile = window.innerWidth <= 768;
        const mode = this._getButtonMode();
        const isAtBottom = distance <= 10;
        
        let shouldShow = false;
        
        if (mode === 'unread') {
            const roomId = this.client?.currentRoom;
            if (roomId) {
                this._scanUnreadMessages(roomId);
                const unreadIds = this._unreadMessageIds.get(roomId) || [];
                
                if (unreadIds.length > 0) {
                    shouldShow = true;
                } else if (!isAtBottom) {
                    shouldShow = true;
                }
            } else if (!isAtBottom) {
                shouldShow = true;
            }
        } else {
            shouldShow = !isAtBottom;
        }
        
        if (shouldShow) {
            this._scrollToBottomBtn.classList.add('visible');
            this._scrollToBottomBtn.classList.remove('hidden');
        } else {
            this._scrollToBottomBtn.classList.add('hidden');
            this._scrollToBottomBtn.classList.remove('visible');
        }
    }, 50);
}

static _hideButton() {
    if (this._scrollToBottomBtn) {
        this._scrollToBottomBtn.classList.add('hidden');
        this._scrollToBottomBtn.classList.remove('visible');
    }
}

static _showButtonContextMenu(event) {
    const x = event.clientX || (event.touches && event.touches[0]?.clientX) || 0;
    const y = event.clientY || (event.touches && event.touches[0]?.clientY) || 0;
    
    const currentMode = this._getButtonMode();
    
    const items = [];
    
    items.push({
        label: currentMode === 'unread' ? 'При клике переносить в конец' : 'При клике листать непрочитанные',
        icon: currentMode === 'unread' ? '⬇️' : '🔽',
        onClick: () => {
            const newMode = currentMode === 'unread' ? 'bottom' : 'unread';
            this._setButtonMode(newMode);
            if (newMode === 'unread') {
                const roomId = this.client?.currentRoom;
                if (roomId) this._scanUnreadMessages(roomId);
            }
            const container = document.querySelector('.messages-container');
            if (container) this._checkScrollVisibility(container);
        }
    });
    
    items.push({
        label: 'Прочитать всё выше',
        icon: '📖',
        onClick: async () => {
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
        }
    });
    
    items.push({
        label: 'Прочитать всё в чате',
        icon: '✅',
        onClick: async () => {
            const roomId = this.client?.currentRoom;
            if (roomId) {
                await TextChatManager.markAllMessagesAsRead(this.client, roomId);
                this._firstUnreadId.delete(roomId);
                this._unreadMessageIds.delete(roomId);
                this._currentUnreadIndex.delete(roomId);
                this._hideButton();
            }
        }
    });
    
    import('../dist/shared/ContextMenuBuilder.js').then(m => {
        m.createContextMenu(x, y, items);
    });
}

static _jumpToNextUnread() {
    const roomId = this.client?.currentRoom;
    if (!roomId) return;
    
    const container = document.querySelector('.messages-container');
    if (!container) return;
    
    // Всегда сканируем заново перед прыжком
    this._scanUnreadMessages(roomId);
    let unreadIds = this._unreadMessageIds.get(roomId) || [];
    
    if (unreadIds.length === 0) {
        // Нет непрочитанных - скрываем кнопку
        this._hideButton();
        return;
    }
    
    let currentIndex = this._currentUnreadIndex.get(roomId) || 0;
    
    // Если индекс вышел за пределы - возвращаемся к началу
    if (currentIndex >= unreadIds.length) {
        currentIndex = 0;
    }
    
    const targetId = unreadIds[currentIndex];
    const found = this.scrollToMessage(targetId, container, true);
    
    if (found) {
        // Переходим к следующему
        this._currentUnreadIndex.set(roomId, currentIndex + 1);
        
        // Если это был последний - сбрасываем на начало для следующего раза
        if (currentIndex + 1 >= unreadIds.length) {
            this._currentUnreadIndex.set(roomId, 0);
        }
        
        // Проверяем видимость кнопки после скролла
        setTimeout(() => this._checkScrollVisibility(container), 100);
    } else {
        // Сообщение не найдено в DOM - пробуем загрузить
        TextChatManager.loadMessagesAround(this.client, roomId, targetId, 50).then(() => {
            setTimeout(() => {
                const retryFound = this.scrollToMessage(targetId, container, true);
                if (retryFound) {
                    this._currentUnreadIndex.set(roomId, currentIndex + 1);
                    if (currentIndex + 1 >= unreadIds.length) {
                        this._currentUnreadIndex.set(roomId, 0);
                    }
                }
                setTimeout(() => this._checkScrollVisibility(container), 100);
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
