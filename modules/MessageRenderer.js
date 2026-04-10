import UIManager from './UIManager.js';
import ScrollTracker from './ScrollTracker.js';
import ContextMenuManager from './ContextMenuManager.js';

class MessageRenderer {
    static client = null;
    static REACTION_EMOJIS = ['👍', '👎', '❤️', '🔥', '😊', '😮', '😢', '🤦', '🙏', '🎉', '😍', '🤔', '💯', '🚀'];
    static openPickers = new Set();

    static setClient(client) {
        this.client = client;
    }

    static async prependMessagesBatch(messages) {
        const container = document.querySelector('.messages-container');
        if (!container || !messages?.length) return;
        
        const sentinel = container.querySelector('.history-sentinel');
        const refNode = sentinel ? sentinel.nextSibling : container.firstChild;
        const oldScrollHeight = container.scrollHeight;
        
        const existingIds = new Set();
        container.querySelectorAll('.message[data-message-id]').forEach(el => existingIds.add(el.dataset.messageId));
        
        const fragment = document.createDocumentFragment();
        let hasNewMessages = false;
        
        for (const msg of messages) {
            if (existingIds.has(msg.id)) {
                console.log(`[History] Пропущен дубликат: ${msg.id}`);
                continue; 
            }
            
            hasNewMessages = true;
            const el = this._createMessageElement(
                msg.username, msg.text, msg.timestamp, msg.type, msg.imageUrl, msg.id,
                msg.readBy || [], msg.userId, false, msg.thumbnailUrl, msg.replyTo, msg.reactions || {}
            );
            if (el) {
                el.classList.add('appeared');
                fragment.appendChild(el);
            }
        }
        
        if (hasNewMessages) {
            container.insertBefore(fragment, refNode);
            requestAnimationFrame(() => {
                const newScrollHeight = container.scrollHeight;
                container.scrollTop += newScrollHeight - oldScrollHeight;
                ScrollTracker._checkScrollVisibility(container);
            });
        }
    }

    static toggleReactionPicker(messageId) {
        if (!messageId) return;
        
        const selector = `.message[data-message-id="${CSS.escape(messageId)}"]`;
        const allMatches = document.querySelectorAll(selector);
        
        if (allMatches.length === 0) return;
        
        if (allMatches.length > 1) {
            for (let i = 1; i < allMatches.length; i++) {
                allMatches[i].remove();
            }
        }
        
        const msgEl = allMatches[0];
        let picker = msgEl.querySelector('.reaction-picker-inline');
        
        if (picker) {
            picker.remove();
            this.openPickers.delete(messageId);
        } else {
            this.renderInlinePicker(messageId, msgEl);
            this.openPickers.add(messageId);
        }
    }

