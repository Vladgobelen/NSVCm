import TextChatManager from './TextChatManager.js';

class ScrollTracker {
    static client = null;
    static _scrollToBottomBtn = null;
    static _scrollCheckTimeout = null;
    static _scrollBindInterval = null;
    static _lastViewedMessages = new Map();
    static _lastSentReadIds = new Map();

    static setClient(client) {
        this.client = client;
        this.setupScrollToBottomButton();
    }

    static setupScrollToBottomButton() {
        if (this._scrollToBottomBtn) return;
        
        const btn = document.createElement('button');
        btn.id = 'scroll-to-bottom-btn';
        btn.innerHTML = '↓';
        btn.title = 'Прокрутить вниз';
        btn.style.cssText = `position: fixed; bottom: 85px; left: 50%; transform: translateX(-50%); width: 40px; height: 40px; border-radius: 50%; background: #5865f2; color: white; border: 2px solid #2d2d44; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 20px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.4); transition: opacity 0.2s ease, transform 0.2s ease; opacity: 0; pointer-events: none;`;
        
        btn.addEventListener('click', () => {
            const container = document.querySelector('.messages-container');
            if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        });
        
        document.body.appendChild(btn);
        this._scrollToBottomBtn = btn;

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

    static scrollToBottom(container = null) {
        const target = container || document.querySelector('.messages-container');
        if (target) {
            target.scrollTop = target.scrollHeight;
            this._checkScrollVisibility(target);
        }
    }

    static scrollToMessage(messageId, container = null, highlight = true) {
        const target = container || document.querySelector('.messages-container');
        if (!target) return this.scrollToBottom();
        if (!messageId) return this.scrollToBottom(target);
        
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
        this._lastViewedMessages.set(roomId, null);
        this._lastSentReadIds.set(roomId, null);
        console.log(`🔍 [READ-DEBUG] initScrollTracker активирован для комнаты: ${roomId}`);

        const handleScroll = () => {
            clearTimeout(target._scrollSaveTimeout);
            clearTimeout(target._readCheckTimeout);

            // 1. Отслеживание позиции скролла (RAM)
            target._scrollSaveTimeout = setTimeout(() => {
                const messages = Array.from(target.querySelectorAll('.message[data-message-id]'));
                if (messages.length === 0) return;
                
                let lastVisibleId = messages[messages.length - 1].dataset.messageId;
                for (let i = messages.length - 1; i >= 0; i--) {
                    const rect = messages[i].getBoundingClientRect();
                    const targetRect = target.getBoundingClientRect();
                    if (rect.top >= targetRect.top && rect.bottom <= targetRect.bottom) {
                        lastVisibleId = messages[i].dataset.messageId;
                        break;
                    }
                }
                this._lastViewedMessages.set(roomId, lastVisibleId);
            }, 300);

            // 2. Триггер прочтения и СОХРАНЕНИЯ ПОЗИЦИИ (500мс остановки скролла)
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

                if (bottomVisibleId && this._lastSentReadIds.get(roomId) !== bottomVisibleId) {
                    this._lastSentReadIds.set(roomId, bottomVisibleId);
                    this._lastViewedMessages.set(roomId, bottomVisibleId);
                    console.log(`👁️ [READ-DEBUG] Scroll stopped at ${bottomVisibleId} (room: ${roomId}). Saving to server.`);

                    const client = this.client || window.voiceClient;
                    if (client && client.token) {
                        fetch(`${client.API_SERVER_URL}/api/messages/${roomId}/view-position`, {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json', 
                                'Authorization': `Bearer ${client.token}` 
                            },
                            body: JSON.stringify({ messageId: bottomVisibleId })
                        }).catch(err => console.error('Ошибка сохранения позиции скролла:', err));
                    }

                    if (client) {
                        TextChatManager.markMessagesAsRead(client, roomId, bottomVisibleId);
                    }
                }
            }, 500);
        };

        target.addEventListener('scroll', handleScroll, { passive: true });
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

    static clearLastViewedMessage(roomId) {
        this._lastViewedMessages.delete(roomId);
        this._lastSentReadIds.delete(roomId);
    }
}

export default ScrollTracker;
