'use strict';

import SettingsManager from './SettingsManager.js';
import UIManager from './UIManager.js';
import ScrollTracker from './ScrollTracker.js';
import ContextMenuManager from './ContextMenuManager.js';
import PollWidget from './PollWidget.js';

class MessageRenderer {
    static client = null;
    static REACTION_EMOJIS = ['👍', '👎', '❤️', '🔥', '😊', '😮', '😢', '🤦', '🙏', '🎉', '😍', '🤔', '💯', '🚀'];
    static openPickers = new Set();
    static _replyOrientationObserver = null;
    static _lastOrientation = null;

    static setClient(client) {
        this.client = client;
    }

    static _getReplyOrientation() {
        if (window.screen?.orientation) {
            const type = window.screen.orientation.type;
            return type.includes('portrait') ? 'top' : 'side';
        }
        return window.innerWidth > window.innerHeight ? 'side' : 'top';
    }

    static _updateAllReplyOrientations() {
        const newOrientation = this._getReplyOrientation();
        if (this._lastOrientation === newOrientation) return;
        this._lastOrientation = newOrientation;
        document.querySelectorAll('.message-reply-group').forEach(group => {
            group.classList.remove('reply-side', 'reply-top');
            group.classList.add(newOrientation === 'top' ? 'reply-top' : 'reply-side');
        });
    }

static _createMessageElement(user, text, timestamp = null, type = 'text', imageUrl = null, messageId = null, readBy = [], userId = null, broadcast = false, thumbnailUrl = null, replyTo = null, reactions = {}, poll = null, forwardedFrom = null, pollRef = null, embed = null, edited = false, editedAt = null) {
    const safeUser = user || 'Unknown';
    const safeText = text || '';
    const client = this.client || window.voiceClient;
    const isOwn = client && client.username && safeUser === client.username;
    const isRead = !isOwn && client?.userId && Array.isArray(readBy) && readBy.includes(client.userId);
    let isDirectedToMe = false;
    let directedType = null;
    if (!isOwn && client && client.userId && client.username) {
        if (replyTo && replyTo.userId === client.userId) {
            isDirectedToMe = true;
            directedType = 'reply';
        }
        if (!isDirectedToMe && safeText) {
            const lowerText = safeText.toLowerCase();
            const lowerUsername = client.username.toLowerCase();
            const escapedUsername = lowerUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const mentionPattern = new RegExp(`@${escapedUsername}(?=[\\s,.!?;:()\\[\\]{}"']|$)`, 'i');
            if (mentionPattern.test(lowerText)) {
                isDirectedToMe = true;
                directedType = 'mention';
            }
            if (!isDirectedToMe) {
                const namePattern = new RegExp(`(?<=^|[\\s,.!?;:()\\[\\]{}"'])${escapedUsername}(?=[\\s,.!?;:()\\[\\]{}"']|$)`, 'i');
                if (namePattern.test(lowerText)) {
                    isDirectedToMe = true;
                    directedType = 'name_mention';
                }
            }
        }
    }
    const messageEl = document.createElement('div');
    messageEl.className = `message ${type === 'system' ? 'system-message' : ''} ${type === 'poll' ? 'poll-message' : ''} ${type === 'audio' ? 'audio-message' : ''}`;
    if (isRead) messageEl.classList.add('message-read');
    messageEl.style.cssText = 'display: flex; width: 100%; align-items: flex-start; justify-content: ' + (isOwn ? 'flex-end' : 'flex-start') + '; padding: 0 10px; margin-bottom: 8px; cursor: pointer;';
    messageEl.dataset.messageId = messageId;
    messageEl.dataset.userId = userId;
    messageEl.dataset.reactions = JSON.stringify(reactions);
    messageEl.dataset.messageType = type;
    if (edited) {
        messageEl.dataset.edited = 'true';
        messageEl.dataset.editedAt = editedAt;
    }
    if (isDirectedToMe) {
        messageEl.classList.add('message-directed-to-me');
        if (directedType === 'reply') messageEl.classList.add('message-reply-to-me');
        else if (directedType === 'mention') messageEl.classList.add('message-mention-me');
        else if (directedType === 'name_mention') messageEl.classList.add('message-name-mention-me');
    }
    if (embed) messageEl.dataset.embed = JSON.stringify(embed);
    if (poll) {
        const pollDataForDataset = { poll, messageId, pollRef };
        if (client?.currentRoom) pollDataForDataset.roomId = client.currentRoom;
        messageEl.dataset.pollData = JSON.stringify(pollDataForDataset);
    }
    if (pollRef) messageEl.dataset.pollRef = JSON.stringify(pollRef);
    if (forwardedFrom) messageEl.dataset.forwardedFrom = JSON.stringify(forwardedFrom);
    messageEl.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (messageId && userId) {
            const msgObj = {
                id: messageId, userId, username: safeUser, text: safeText, timestamp,
                type, imageUrl, thumbnailUrl, poll, pollRef, forwardedFrom, embed,
                edited, editedAt
            };
            if (forwardedFrom) ContextMenuManager.showForwardedMessageContextMenu(event, messageId, msgObj);
            else ContextMenuManager.showMessageContextMenu(event, messageId, userId, safeUser, timestamp, msgObj);
        }
    });
    messageEl.addEventListener('click', (event) => {
        if (event.button !== 0) return;
        const blockedSelector = 'a, button, input, textarea, .reply-block, .message-context-menu, .reaction-pill, .reaction-picker-inline, .forwarded-badge, .poll-option, .poll-vote-btn, .embed-thumbnail, .embed-title, audio, .audio-player';
        if (event.target.closest(blockedSelector)) return;
        const shouldCopy = SettingsManager.getCopyOnClick();
        if (shouldCopy) {
            navigator.clipboard?.writeText(safeText).catch(() => {});
        }
        messageEl.style.transition = 'background 0.15s';
        messageEl.style.background = 'rgba(88, 101, 242, 0.15)';
        setTimeout(() => messageEl.style.background = '', 150);
    });
    messageEl.addEventListener('dblclick', (event) => {
        if (event.button !== 0) return;
        const blockedSelector = 'a, button, input, textarea, .reply-block, .message-context-menu, .reaction-pill, .reaction-picker-inline, .forwarded-badge, .poll-option, .poll-vote-btn, .embed-thumbnail, .embed-title, audio, .audio-player, .image-thumbnail';
        if (event.target.closest(blockedSelector)) return;
        event.preventDefault();
        event.stopPropagation();
        this.toggleReactionPicker(messageId);
    });
    const time = timestamp ? new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    let finalImageUrl = imageUrl?.startsWith('/') ? (client?.API_SERVER_URL || '') + imageUrl : imageUrl;
    let finalThumbnailUrl = thumbnailUrl?.startsWith('/') ? (client?.API_SERVER_URL || '') + thumbnailUrl : thumbnailUrl;
    const count = Array.isArray(readBy) ? readBy.length : 0;
    let readStatusHtml = '';
    if (Array.isArray(readBy) && type !== 'poll') {
        let checkText = count === 0 ? '✓' : count === 1 ? '✓✓' : '✓✓✓';
        let tooltip = count === 0 ? 'Доставлено' : count === 1 ? 'Прочитано' : 'Прочитано товарищем майором';
        tooltip += `
Прочитало: ${count}`;
        readStatusHtml = `<span class="message-read-status-container" style="margin-left: 6px; display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: #888;" title="${this.escapeHtml(tooltip)}"><span class="message-read-status" style="font-size: 12px; color: #5865f2;">${checkText}</span><span class="message-read-count">(${count})</span></span>`;
    }
    const editedBadgeHtml = edited
    ? `<span class="message-edited-badge" title="${editedAt ? `Отредактировано: ${new Date(editedAt).toLocaleString('ru-RU')}` : 'Отредактировано'}">✏️</span>`
    : '';
    const forwardedBadgeHtml = forwardedFrom ? this._renderForwardedBadge(forwardedFrom) : '';
    const embedHtml = embed ? this._renderEmbed(embed) : '';
    const canEdit = isOwn && type !== 'poll' && type !== 'system' && type !== 'audio';
    const headerHtml = `<div class="message-header">
<span class="message-username" style="font-weight:600; color:#fff;">${this.escapeHtml(safeUser)}</span>
<span class="message-time">${time}</span>${readStatusHtml}${editedBadgeHtml}
${type !== 'poll' ? `
<button class="message-edit-btn" title="Действия" data-message-id="${messageId}">⋯</button>
<button class="message-reply-btn" title="Ответить">↩️</button>
` : ''}
</div>`;
    let contentBodyHtml = '';
    if (type === 'image') {
        const displayUrl = finalThumbnailUrl || finalImageUrl;
        if (finalImageUrl) {
            contentBodyHtml = `<div class="image-thumbnail" data-full-size="${finalImageUrl.replace(/"/g, '&quot;')}" style="cursor:pointer;"><img src="${displayUrl.replace(/"/g, '&quot;')}" alt="Изображение" loading="eager"><div class="image-overlay">🔍</div></div>`;
        }
    } else if (type === 'audio') {
        let finalAudioUrl = imageUrl;
        if (!finalAudioUrl) {
            contentBodyHtml = `<div class="message-text" style="line-height:1.4;word-break:break-word;color:#e0e0e0;font-size:14px;">🎵 Аудиосообщение (файл недоступен)</div>`;
        } else {
            if (finalAudioUrl.startsWith('/')) finalAudioUrl = (client?.API_SERVER_URL || '') + finalAudioUrl;
            const audioFileName = finalAudioUrl.split('/').pop().split('?')[0];
            contentBodyHtml = `
<div class="audio-player-container" style="margin: 8px 0; min-width: 250px;">
<audio controls preload="metadata" style="width: 100%; max-width: 350px; height: 36px; border-radius: 8px;">
<source src="${finalAudioUrl.replace(/"/g, '&quot;')}" type="audio/mpeg">
<source src="${finalAudioUrl.replace(/"/g, '&quot;')}" type="audio/mp4">
<source src="${finalAudioUrl.replace(/"/g, '&quot;')}" type="audio/ogg">
<source src="${finalAudioUrl.replace(/"/g, '&quot;')}" type="audio/webm">
<source src="${finalAudioUrl.replace(/"/g, '&quot;')}" type="audio/x-m4a">
</audio>
<div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
<span style="font-size: 12px; color: #888;">🎵 ${this.escapeHtml(audioFileName)}</span>
<a href="${finalAudioUrl.replace(/"/g, '&quot;')}" download style="font-size: 12px; color: #5865f2; text-decoration: none;" target="_blank">📥</a>
</div>
</div>
`;
        }
    } else if (type === 'poll') {
        const pollDataForContainer = { poll, messageId, pollRef };
        if (client?.currentRoom) pollDataForContainer.roomId = client.currentRoom;
        const pollDataAttr = JSON.stringify(pollDataForContainer).replace(/'/g, "&apos;");
        contentBodyHtml = `<div class="poll-container" data-poll-data='${pollDataAttr}'></div>`;
    } else {
        const formatted = type === 'system' ? `<pre style="white-space:pre-wrap;font-family:monospace;font-size:12px;background:#1a1a2e;padding:8px;border-radius:4px;margin:0;">${this.escapeHtml(safeText)}</pre>` : this.escapeHtmlAndFormat(safeText);
        contentBodyHtml = `<div class="message-text" style="line-height:1.4;word-break:break-word;color:#e0e0e0;font-size:14px;">${formatted}</div>`;
    }
    const reactionsHtml = type !== 'poll' ? this._renderReactions(reactions, messageId) : '';
    const bgColor = isOwn ? '#3a3a5c' : '#2d2d44';
    const borderRadius = '10px';
    const touchBlockStyle = '-webkit-touch-callout: none; -webkit-user-select: none; user-select: none;';
    const ownClass = isOwn ? ' own' : '';
    const replyOrientation = this._getReplyOrientation();
    const replyClass = replyOrientation === 'top' ? 'reply-top' : 'reply-side';
    let groupWrapperHtml = '';
    if (replyTo && replyTo.id) {
        groupWrapperHtml = `
<div class="message-reply-group ${replyClass}${ownClass}" style="background:${bgColor};border-radius:${borderRadius};overflow:hidden;display:flex;max-width:85%;box-shadow:0 1px 3px rgba(0,0,0,0.2);${touchBlockStyle};">
${forwardedBadgeHtml}
<div class="reply-block" data-reply-id="${replyTo.id}" style="background:#3a3a5c;padding:6px 10px;cursor:pointer;display:flex;flex-direction:column;gap:2px;font-size:11px;color:#a0a0b0;box-sizing:border-box;min-width:130px;max-width:220px;">
<div style="color:#5865f2;font-weight:600;">↩️ ${this.escapeHtml(replyTo.username)}</div>
<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${this.escapeHtml(replyTo.text)}</div>
</div>
<div class="message-group-content${ownClass}" style="display:flex;flex-direction:column;padding:6px 10px;min-width:0;flex:1;">
${headerHtml}
${contentBodyHtml}
${embedHtml}
${reactionsHtml}
</div>
</div>
`;
    } else {
        groupWrapperHtml = `
<div class="message-reply-group${ownClass}" style="background:${bgColor};border-radius:${borderRadius};display:flex;flex-direction:column;max-width:85%;box-shadow:0 1px 3px rgba(0,0,0,0.2);${touchBlockStyle};">
${forwardedBadgeHtml}
<div class="message-group-content${ownClass}" style="padding:8px 10px;display:flex;flex-direction:column;">
${headerHtml}
${contentBodyHtml}
${embedHtml}
${reactionsHtml}
</div>
</div>
`;
    }
    const avatarHtml = (isOwn && type !== 'system' && type !== 'poll') ? '' : `<div class="message-avatar" style="min-width:32px;width:32px;height:32px;border-radius:50%;background:#404060;display:flex;align-items:center;justify-content:center;font-weight:bold;margin-right:8px;flex-shrink:0;color:#fff;">${safeUser.charAt(0).toUpperCase()}</div>`;
    messageEl.innerHTML = isOwn ? `${groupWrapperHtml}${avatarHtml}` : `${avatarHtml}${groupWrapperHtml}`;
    messageEl._messageObj = {
        id: messageId, userId, username: safeUser, text: safeText, timestamp,
        type, imageUrl, thumbnailUrl, poll, pollRef, forwardedFrom, embed,
        edited, editedAt
    };
    const forwardedBadge = messageEl.querySelector('.forwarded-badge');
    if (forwardedBadge) {
        forwardedBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            const client = window.voiceClient;
            if (client && typeof client.jumpToForwardSource === 'function') client.jumpToForwardSource(forwardedFrom);
        });
    }
    const embedThumbnail = messageEl.querySelector('.embed-thumbnail');
    if (embedThumbnail) {
        const fullImage = embedThumbnail.dataset.fullImage;
        if (fullImage) {
            embedThumbnail.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openImageModal(fullImage);
            });
            embedThumbnail.style.cursor = 'pointer';
        }
    }
    const embedImageContainer = messageEl.querySelector('.embed-image-container');
    if (embedImageContainer) {
        const fullImage = embedImageContainer.dataset.fullImage;
        if (fullImage) {
            embedImageContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openImageModal(fullImage);
            });
            embedImageContainer.style.cursor = 'pointer';
        }
    }
    const pollContainer = messageEl.querySelector('.poll-container');
    if (pollContainer && poll) {
        setTimeout(() => {
            if (pollContainer.isConnected) {
                const pollDataForRender = { poll, messageId, roomId: client?.currentRoom, userId: client?.userId, pollRef };
                PollWidget.render(pollContainer, pollDataForRender, client);
            }
        }, 0);
    }
    const replyBlock = messageEl.querySelector('.reply-block');
    if (replyBlock && replyTo) {
        replyBlock.addEventListener('click', () => this.handleReplyClick(replyTo.id));
    }
    const replyBtn = messageEl.querySelector('.message-reply-btn');
    if (replyBtn) {
        const msgObj = {
            id: messageId, userId, username: safeUser, text: safeText, timestamp,
            type, imageUrl, thumbnailUrl, poll, pollRef, embed,
            edited, editedAt
        };
        replyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            UIManager.setReplyTarget(msgObj);
        });
    }
    const editBtn = messageEl.querySelector('.message-edit-btn');
    if (editBtn) {
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const msgObj = {
                id: messageId, userId, username: safeUser, text: safeText, timestamp,
                type, imageUrl, thumbnailUrl, poll, pollRef, embed,
                edited, editedAt
            };
            this.showMessageActionsPanel(editBtn, messageId, msgObj);
        });
    }
    const imgThumb = messageEl.querySelector('.image-thumbnail');
    if (imgThumb && finalImageUrl) {
        let clickTimer = null;
        imgThumb.addEventListener('click', (e) => {
            e.stopPropagation();
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
                return;
            }
            clickTimer = setTimeout(() => {
                this.openImageModal(finalImageUrl);
                clickTimer = null;
            }, 200);
        });
        imgThumb.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            this.toggleReactionPicker(messageId);
        });
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

    static initReplyOrientationObserver() {
        if (this._replyOrientationObserver) return;
        this._lastOrientation = this._getReplyOrientation();
        const handler = () => {
            requestAnimationFrame(() => this._updateAllReplyOrientations());
        };
        window.addEventListener('resize', handler);
        window.addEventListener('orientationchange', handler);
        this._replyOrientationObserver = { handler };
    }