    static renderInlinePicker(messageId, msgEl) {
        const client = this.client || window.voiceClient;
        const reactions = JSON.parse(msgEl.dataset.reactions || '{}');
        const userId = client?.userId;
        
        let reactionsContainer = msgEl.querySelector('.message-reactions');
        if (!reactionsContainer) {
            reactionsContainer = document.createElement('div');
            reactionsContainer.className = 'message-reactions';
            
            const target = msgEl.querySelector('.message-group-content') || 
                           msgEl.querySelector('.message-reply-group > div:last-child') || 
                           msgEl;
            target.appendChild(reactionsContainer);
        }
        
        const picker = document.createElement('div');
        picker.className = 'reaction-picker-inline';
        
        const list = document.createElement('div');
        list.className = 'reaction-picker-list';
        
        const shuffledEmojis = [...this.REACTION_EMOJIS].sort(() => Math.random() - 0.5);
        
        shuffledEmojis.forEach(emoji => {
            const isReacted = userId && reactions[emoji]?.includes(userId);
            const btn = document.createElement('button');
            btn.className = `reaction-btn ${isReacted ? 'active' : ''}`;
            btn.dataset.emoji = emoji;
            btn.textContent = emoji;
            
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const client = window.voiceClient;
                if (client && typeof client.toggleReaction === 'function') {
                    client.toggleReaction(messageId, emoji);
                }
                picker.remove();
                MessageRenderer.openPickers.delete(messageId);
            });
            
            list.appendChild(btn);
        });
        
        picker.appendChild(list);
        reactionsContainer.appendChild(picker);
    }

    static updateInlinePickerButtons(msgEl, reactions) {
        const picker = msgEl.querySelector('.reaction-picker-inline');
        if (!picker) return;
        
        const client = this.client || window.voiceClient;
        const userId = client?.userId;
        
        picker.querySelectorAll('.reaction-btn').forEach(btn => {
            const isReacted = userId && reactions[btn.dataset.emoji]?.includes(userId);
            btn.classList.toggle('active', isReacted);
        });
    }

    static _renderReactions(reactions, messageId) {
        if (!reactions || typeof reactions !== 'object') return '';
        
        const client = this.client || window.voiceClient;
        const userId = client?.userId;
        
        const allUserIds = new Set();
        for (const emoji of this.REACTION_EMOJIS) {
            const users = reactions[emoji];
            if (users && users.length > 0) {
                users.forEach(uid => allUserIds.add(uid));
            }
        }
        
        if (allUserIds.size > 0) {
            import('./UIManager.js').then(module => {
                const UIManager = module.default;
                const missingIds = Array.from(allUserIds).filter(uid => !UIManager.usernameCache.has(uid));
                if (missingIds.length > 0) {
                    UIManager.fetchUsernames(missingIds);
                }
            });
        }
        
        let html = '<div class="message-reactions">';
        let any = false;
        
        for (const emoji of this.REACTION_EMOJIS) {
            const users = reactions[emoji];
            if (!users || users.length === 0) continue;
            any = true;
            const isReacted = userId && users.includes(userId);
            const bg = isReacted ? 'rgba(88,101,242,0.25)' : 'rgba(64,64,96,0.5)';
            const border = isReacted ? '1px solid #5865f2' : '1px solid transparent';
            
            const userIdsAttr = users.join(',');
            html += `<span class="reaction-pill" data-emoji="${emoji}" data-msg="${messageId}" data-user-ids="${userIdsAttr}" style="background:${bg}; border:${border};"><span class="reaction-emoji">${emoji}</span><span class="reaction-count">${users.length}</span></span>`;
        }
        html += '</div>';
        return any ? html : '';
    }

    static _createMessageElement(user, text, timestamp = null, type = 'text', imageUrl = null, messageId = null, readBy = [], userId = null, broadcast = false, thumbnailUrl = null, replyTo = null, reactions = {}) {
        const self = this;
        
        const safeUser = user || 'Unknown';
        const safeText = text || '';
        const client = this.client || window.voiceClient;
        const isOwn = client && client.username && safeUser === client.username;
        
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type === 'system' ? 'system-message' : ''}`;
        messageEl.style.display = 'flex';
        messageEl.style.width = '100%';
        messageEl.style.alignItems = 'flex-start';
        messageEl.style.justifyContent = isOwn ? 'flex-end' : 'flex-start';
        messageEl.style.padding = '0 10px';
        messageEl.style.marginBottom = '8px';
        messageEl.style.cursor = 'pointer';
        messageEl.dataset.messageId = messageId;
        messageEl.dataset.userId = userId;
        messageEl.dataset.reactions = JSON.stringify(reactions);

        messageEl.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (messageId && userId) {
                const msgObj = { id: messageId, userId, username: safeUser, text: safeText, timestamp, type, imageUrl, thumbnailUrl };
                UIManager.showMessageContextMenu(event, messageId, userId, safeUser, timestamp, msgObj);
            }
        });

        messageEl.addEventListener('click', (event) => {
            if (event.button !== 0) return;
            
            const blockedSelector = 'a, button, input, textarea, .reply-block, .message-context-menu, .reaction-pill, .reaction-picker-inline';
            const blockedTarget = event.target.closest(blockedSelector);
            if (blockedTarget) return;

            self.toggleReactionPicker(messageId);
        });

        const time = timestamp ? new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        let finalImageUrl = imageUrl?.startsWith('/') ? (client?.API_SERVER_URL || '') + imageUrl : imageUrl;
        let finalThumbnailUrl = thumbnailUrl?.startsWith('/') ? (client?.API_SERVER_URL || '') + thumbnailUrl : thumbnailUrl;
        
        const count = Array.isArray(readBy) ? readBy.length : 0;
        let readStatusHtml = '';
        if (Array.isArray(readBy)) {
            let checkText = count === 0 ? '✓' : count === 1 ? '✓✓' : '✓✓✓';
            let tooltip = count === 0 ? 'Доставлено' : count === 1 ? 'Прочитано' : 'Прочитано товарищем майором';
            tooltip += `\nПрочитало: ${count}`;
            readStatusHtml = `<span class="message-read-status-container" style="margin-left: 6px; display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: #888;" title="${this.escapeHtml(tooltip)}"><span class="message-read-status" style="font-size: 12px; color: #5865f2;">${checkText}</span><span class="message-read-count">(${count})</span></span>`;
        }
        
        const headerHtml = `<div class="message-header">
            <span class="message-username" style="font-weight:600; color:#fff;">${this.escapeHtml(safeUser)}</span>
            <span class="message-time">${time}</span>${readStatusHtml}