static showMessageActionsPanel(anchorButton, messageId, messageObj) {
    const client = this.client || window.voiceClient;
    if (!client) return;
    
    // Удаляем существующую панель
    const existingPanel = document.querySelector('.message-actions-panel');
    if (existingPanel) existingPanel.remove();
    
    const isOwnMessage = client.userId === messageObj.userId;
    const canDelete = ContextMenuManager._canDeleteMessage(client, messageId, messageObj.userId, messageObj);
    
    const panel = document.createElement('div');
    panel.className = 'message-actions-panel';
    panel.style.cssText = `
        position: absolute;
        background: #2d2d44;
        border: 1px solid #404060;
        border-radius: 8px;
        padding: 4px;
        display: flex;
        gap: 4px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        animation: fadeIn 0.15s ease;
    `;
    
    // Позиционируем панель над кнопкой
    const rect = anchorButton.getBoundingClientRect();
    panel.style.left = `${rect.left - 120}px`;
    panel.style.top = `${rect.top - 50}px`;
    
    // Кнопка "Редактировать" (только для своих текстовых сообщений)
    if (isOwnMessage && messageObj.type === 'text') {
        const editAction = this._createActionButton('✏️', 'Редактировать', () => {
            this.startEditingMessage(messageId, messageObj);
            panel.remove();
        });
        panel.appendChild(editAction);
    }
    
    // Кнопка "Копировать"
    const copyAction = this._createActionButton('📋', 'Копировать', () => {
        navigator.clipboard?.writeText(messageObj.text || '').catch(() => {});
        UIManager.showError('Текст скопирован');
        panel.remove();
    });
    panel.appendChild(copyAction);
    
    // Кнопка "Удалить"
    if (canDelete) {
        const deleteAction = this._createActionButton('🗑️', 'Удалить', () => {
            UIManager.confirmDeleteMessage(messageId);
            panel.remove();
        }, true);
        panel.appendChild(deleteAction);
    }
    
    document.body.appendChild(panel);
    
    // Закрытие по клику вне панели
    const closeHandler = (e) => {
        if (!panel.contains(e.target) && !anchorButton.contains(e.target)) {
            panel.remove();
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 100);
}

static _createActionButton(icon, title, onClick, isDanger = false) {
    const btn = document.createElement('button');
    btn.innerHTML = icon;
    btn.title = title;
    btn.style.cssText = `
        background: ${isDanger ? 'rgba(237, 66, 69, 0.1)' : 'transparent'};
        border: none;
        color: ${isDanger ? '#ed4245' : '#e0e0e0'};
        font-size: 18px;
        width: 40px;
        height: 40px;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
    `;
    btn.addEventListener('mouseenter', () => {
        btn.style.background = isDanger ? 'rgba(237, 66, 69, 0.2)' : '#3d3d5c';
    });
    btn.addEventListener('mouseleave', () => {
        btn.style.background = isDanger ? 'rgba(237, 66, 69, 0.1)' : 'transparent';
    });
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
    });
    return btn;
}

static startEditingMessage(messageId, messageObj) {
    const msgEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!msgEl) return;
    
    const contentContainer = msgEl.querySelector('.message-group-content') || 
                             msgEl.querySelector('.message-reply-group > div:last-child');
    if (!contentContainer) return;
    
    const textContainer = contentContainer.querySelector('.message-text');
    if (!textContainer) return;
    
    // Берём актуальный текст из DOM, а не из старого объекта
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = textContainer.innerHTML;
    const originalText = tempDiv.textContent || tempDiv.innerText || messageObj.text || '';
    
    // Создаём редактор
    const editorContainer = document.createElement('div');
    editorContainer.className = 'message-editor-container';
    editorContainer.style.cssText = 'margin: 8px 0; width: 100%;';
    
    const textarea = document.createElement('textarea');
    textarea.value = originalText;
    textarea.style.cssText = `
        width: 100%;
        min-height: 60px;
        max-height: 200px;
        padding: 8px 10px;
        background: #1a1a2e;
        border: 1px solid #404060;
        color: #e0e0e0;
        border-radius: 6px;
        font-size: 13px;
        font-family: inherit;
        resize: vertical;
        outline: none;
    `;
    
    const controls = document.createElement('div');
    controls.style.cssText = 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;';
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Сохранить';
    saveBtn.style.cssText = `
        padding: 6px 12px;
        background: #5865f2;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
    `;
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Отмена';
    cancelBtn.style.cssText = `
        padding: 6px 12px;
        background: #404060;
        color: #e0e0e0;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
    `;
    
    controls.appendChild(cancelBtn);
    controls.appendChild(saveBtn);
    
    editorContainer.appendChild(textarea);
    editorContainer.appendChild(controls);
    
    // Заменяем текст на редактор
    textContainer.style.display = 'none';
    textContainer.parentNode.insertBefore(editorContainer, textContainer.nextSibling);
    
    // Фокус на текстовое поле
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    
    const cleanup = () => {
        editorContainer.remove();
        textContainer.style.display = '';
    };
    
    const doSave = async () => {
        const newText = textarea.value.trim();
        if (!newText) {
            UIManager.showError('Сообщение не может быть пустым');
            return;
        }
        
        // Получаем актуальный текст из DOM для сравнения
        const currentTempDiv = document.createElement('div');
        currentTempDiv.innerHTML = textContainer.innerHTML;
        const currentText = currentTempDiv.textContent || currentTempDiv.innerText || '';
        
        if (newText === currentText) {
            cleanup();
            return;
        }
        
        const client = this.client || window.voiceClient;
        if (!client) {
            UIManager.showError('Клиент не инициализирован');
            return;
        }
        
        saveBtn.textContent = '...';
        saveBtn.disabled = true;
        cancelBtn.disabled = true;
        textarea.disabled = true;
        
        try {
            // Пробуем через сокет
            if (client.socket?.connected) {
                client.socket.emit('edit-message', {
                    messageId,
                    roomId: client.currentRoom,
                    newText
                }, (response) => {
                    if (response?.success) {
                        textContainer.innerHTML = this.escapeHtmlAndFormat(newText);
                        messageObj.text = newText; // Обновляем объект для будущих редактирований
                        cleanup();
                        this.highlightCodeBlocks(msgEl);
                        
                        // Добавляем/обновляем пометку редактирования
                        const editedBadge = msgEl.querySelector('.message-edited-badge');
                        if (!editedBadge) {
                            const header = msgEl.querySelector('.message-header');
                            if (header) {
                                const badge = document.createElement('span');
                                badge.className = 'message-edited-badge';
                                badge.innerHTML = '✏️';
                                badge.title = 'Отредактировано';
                                header.appendChild(badge);
                            }
                        } else {
                            editedBadge.title = `Отредактировано: ${new Date().toLocaleString('ru-RU')}`;
                        }
                    } else {
                        UIManager.showError(response?.error || 'Не удалось отредактировать сообщение');
                        saveBtn.textContent = 'Сохранить';
                        saveBtn.disabled = false;
                        cancelBtn.disabled = false;
                        textarea.disabled = false;
                    }
                });
            } else {
                // Fallback через HTTP
                const response = await fetch(`${client.API_SERVER_URL}/api/messages/${messageId}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${client.token}`
                    },
                    body: JSON.stringify({ text: newText, roomId: client.currentRoom })
                });
                
                if (response.ok) {
                    textContainer.innerHTML = this.escapeHtmlAndFormat(newText);
                    messageObj.text = newText; // Обновляем объект для будущих редактирований
                    cleanup();
                    this.highlightCodeBlocks(msgEl);
                    
                    const editedBadge = msgEl.querySelector('.message-edited-badge');
                    if (!editedBadge) {
                        const header = msgEl.querySelector('.message-header');
                        if (header) {
                            const badge = document.createElement('span');
                            badge.className = 'message-edited-badge';
                            badge.innerHTML = '✏️';
                            badge.title = 'Отредактировано';
                            header.appendChild(badge);
                        }
                    } else {
                        editedBadge.title = `Отредактировано: ${new Date().toLocaleString('ru-RU')}`;
                    }
                } else {
                    const error = await response.json().catch(() => ({}));
                    throw new Error(error.error || 'Ошибка сервера');
                }
            }
        } catch (error) {
            UIManager.showError('Не удалось отредактировать: ' + error.message);
            saveBtn.textContent = 'Сохранить';
            saveBtn.disabled = false;
            cancelBtn.disabled = false;
            textarea.disabled = false;
        }
    };
    
    cancelBtn.addEventListener('click', cleanup);
    saveBtn.addEventListener('click', doSave);
    
    // Enter = сохранить, Shift+Enter = новая строка
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            doSave();
        }
    });
    
    // Escape = отмена
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            cleanup();
        }
    });
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
            if (existingIds.has(msg.id)) continue;
            hasNewMessages = true;