<button class="message-reply-btn" title="Ответить">↩️</button>
        </div>`;
        
        let contentBodyHtml = '';
        if (type === 'image') {
            const displayUrl = finalThumbnailUrl || finalImageUrl;
            contentBodyHtml = `<div class="image-thumbnail" data-full-size="${this.escapeHtml(finalImageUrl)}" style="cursor:pointer;"><img src="${this.escapeHtml(displayUrl)}" alt="Изображение" loading="lazy"><div class="image-overlay">🔍</div></div>`;
        } else {
            const formatted = type === 'system' ? `<pre style="white-space:pre-wrap;font-family:monospace;font-size:12px;background:#1a1a2e;padding:8px;border-radius:4px;margin:0;">${this.escapeHtml(safeText)}</pre>` : this.escapeHtmlAndFormat(safeText);
            contentBodyHtml = `<div class="message-text" style="line-height:1.4;word-break:break-word;color:#e0e0e0;font-size:14px;">${formatted}</div>`;
        }
        
        const reactionsHtml = this._renderReactions(reactions, messageId);
        
        const bgColor = isOwn ? '#3a3a5c' : '#2d2d44';
        const borderRadius = '10px';
        const touchBlockStyle = '-webkit-touch-callout: none; -webkit-user-select: none; user-select: none;';
        
        const ownClass = isOwn ? ' own' : '';
        
        let groupWrapperHtml = '';
        if (replyTo && replyTo.id) {
            groupWrapperHtml = `<div class="message-reply-group${ownClass}" style="background:${bgColor};border-radius:${borderRadius};overflow:hidden;display:flex;flex-direction:row;max-width:85%;box-shadow:0 1px 3px rgba(0,0,0,0.2);${touchBlockStyle};"><div class="reply-block" data-reply-id="${replyTo.id}" style="background:#3a3a5c;padding:6px 10px;cursor:pointer;display:flex;flex-direction:column;gap:2px;font-size:11px;color:#a0a0b0;box-sizing:border-box;min-width:130px;max-width:220px;border-right:3px solid #5865f2;flex-shrink:0;"><div style="color:#5865f2;font-weight:600;">↩️ ${this.escapeHtml(replyTo.username)}</div><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${this.escapeHtml(replyTo.text)}</div></div><div class="message-group-content${ownClass}" style="display:flex;flex-direction:column;padding:6px 10px;min-width:0;flex:1;">${headerHtml}${contentBodyHtml}${reactionsHtml}</div></div>`;
        } else {
            groupWrapperHtml = `<div class="message-reply-group${ownClass}" style="background:${bgColor};border-radius:${borderRadius};display:flex;flex-direction:column;max-width:85%;box-shadow:0 1px 3px rgba(0,0,0,0.2);${touchBlockStyle};"><div class="message-group-content${ownClass}" style="padding:8px 10px;display:flex;flex-direction:column;">${headerHtml}${contentBodyHtml}${reactionsHtml}</div></div>`;
        }
        
        const avatarHtml = (isOwn && type !== 'system') ? '' : `<div class="message-avatar" style="min-width:32px;width:32px;height:32px;border-radius:50%;background:#404060;display:flex;align-items:center;justify-content:center;font-weight:bold;margin-right:8px;flex-shrink:0;color:#fff;">${safeUser.charAt(0).toUpperCase()}</div>`;
        messageEl.innerHTML = isOwn ? `${groupWrapperHtml}${avatarHtml}` : `${avatarHtml}${groupWrapperHtml}`;
        
        const replyBlock = messageEl.querySelector('.reply-block');
        if (replyBlock && replyTo) {
            replyBlock.addEventListener('click', () => this.handleReplyClick(replyTo.id));
        }
        
        const replyBtn = messageEl.querySelector('.message-reply-btn');
        if (replyBtn) {
            const msgObj = { id: messageId, userId, username: safeUser, text: safeText, timestamp, type, imageUrl, thumbnailUrl };
            replyBtn.addEventListener('click', (e) => { 
                e.stopPropagation(); 
                UIManager.setReplyTarget(msgObj); 
            });
        }
        
        const imgThumb = messageEl.querySelector('.image-thumbnail');
        if (imgThumb && finalImageUrl) {
            imgThumb.addEventListener('click', () => this.openImageModal(finalImageUrl));
            imgThumb.addEventListener('mouseenter', () => { 
                const o = imgThumb.querySelector('.image-overlay'); 
                if (o) o.style.display = 'flex'; 
            });
            imgThumb.addEventListener('mouseleave', () => { 
                const o = imgThumb.querySelector('.image-overlay'); 
                if (o) o.style.display = 'none'; 
            });
        }
        
        return messageEl;
    }

    static async handleReplyClick(messageId) {
        const container = document.querySelector('.messages-container');
        const target = container?.querySelector(`.message[data-message-id="${messageId}"]`);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.style.transition = 'background 0.3s';
            target.style.background = 'rgba(88, 101, 242, 0.2)';
            setTimeout(() => { target.style.background = ''; }, 1500);
            ScrollTracker._checkScrollVisibility(container);
        } else {
            try {
                const client = this.client || window.voiceClient;
                if (!client?.token) throw new Error('Не авторизован');
                const response = await fetch(`${client.API_SERVER_URL}/api/messages/${client.currentRoom}/${messageId}/info`, {
                    headers: { Authorization: `Bearer ${client.token}`, 'Content-Type': 'application/json' }
                });
                if (response.ok) {
                    const data = await response.json();
                    this.showReplyInfoModal(data.message);
                } else {
                    UIManager.showError('Сообщение не найдено в архиве');
                }
            } catch (error) {
                UIManager.showError('Не удалось загрузить исходное сообщение');
            }
        }
    }

    static showReplyInfoModal(message) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center; align-items: center; z-index: 10001;';
        const content = document.createElement('div');
        content.style.cssText = 'background: #2d2d44; border-radius: 12px; padding: 24px; max-width: 500px; width: 90%; border: 1px solid #404060;';
        content.innerHTML = `<h3 style="margin: 0 0 20px 0; color: #e0e0e0;">↩️ Исходное сообщение</h3><div style="color: #b0b0c0; line-height: 1.8;"><div style="margin-top: 12px;"><strong>Автор:</strong> ${this.escapeHtml(message.username)}</div><div style="margin-top: 8px;"><strong>Время:</strong> ${new Date(message.timestamp).toLocaleString('ru-RU')}</div>${message.text ? `<div style="margin-top: 12px; background: #1a1a2e; padding: 10px; border-radius: 6px; white-space: pre-wrap;">${this.escapeHtml(message.text)}</div>` : ''}</div><button class="reply-modal-close" style="margin-top: 20px; padding: 10px 24px; background: #5865f2; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">Закрыть</button>`;
        modal.appendChild(content);
        document.body.appendChild(modal);
        const closeBtn = content.querySelector('.reply-modal-close');
        closeBtn.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }

    static async addMessage(user, text, timestamp = null, type = 'text', imageUrl = null, messageId = null, readBy = [], userId = null, broadcast = false, thumbnailUrl = null, targetContainer = null, replyTo = null, reactions = {}) {
        const container = targetContainer || document.querySelector('.messages-container');
        if (!container) return;
        
        if (messageId && container.querySelector(`.message[data-message-id="${messageId}"]`)) {
            console.log(`[MessageRenderer] Пропущен дубликат: ${messageId}`);
            return;
        }
        
        const messageElement = this._createMessageElement(user, text, timestamp, type, imageUrl, messageId, readBy, userId, broadcast, thumbnailUrl, replyTo, reactions);
        if (!messageElement) return;
        
        container.appendChild(messageElement);
        
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
        if (isNearBottom) container.scrollTop = container.scrollHeight;
        
        setTimeout(() => { 
            messageElement.classList.add('appeared'); 
            ScrollTracker._checkScrollVisibility(container); 
            this.highlightCodeBlocks(container); 
        }, 10);
    }

    static async prependMessage(user, text, timestamp = null, type = 'text', imageUrl = null, messageId = null, readBy = [], userId = null, broadcast = false, thumbnailUrl = null, replyTo = null, reactions = {}) {
        const container = document.querySelector('.messages-container');
        if (!container) return;
        
        const sentinel = container.querySelector('.history-sentinel');
        const refNode = sentinel ? sentinel.nextSibling : container.firstChild;
        const oldScrollHeight = container.scrollHeight;
        
        const messageElement = this._createMessageElement(user, text, timestamp, type, imageUrl, messageId, readBy, userId, broadcast, thumbnailUrl, replyTo, reactions);
        if (!messageElement) return;
        
        container.insertBefore(messageElement, refNode);
        
        requestAnimationFrame(async () => {
            messageElement.classList.add('appeared');
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - oldScrollHeight;
            ScrollTracker._checkScrollVisibility(container);
            await this.highlightCodeBlocks(container);
        });
    }

    static async highlightCodeBlocks(container = null) {
        if (typeof Prism === 'undefined') return;
        const target = container || document.querySelector('.messages-container');
        if (!target) return;
        const codes = target.querySelectorAll('pre code[class*="language-"]');
        codes.forEach(block => {
            if (!block.dataset.highlighted) {
                Prism.highlightElement(block);
                block.dataset.highlighted = 'true';
            }
        });
    }

    static clearContainerMessages(container = null) {
        const target = container || document.querySelector('.messages-container');
        if (!target) return;
        const sentinel = target.querySelector('.history-sentinel');
        const children = Array.from(target.children);
        for (const child of children) {
            if (child !== sentinel) target.removeChild(child);
        }
        if (sentinel && target.firstChild !== sentinel) target.prepend(sentinel);
    }

    static escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    static escapeHtmlAndFormat(text) {
        if (!text) return '';
        let processed = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        processed = processed.replace(/```(\w+)?\n([\s\S]*?)```/g, (m, l, c) => `<pre class="code-block" data-language="${l || 'plaintext'}"><code class="language-${l || 'plaintext'}">${c.trim()}</code></pre>`);
        processed = processed.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        processed = processed.replace(/(?<!href=")(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*))(?![^<]*>)/gi, m => `<a href="${m}" target="_blank" rel="noopener noreferrer" style="color:#5865f2;text-decoration:underline;">${m}</a>`);
        processed = processed.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>').replace(/_([^_]+?)_/g, '<em>$1</em>').replace(/~([^~]+?)~/g, '<del>$1</del>');
        return processed.replace(/(<pre[\s\S]*?<\/pre>)|(\r?\n)/g, (m, p) => p || '<br>');
    }

    static openImageModal(imageUrl) {
        const existingModal = document.querySelector('.image-modal-overlay');
        if (existingModal) existingModal.remove();
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'image-modal-overlay';
        modalOverlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.9); display: flex; justify-content: center; align-items: center; z-index: 10000; cursor: zoom-out;';
        const imageElement = document.createElement('img');
        imageElement.src = imageUrl;
        imageElement.style.cssText = 'max-width: 90%; max-height: 90%; object-fit: contain; border-radius: 8px; box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);';
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = 'position: absolute; top: 20px; right: 20px; background: rgba(255, 255, 255, 0.2); border: none; color: white; font-size: 24px; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; display: flex; justify-content: center; align-items: center;';
        closeBtn.addEventListener('click', () => modalOverlay.remove());
        modalOverlay.appendChild(imageElement);
        modalOverlay.appendChild(closeBtn);
        modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.remove(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modalOverlay.remove(); });
        document.body.appendChild(modalOverlay);
    }

    static updateMessageReadStatus(messageId, readBy) {
        const msgEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
        if (!msgEl) return;
        const count = Array.isArray(readBy) ? readBy.length : 0;
        let checkText = count === 0 ? '✓' : count === 1 ? '✓✓' : '✓✓✓';
        let tooltip = count === 0 ? 'Доставлено' : count === 1 ? 'Прочитано' : 'Прочитано товарищем майором';
        tooltip += `\nПрочитало: ${count}`;
        let statusContainer = msgEl.querySelector('.message-read-status-container');
        if (!statusContainer) {
            const header = msgEl.querySelector('.message-header');
            if (header) {
                statusContainer = document.createElement('span');
                statusContainer.className = 'message-read-status-container';
                statusContainer.style.cssText = 'margin-left: 6px; display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: #888;';
                header.appendChild(statusContainer);
            } else return;
        }
        statusContainer.innerHTML = `<span class="message-read-status" title="${this.escapeHtml(tooltip)}" style="font-size: 12px; color: #5865f2;">${checkText}</span><span class="message-read-count">(${count})</span>`;
    }

    static updateMessageReactions(messageId, reactions) {
        const msgEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
        if (!msgEl) return;
        msgEl.dataset.reactions = JSON.stringify(reactions);

        let block = msgEl.querySelector('.message-reactions');
        const existingPicker = block?.querySelector('.reaction-picker-inline');

        const isEmpty = !reactions || Object.keys(reactions).length === 0 || !Object.values(reactions).some(arr => arr.length > 0);

        if (isEmpty) {
            if (block) {
                block.innerHTML = '';
                if (existingPicker) block.appendChild(existingPicker);
            } else if (existingPicker) {
                const container = msgEl.querySelector('.message-group-content') || msgEl.querySelector('.message-reply-group > div:last-child') || msgEl;
                block = document.createElement('div');
                block.className = 'message-reactions';
                block.appendChild(existingPicker);
                container.appendChild(block);
            }
        } else {
            const newHtml = this._renderReactions(reactions, messageId);
            const temp = document.createElement('div');
            temp.innerHTML = newHtml;
            const newReactionsDiv = temp.firstElementChild;

            if (!block) {
                block = document.createElement('div');
                block.className = 'message-reactions';
                const container = msgEl.querySelector('.message-group-content') || msgEl.querySelector('.message-reply-group > div:last-child') || msgEl;
                container.appendChild(block);
            }

            const pillsHtml = newReactionsDiv ? newReactionsDiv.innerHTML : '';
            block.innerHTML = pillsHtml;
            if (existingPicker) {
                block.appendChild(existingPicker);
            }
        }

        if (this.openPickers.has(messageId)) {
            this.updateInlinePickerButtons(msgEl, reactions);
        }
    }

    static removeMessageFromUI(messageId) {
        const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.style.transition = 'all 0.3s ease';
            messageElement.style.opacity = '0';
            messageElement.style.transform = 'translateX(-20px)';
            setTimeout(() => { 
                if (messageElement && messageElement.parentNode) {
                    messageElement.remove(); 
                }
            }, 300);
        }
    }

    static initReactionHover(container) {
        // Заглушка, оставлена для совместимости
    }
}

export default MessageRenderer;