const el = MessageRenderer._createMessageElement(
    msg.username, msg.text, msg.timestamp, msg.type, msg.imageUrl, msg.id,
    msg.readBy || [], msg.userId, false, msg.thumbnailUrl, msg.replyTo,
    msg.reactions || {}, msg.poll, msg.forwardedFrom, msg.pollRef, msg.embed,
    msg.edited || false, msg.editedAt || null
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
            for (let i = 1; i < allMatches.length; i++) allMatches[i].remove();
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
                if (client && typeof client.toggleReaction === 'function') client.toggleReaction(messageId, emoji);
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
            if (users && users.length > 0) users.forEach(uid => allUserIds.add(uid));
        }
        if (allUserIds.size > 0) {
            import('./UIManager.js').then(module => {
                const UIManager = module.default;
                const missingIds = Array.from(allUserIds).filter(uid => !UIManager.usernameCache.has(uid));
                if (missingIds.length > 0) UIManager.fetchUsernames(missingIds);
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

    static _renderForwardedBadge(forwardedFrom) {
        if (!forwardedFrom) return '';
        const serverName = this.escapeHtml(forwardedFrom.serverName || 'Дерево');
        const roomName = this.escapeHtml(forwardedFrom.roomName || 'Гнездо');
        const username = this.escapeHtml(forwardedFrom.username || 'Пользователь');
        return `
<div class="forwarded-badge" data-server-id="${this.escapeHtml(forwardedFrom.serverId)}" data-room-id="${this.escapeHtml(forwardedFrom.roomId)}" data-message-id="${this.escapeHtml(forwardedFrom.messageId)}" data-forwarded-from='${JSON.stringify(forwardedFrom).replace(/'/g, "&apos;")}'>
<span class="forwarded-icon">📤</span>
<span class="forwarded-text">Переслано от <strong>${username}</strong> из ${serverName} / ${roomName}</span>
</div>
`;
    }

    static _togglePanels(showNotes) {
        const chatArea = document.querySelector('.chat-area');
        const chatHeader = document.querySelector('.chat-header');
        const messagesContainer = document.querySelector('.messages-container');
        const inputArea = document.querySelector('.input-area');
        const notesView = document.getElementById('notes-view-container');
        const threadView = document.getElementById('note-thread-container');
        const membersPanel = document.querySelector('.members-panel');
        const membersList = membersPanel?.querySelector('.members-list');
        const notesListPanel = membersPanel?.querySelector('.notes-list-panel');
        const newNoteBtn = document.getElementById('new-note-btn');
        
        if (chatArea) chatArea.style.display = 'flex';
        if (chatHeader) chatHeader.style.display = 'flex';

        if (showNotes) {
            if (messagesContainer) messagesContainer.style.display = 'none';
            if (inputArea) inputArea.style.display = 'none';
            if (notesView) {
                notesView.style.display = 'flex';
                notesView.style.flex = '1';
                notesView.style.width = '100%';
                notesView.style.height = '100%';
            }
            if (threadView) threadView.style.display = 'none';
            if (membersPanel) membersPanel.style.display = 'flex';
            if (membersList) membersList.style.display = 'none';
            if (notesListPanel) notesListPanel.style.display = 'block';
            if (newNoteBtn) {
                newNoteBtn.style.display = 'block';
                newNoteBtn.style.width = 'calc(100% - 32px)';
                newNoteBtn.style.minHeight = '44px';
            }
        } else {
            if (messagesContainer) messagesContainer.style.display = 'block';
            if (inputArea) inputArea.style.display = 'flex';
            if (notesView) notesView.style.display = 'none';
            if (threadView) threadView.style.display = 'none';
            if (membersPanel) membersPanel.style.display = 'flex';
            if (membersList) membersList.style.display = 'block';
            if (notesListPanel) notesListPanel.style.display = 'none';
            if (newNoteBtn) newNoteBtn.style.display = 'none';
        }
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

static async addMessage(user, text, timestamp = null, type = 'text', imageUrl = null, messageId = null, readBy = [], userId = null, broadcast = false, thumbnailUrl = null, targetContainer = null, replyTo = null, reactions = {}, poll = null, forwardedFrom = null, pollRef = null, embed = null, edited = false, editedAt = null) {
    const container = targetContainer || document.querySelector('.messages-container');
    if (!container) return;
    if (messageId && container.querySelector(`.message[data-message-id="${messageId}"]`)) return;
    const messageElement = MessageRenderer._createMessageElement(user, text, timestamp, type, imageUrl, messageId, readBy, userId, broadcast, thumbnailUrl, replyTo, reactions, poll, forwardedFrom, pollRef, embed, edited, editedAt);
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

static async prependMessage(user, text, timestamp = null, type = 'text', imageUrl = null, messageId = null, readBy = [], userId = null, broadcast = false, thumbnailUrl = null, replyTo = null, reactions = {}, poll = null, forwardedFrom = null, pollRef = null, embed = null, edited = false, editedAt = null) {
    const container = document.querySelector('.messages-container');
    if (!container) return;
    const sentinel = container.querySelector('.history-sentinel');
    const refNode = sentinel ? sentinel.nextSibling : container.firstChild;
    const oldScrollHeight = container.scrollHeight;
    const messageElement = MessageRenderer._createMessageElement(user, text, timestamp, type, imageUrl, messageId, readBy, userId, broadcast, thumbnailUrl, replyTo, reactions, poll, forwardedFrom, pollRef, embed, edited, editedAt);
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
        const codeBlocks = target.querySelectorAll('pre code[class*="language-"]');
        if (codeBlocks.length === 0) return;
        const langMap = new Map();
        codeBlocks.forEach((block) => {
            if (block.dataset.highlighted === 'true') return;
            const lang = block.className.match(/language-(\w+)/)?.[1] || 'plaintext';
            if (!langMap.has(lang)) langMap.set(lang, []);
            langMap.get(lang).push(block);
        });
        const loadPromises = [];
        for (const [lang, blocks] of langMap.entries()) {
            if (Prism.languages[lang]) {
                blocks.forEach((b) => {
                    try {
                        Prism.highlightElement(b);
                        b.dataset.highlighted = 'true';
                    } catch (e) {}
                });
            } else {
                loadPromises.push(
                    this._loadPrismLanguage(lang).then(() => {
                        blocks.forEach((b) => {
                            try {
                                Prism.highlightElement(b);
                                b.dataset.highlighted = 'true';
                            } catch (e) {}
                        });
                    }).catch(() => {
                        blocks.forEach((b) => {
                            b.className = b.className.replace(/language-\w+/, 'language-plaintext');
                            try {
                                Prism.highlightElement(b);
                                b.dataset.highlighted = 'true';
                            } catch (e) {}
                        });
                    })
                );
            }
        }
        await Promise.allSettled(loadPromises);
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

    static async _loadPrismLanguage(lang) {
        if (typeof Prism === 'undefined') return;
        const normalizedLang = lang.toLowerCase();
        if (Prism.languages[normalizedLang]) return true;
        const scriptUrl = `components/prism-${normalizedLang}.min.js?v=20260410`;
        if (document.querySelector(`script[data-prism-lang="${normalizedLang}"]`)) {
            return new Promise((resolve) => {
                const check = setInterval(() => {
                    if (Prism.languages[normalizedLang]) {
                        clearInterval(check);
                        resolve(true);
                    }
                }, 50);
            });
        }
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = scriptUrl;
            script.async = true;
            script.dataset.prismLang = normalizedLang;
            script.onload = () => resolve(true);
            script.onerror = () => reject(new Error(`Failed to load ${scriptUrl}`));
            document.head.appendChild(script);
        });
    }

    static escapeHtmlAndFormat(text) {
        if (!text) return '';
        const client = this.client || window.voiceClient;
        const currentUsername = client?.username;
        let processed = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        const urlMap = new Map();
        let urlIdx = 0;
        const urlRegex = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*))/gi;
        processed = processed.replace(urlRegex, (match) => {
            const placeholder = `{{URL:${urlIdx}}}`;
            urlMap.set(placeholder, match);
            urlIdx++;
            return placeholder;
        });
        processed = processed.replace(/```(\w+)?\s*([\s\S]*?)```/g, (match, lang, code) => {
            const language = lang ? lang.trim().toLowerCase() : 'plaintext';
            const cleanedCode = code.replace(/^\n+|\n+$/g, '');
            return `<pre class="code-block" data-language="${language}"><code class="language-${language}">${cleanedCode}</code></pre>`;
        });
        processed = processed.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        processed = processed
            .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
            .replace(/_([^_]+?)_/g, '<em>$1</em>')
            .replace(/~([^~]+?)~/g, '<del>$1</del>')
            .replace(/\*([^*]+?)\*/g, '<i>$1</i>');
        processed = processed.replace(/{color:(#[0-9A-Fa-f]{3,6})}([\s\S]*?){\/color}/gi, '<span style="color:$1">$2</span>');
        for (const [placeholder, url] of urlMap) {
            const safeUrl = url.replace(/"/g, '&quot;');
            const link = `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color:#5865f2;text-decoration:underline;">${url}</a>`;
            processed = processed.split(placeholder).join(link);
        }
        if (currentUsername) {
            const escapedUsername = currentUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const mentionPattern = new RegExp(`@${escapedUsername}(?=[\\s,.!?;:()\\[\\]{}"']|$)`, 'gi');
            processed = processed.replace(mentionPattern, (match) => {
                return `<span class="mention-highlight">${match}</span>`;
            });
        }
        processed = processed.replace(/(<pre[\s\S]*?<\/pre>)|(\r?\n)/g, (match, preBlock, newline) => {
            return preBlock ? preBlock : '<br>';
        });
        return processed;
    }

static openImageModal(imageUrl) {
    const existingModal = document.querySelector('.image-modal-overlay');
    if (existingModal) existingModal.remove();
    
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'image-modal-overlay';
    modalOverlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.9); display: flex; justify-content: center; align-items: center; z-index: 10000; overflow: hidden; touch-action: none;';
    
    const imageContainer = document.createElement('div');
    imageContainer.style.cssText = 'display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; touch-action: none;';
    
    const imageElement = document.createElement('img');
    imageElement.src = imageUrl;
    imageElement.style.cssText = 'max-width: 90%; max-height: 90%; object-fit: contain; border-radius: 8px; box-shadow: 0 0 20px rgba(0, 0, 0, 0.5); transition: transform 0.05s ease-out; cursor: grab; touch-action: none;';
    imageElement.draggable = false;
    
    // Переменные для масштабирования
    let scale = 1;
    const MIN_SCALE = 0.5;
    const MAX_SCALE = 5;
    const ZOOM_STEP = 0.1;
    
    // Переменные для перетаскивания
    let isDragging = false;
    let hasMoved = false; // Флаг: было ли движение (для отмены клика)
    let startX = 0;
    let startY = 0;
    let translateX = 0;
    let translateY = 0;
    const MOVE_THRESHOLD = 5; // Порог движения в пикселях
    
    // Переменные для pinch-to-zoom (мобильные)
    let initialDistance = 0;
    let initialScale = 1;
    let pinchCenterX = 0;
    let pinchCenterY = 0;
    
    // Переменные для тапов (мобильные)
    let touchStartTime = 0;
    let lastTap = 0;
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = 'position: absolute; top: 20px; right: 20px; background: rgba(255, 255, 255, 0.2); border: none; color: white; font-size: 24px; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; display: flex; justify-content: center; align-items: center; z-index: 10001;';
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        modalOverlay.remove();
    });
    
    const resetZoomBtn = document.createElement('button');
    resetZoomBtn.innerHTML = '🔄';
    resetZoomBtn.style.cssText = 'position: absolute; bottom: 20px; right: 20px; background: rgba(255, 255, 255, 0.2); border: none; color: white; font-size: 20px; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; display: flex; justify-content: center; align-items: center; z-index: 10001;';
    resetZoomBtn.title = 'Сбросить масштаб';
    resetZoomBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        scale = 1;
        translateX = 0;
        translateY = 0;
        updateTransform();
        imageElement.style.cursor = 'grab';
    });
    
    const zoomIndicator = document.createElement('div');
    zoomIndicator.style.cssText = 'position: absolute; bottom: 20px; left: 20px; background: rgba(0, 0, 0, 0.6); color: white; padding: 6px 12px; border-radius: 20px; font-size: 14px; z-index: 10001; opacity: 0; transition: opacity 0.3s;';
    zoomIndicator.textContent = '100%';
    
    const updateTransform = () => {
        imageElement.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        zoomIndicator.textContent = Math.round(scale * 100) + '%';
        
        if (scale > 1) {
            imageElement.style.cursor = isDragging ? 'grabbing' : 'grab';
        } else {
            imageElement.style.cursor = 'default';
            translateX = 0;
            translateY = 0;
        }
    };
    
    const showZoomIndicator = () => {
        zoomIndicator.style.opacity = '1';
        clearTimeout(zoomIndicator.hideTimeout);
        zoomIndicator.hideTimeout = setTimeout(() => {
            zoomIndicator.style.opacity = '0';
        }, 1000);
    };
    
    // === Вспомогательные функции для touch ===
    const getTouchDistance = (touches) => {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    };
    
    const getTouchCenter = (touches) => {
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2
        };
    };
    
    // === MOUSE EVENTS (десктоп) ===
    
    imageElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale + delta));
        
        if (newScale !== scale) {
            const rect = imageElement.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const scaleRatio = newScale / scale;
            
            translateX = translateX - (mouseX - rect.width / 2) * (scaleRatio - 1);
            translateY = translateY - (mouseY - rect.height / 2) * (scaleRatio - 1);
            
            scale = newScale;
            updateTransform();
            showZoomIndicator();
        }
    }, { passive: false });
    
    imageElement.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
            e.preventDefault();
            e.stopPropagation();
            
            hasMoved = false;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            if (scale > 1) {
                imageElement.style.cursor = 'grabbing';
                imageElement.style.transition = 'none';
            }
        }
    });
    
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const moveX = Math.abs(e.clientX - startX);
        const moveY = Math.abs(e.clientY - startY);
        
        // Если движение больше порога, считаем что было перетаскивание
        if (moveX > MOVE_THRESHOLD || moveY > MOVE_THRESHOLD) {
            hasMoved = true;
        }
        
        if (scale > 1) {
            e.preventDefault();
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            translateX += deltaX;
            translateY += deltaY;
            
            startX = e.clientX;
            startY = e.clientY;
            
            updateTransform();
        }
    });
    
    window.addEventListener('mouseup', (e) => {
        if (!isDragging) return;
        
        isDragging = false;
        
        if (scale > 1) {
            imageElement.style.cursor = 'grab';
            imageElement.style.transition = 'transform 0.05s ease-out';
        }
        
        // Сбрасываем флаг движения после небольшой задержки
        setTimeout(() => {
            hasMoved = false;
        }, 100);
    });
    
    // === TOUCH EVENTS (мобильные) ===
    
    imageElement.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        hasMoved = false;
        touchStartTime = Date.now();
        
        const touches = e.touches;
        
        if (touches.length === 1) {
            isDragging = true;
            startX = touches[0].clientX;
            startY = touches[0].clientY;
        } else if (touches.length === 2) {
            isDragging = false;
            hasMoved = true; // Два пальца - точно жест, не клик
            initialDistance = getTouchDistance(touches);
            initialScale = scale;
            
            const center = getTouchCenter(touches);
            pinchCenterX = center.x;
            pinchCenterY = center.y;
        }
    }, { passive: false });
    
    imageElement.addEventListener('touchmove', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const touches = e.touches;
        
        if (touches.length === 1 && isDragging) {
            const moveX = Math.abs(touches[0].clientX - startX);
            const moveY = Math.abs(touches[0].clientY - startY);
            
            if (moveX > MOVE_THRESHOLD || moveY > MOVE_THRESHOLD) {
                hasMoved = true;
            }
            
            if (scale > 1) {
                const deltaX = touches[0].clientX - startX;
                const deltaY = touches[0].clientY - startY;
                
                translateX += deltaX;
                translateY += deltaY;
                
                startX = touches[0].clientX;
                startY = touches[0].clientY;
                
                updateTransform();
            }
        } else if (touches.length === 2) {
            const currentDistance = getTouchDistance(touches);
            const center = getTouchCenter(touches);
            
            if (initialDistance > 0) {
                const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, initialScale * (currentDistance / initialDistance)));
                
                if (newScale !== scale) {
                    const rect = imageElement.getBoundingClientRect();
                    const pinchRelativeX = pinchCenterX - rect.left;
                    const pinchRelativeY = pinchCenterY - rect.top;
                    
                    const scaleRatio = newScale / scale;
                    
                    translateX = translateX - (pinchRelativeX - rect.width / 2) * (scaleRatio - 1);
                    translateY = translateY - (pinchRelativeY - rect.height / 2) * (scaleRatio - 1);
                    
                    scale = newScale;
                    updateTransform();
                    showZoomIndicator();
                }
            }
            
            pinchCenterX = center.x;
            pinchCenterY = center.y;
            initialDistance = currentDistance;
            initialScale = scale;
        }
    }, { passive: false });
    
    imageElement.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const now = Date.now();
        const touchDuration = now - touchStartTime;
        
        // Проверка на двойной тап
        const timeSinceLastTap = now - lastTap;
        if (timeSinceLastTap < 300 && timeSinceLastTap > 0 && !hasMoved && e.touches.length === 0) {
            // Двойной тап - открыть в новой вкладке
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            window.open(imageUrl, '_blank');
            lastTap = 0;
        } else {
            lastTap = now;
        }
        
        if (e.touches.length === 0) {
            isDragging = false;
            initialDistance = 0;
        } else if (e.touches.length === 1) {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        }
        
        // Сбрасываем флаг движения после задержки
        setTimeout(() => {
            hasMoved = false;
        }, 100);
    }, { passive: false });
    
    imageElement.addEventListener('touchcancel', (e) => {
        isDragging = false;
        hasMoved = false;
        initialDistance = 0;
    }, { passive: false });
    
    // === КЛИКИ (общие) ===
    
    let clickTimer = null;
    
    imageElement.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Если было движение (перетаскивание или зум) - игнорируем клик
        if (hasMoved) {
            return;
        }
        
        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
            return;
        }
        
        clickTimer = setTimeout(() => {
            // Дополнительная проверка: если было движение за время таймера - не закрываем
            if (!hasMoved) {
                modalOverlay.remove();
            }
            clickTimer = null;
        }, 200);
    });
    
    imageElement.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        hasMoved = true; // Предотвращаем последующий click
        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
        }
        window.open(imageUrl, '_blank');
    });
    
    // Сброс масштаба по средней кнопке мыши
    imageElement.addEventListener('auxclick', (e) => {
        if (e.button === 1) {
            e.preventDefault();
            e.stopPropagation();
            hasMoved = true;
            scale = 1;
            translateX = 0;
            translateY = 0;
            updateTransform();
            showZoomIndicator();
        }
    });
    
    // Предотвращаем контекстное меню на картинке
    imageElement.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
    
    imageContainer.appendChild(imageElement);
    modalOverlay.appendChild(imageContainer);
    modalOverlay.appendChild(closeBtn);
    modalOverlay.appendChild(resetZoomBtn);
    modalOverlay.appendChild(zoomIndicator);
    
    // Клик по оверлею - закрыть
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay || e.target === imageContainer) {
            modalOverlay.remove();
        }
    });
    
    // Escape - закрыть
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            modalOverlay.remove();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
    
    document.body.style.overflow = 'hidden';
    
    const originalRemove = modalOverlay.remove;
    modalOverlay.remove = function() {
        document.body.style.overflow = '';
        originalRemove.call(this);
    };
    
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
            if (existingPicker) block.appendChild(existingPicker);
        }
        if (this.openPickers.has(messageId)) this.updateInlinePickerButtons(msgEl, reactions);
    }

static _renderEmbed(embed) {
    if (!embed) return '';
    if (embed.error) {
        const url = embed.url || '';
        const hostname = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
        return `
<div class="message-embed embed-error">
<div class="embed-content">
<div class="embed-header">
<span class="embed-site">🔗 ${this.escapeHtml(hostname || url)}</span>
</div>
<a class="embed-title" href="${this.escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(url)}</a>
<div class="embed-description" style="color:#888;font-size:12px;">⚠️ Не удалось загрузить превью</div>
</div>
</div>`;
    }
    if (embed.provider === 'direct_media' && embed.image) {
        const imageUrl = embed.imageData?.thumbnailPath || embed.image;
        const fullImageUrl = embed.imageData?.localPath || embed.image;
        return `
<div class="message-embed embed-image-only">
<div class="embed-image-container" data-full-image="${this.escapeHtml(fullImageUrl)}">
<img src="${this.escapeHtml(imageUrl)}" alt="Изображение" loading="eager" style="max-width:100%; max-height:400px; border-radius:8px; cursor:pointer;">
</div>
</div>`;
    }
    if (embed.provider === 'direct_media' && embed.video) {
        return `
<div class="message-embed embed-video">
<div class="embed-content">
<div class="embed-header">
<span class="embed-site">🎬 Видео</span>
</div>
<a class="embed-title" href="${this.escapeHtml(embed.url)}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(embed.description || 'Видеофайл')}</a>
<div class="embed-description" style="color:#888;font-size:12px;">Нажмите для просмотра</div>
</div>
</div>`;
    }
    const title = this.escapeHtml(embed.title || 'Без названия');
    const description = this.escapeHtml(embed.description || '');
    const siteName = this.escapeHtml(embed.siteName || '');
    const url = embed.url || '';
    let imageHtml = '';
    if (embed.imageData && embed.imageData.thumbnailPath) {
        const imageUrl = embed.imageData.thumbnailPath;
        const fullImageUrl = embed.imageData.localPath || embed.image;
        imageHtml = `
<div class="embed-thumbnail" data-full-image="${this.escapeHtml(fullImageUrl)}">
<img src="${this.escapeHtml(imageUrl)}" alt="${title}" loading="eager">
</div>`;
    } else if (embed.image) {
        imageHtml = `
<div class="embed-thumbnail">
<img src="${this.escapeHtml(embed.image)}" alt="${title}" loading="eager" referrerpolicy="no-referrer">
</div>`;
    }
    let faviconHtml = '';
    if (embed.favicon) {
        faviconHtml = `<img class="embed-favicon" src="${this.escapeHtml(embed.favicon)}" alt="" loading="eager">`;
    }
    return `
<div class="message-embed" data-embed-url="${this.escapeHtml(url)}">
${imageHtml}
<div class="embed-content">
<div class="embed-header">
${faviconHtml}
<span class="embed-site">${siteName}</span>
</div>
<a class="embed-title" href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>
${description ? `<div class="embed-description">${description}</div>` : ''}
</div>
</div>
`;
}

    static updateMessageEmbed(messageId, embed) {
        const msgEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
        if (!msgEl) return;
        msgEl.dataset.embed = JSON.stringify(embed);
        const existingEmbed = msgEl.querySelector('.message-embed');
        if (existingEmbed) existingEmbed.remove();
        const embedHtml = this._renderEmbed(embed);
        if (!embedHtml) return;
        const contentContainer = msgEl.querySelector('.message-group-content') ||
            msgEl.querySelector('.message-reply-group > div:last-child') ||
            msgEl;
        const temp = document.createElement('div');
        temp.innerHTML = embedHtml;
        const embedElement = temp.firstElementChild;
        if (!embedElement) return;
        const reactionsBlock = contentContainer.querySelector('.message-reactions');
        if (reactionsBlock) contentContainer.insertBefore(embedElement, reactionsBlock);
        else contentContainer.appendChild(embedElement);
        const clickableElements = embedElement.querySelectorAll('.embed-thumbnail, .embed-image-container');
        clickableElements.forEach(el => {
            const fullImage = el.dataset.fullImage;
            if (fullImage) {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openImageModal(fullImage);
                });
                el.style.cursor = 'pointer';
            }
        });
    }

    static updatePollData(messageId, pollData) {
        const msgEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
        if (!msgEl) return;
        const pollContainer = msgEl.querySelector('.poll-container');
        if (!pollContainer) return;
        const currentPollData = JSON.parse(msgEl.dataset.pollData || '{}');
        const updatedPollData = { ...currentPollData, poll: pollData };
        msgEl.dataset.pollData = JSON.stringify(updatedPollData);
        const client = this.client || window.voiceClient;
        PollWidget.render(pollContainer, {
            poll: pollData,
            messageId: messageId,
            roomId: client?.currentRoom,
            userId: client?.userId,
            pollRef: currentPollData.pollRef
        }, client);
    }

    static updatePollRefData(originalPollId, pollData) {
        const allMessages = document.querySelectorAll('.message.poll-message');
        allMessages.forEach(msgEl => {
            const msgId = msgEl.dataset.messageId;
            try {
                const existingData = JSON.parse(msgEl.dataset.pollData || '{}');
                if (existingData.pollRef && existingData.pollRef.originalPollId === originalPollId) {
                    const updatedPollData = { ...existingData, poll: pollData };
                    msgEl.dataset.pollData = JSON.stringify(updatedPollData);
                    const pollContainer = msgEl.querySelector('.poll-container');
                    if (pollContainer) {
                        const client = this.client || window.voiceClient;
                        PollWidget.render(pollContainer, {
                            poll: pollData,
                            messageId: msgId,
                            roomId: client?.currentRoom,
                            userId: client?.userId,
                            pollRef: existingData.pollRef
                        }, client);
                    }
                }
            } catch (e) {
                const pollRefAttr = msgEl.dataset.pollRef;
                if (pollRefAttr) {
                    try {
                        const pollRef = JSON.parse(pollRefAttr);
                        if (pollRef.originalPollId === originalPollId) {
                            const client = this.client || window.voiceClient;
                            const pollContainer = msgEl.querySelector('.poll-container');
                            if (pollContainer) {
                                PollWidget.render(pollContainer, {
                                    poll: pollData,
                                    messageId: msgId,
                                    roomId: client?.currentRoom,
                                    userId: client?.userId,
                                    pollRef: pollRef
                                }, client);
                            }
                        }
                    } catch (e2) {}
                }
            }
        });
    }

    static removeMessageFromUI(messageId) {
        const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.style.transition = 'all 0.3s ease';
            messageElement.style.opacity = '0';
            messageElement.style.transform = 'translateX(-20px)';
            setTimeout(() => {
                if (messageElement && messageElement.parentNode) messageElement.remove();
            }, 300);
        }
    }

    static initReactionHover(container) {}
}

export default MessageRenderer;
