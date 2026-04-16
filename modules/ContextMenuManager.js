'use strict';

import ServerManager from './ServerManager.js';
import UIManager from './UIManager.js';
import ForwardModal from './ForwardModal.js';

class ContextMenuManager {
    static contextMenu = null;
    static currentReactionMessageId = null;

    static hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.remove();
            this.contextMenu = null;
        }
    }

    static _createBaseMenu(x, y, minWidth = '200px') {
        if (this.contextMenu) this.hideContextMenu();
        const menu = document.createElement('div');
        menu.className = 'message-context-menu';
        menu.style.cssText = `position: fixed; background: #2d2d44; border: 1px solid #404060; border-radius: 8px; padding: 8px 0; min-width: ${minWidth}; z-index: 10000; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);`;
        document.body.appendChild(menu);
        this.contextMenu = menu;
        const rect = menu.getBoundingClientRect();
        let posX = x;
        let posY = y;
        if (posX + rect.width > window.innerWidth) posX = window.innerWidth - rect.width - 10;
        if (posY + rect.height > window.innerHeight) posY = window.innerHeight - rect.height - 10;
        menu.style.left = `${posX}px`;
        menu.style.top = `${posY}px`;
        const closeHandler = () => {
            this.hideContextMenu();
            document.removeEventListener('click', closeHandler);
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 100);
        return menu;
    }

    static _addMenuItem(menu, html, onClick, isDelete = false) {
        const item = document.createElement('div');
        item.className = 'context-menu-item';
        item.innerHTML = html;
        item.style.cssText = `padding: 10px 16px; cursor: pointer; display: flex; align-items: center; gap: 10px; color: #e0e0e0; transition: background 0.2s; ${isDelete ? 'color: #ed4245;' : ''}`;
        item.addEventListener('mouseenter', () => item.style.background = isDelete ? 'rgba(237, 66, 69, 0.1)' : '#3d3d5c');
        item.addEventListener('mouseleave', () => item.style.background = 'transparent');
        item.addEventListener('click', () => { onClick(); this.hideContextMenu(); });
        menu.appendChild(item);
        return item;
    }

    static _addSeparator(menu) {
        const sep = document.createElement('div');
        sep.style.cssText = 'height: 1px; background: #404060; margin: 4px 0;';
        menu.appendChild(sep);
    }

    static _extractCoordinates(event) {
        if (event.clientX !== undefined) return { x: event.clientX, y: event.clientY };
        if (event.touches && event.touches.length > 0) return { x: event.touches[0].clientX, y: event.touches[0].clientY };
        return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }

    static _canManagePinnedMessages(client, roomId) {
        if (!client || !roomId) return false;
        const room = client.rooms?.find(r => r.id === roomId);
        if (!room) return false;
        return room.ownerId === client.userId || (client.currentServer && client.currentServer.ownerId === client.userId);
    }

    static _isMessagePinned(client, messageId) {
        if (!client || !client.pinnedMessages) return false;
        const roomId = client.currentRoom;
        if (!roomId) return false;
        const roomPinned = client.pinnedMessages.get(roomId) || [];
        return roomPinned.some(p => p.id === messageId);
    }

    static _canManagePoll(client, message) {
        if (!client || !message) return false;
        if (message.userId === client.userId) return true;
        const room = client.rooms?.find(r => r.id === client.currentRoom);
        if (room && room.ownerId === client.userId) return true;
        if (client.currentServer && client.currentServer.ownerId === client.userId) return true;
        return false;
    }

    static _hasVotedInPoll(client, message) {
        if (!client || !message || !message.poll) return false;
        return message.poll.options.some(opt => opt.voters && opt.voters.includes(client.userId));
    }

    static _canDeleteMessage(client, messageId, userId, messageObj = null) {
        if (!client) return false;
        const isOwnMessage = client.userId === userId;
        const isServerOwner = client.currentServer && client.currentServer.ownerId === client.userId;
        const isRoomOwner = client.currentRoom && client.rooms?.find(r => r.id === client.currentRoom)?.ownerId === client.userId;
        if (isOwnMessage) return true;
        if (isServerOwner) return true;
        if (isRoomOwner) return true;
        if (messageObj && messageObj.pollRef) {
            return client.userId === messageObj.userId;
        }
        return false;
    }

    static showMessageContextMenu(event, messageId, userId, username, timestamp, messageObj = null) {
        event.preventDefault();
        event.stopPropagation();
        const { x, y } = this._extractCoordinates(event);
        const menu = this._createBaseMenu(x, y);
        const client = window.voiceClient;
        if (!client) {
            this.hideContextMenu();
            return;
        }
        const isOwnMessage = client.userId === userId;
        const canDelete = this._canDeleteMessage(client, messageId, userId, messageObj);
        const canPin = this._canManagePinnedMessages(client, client.currentRoom);
        const isPinned = this._isMessagePinned(client, messageId);
        const isPoll = messageObj && messageObj.type === 'poll';
        const canManagePoll = isPoll && this._canManagePoll(client, messageObj);
        const hasVoted = isPoll && this._hasVotedInPoll(client, messageObj);
        const isPollClosed = isPoll && messageObj.poll && messageObj.poll.settings && messageObj.poll.settings.closed;
        const isForwardedPoll = isPoll && messageObj && messageObj.pollRef;

        this._addMenuItem(menu, '↩️ Ответить', () => {
            if (messageObj) UIManager.setReplyTarget(messageObj);
        });
        this._addMenuItem(menu, '📤 Переслать', () => {
            if (messageObj && messageId) {
                ForwardModal.open(client, messageId, client.currentRoom, messageObj);
            }
        });
        this._addMenuItem(menu, 'ℹ️ Информация', () => {
            UIManager.showMessageInfo(messageId, userId, username, timestamp);
        });
        if (userId && userId !== client.userId && !isForwardedPoll) {
            this._addMenuItem(menu, '💬 Личка', () => {
                ServerManager.createDirectRoom(client, userId, username);
            });
        }
        if (isPoll) {
            this._addSeparator(menu);
            if (!isPollClosed && hasVoted) {
                this._addMenuItem(menu, '📊 Показать результаты', () => {
                    const msgEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
                    if (msgEl) {
                        const container = msgEl.querySelector('.poll-container');
                        if (container && window.PollWidget) {
                            window.PollWidget.showResults(container, messageObj);
                        }
                    }
                });
            }
            if (canManagePoll && !isPollClosed) {
                this._addMenuItem(menu, '🔒 Закрыть опрос', () => {
                    if (client && typeof client.closePoll === 'function') {
                        client.closePoll(client.currentRoom, messageId);
                    }
                });
            }
        }
        if (canPin || canDelete) {
            this._addSeparator(menu);
        }
        if (canPin) {
            if (isPinned) {
                this._addMenuItem(menu, '📌 Открепить', () => {
                    if (client && typeof client.unpinMessage === 'function') {
                        client.unpinMessage(client.currentRoom, messageId);
                    }
                });
            } else {
                this._addMenuItem(menu, '📌 Закрепить', () => {
                    if (client && typeof client.pinMessage === 'function') {
                        client.pinMessage(client.currentRoom, messageId);
                    }
                });
            }
        }
        if (canDelete) {
            const deleteText = isForwardedPoll ? '🗑️ Удалить пересланный опрос' : '🗑️ Удалить';
            this._addMenuItem(menu, deleteText, () => {
                UIManager.confirmDeleteMessage(messageId);
            }, true);
        }
    }

    static showMemberContextMenu(event, userId, username) {
        event.preventDefault();
        event.stopPropagation();
        const client = window.voiceClient;
        if (!userId || (client && userId === client.userId)) return;
        const { x, y } = this._extractCoordinates(event);
        const menu = this._createBaseMenu(x, y, '150px');
        this._addMenuItem(menu, '💬 Личка', () => {
            ServerManager.createDirectRoom(client, userId, username);
        });
        this._addMenuItem(menu, '📝 Заметки', () => {
            if (client && typeof client.openUserPublicNotes === 'function') {
                client.openUserPublicNotes(userId);
            }
        });
    }

    static showPinnedMessageContextMenu(event, messageId, messageObj) {
        event.preventDefault();
        event.stopPropagation();
        const { x, y } = this._extractCoordinates(event);
        const menu = this._createBaseMenu(x, y);
        const client = window.voiceClient;
        if (!client) {
            this.hideContextMenu();
            return;
        }
        const canPin = this._canManagePinnedMessages(client, client.currentRoom);
        this._addMenuItem(menu, '↩️ Перейти к сообщению', () => {
            UIManager.scrollToMessage(messageId, null, true);
        });
        if (messageObj && messageObj.forwardedFrom) {
            this._addMenuItem(menu, '🔗 Перейти к источнику', () => {
                if (client && typeof client.jumpToForwardSource === 'function') {
                    client.jumpToForwardSource(messageObj.forwardedFrom);
                }
            });
        }
        if (canPin) {
            this._addSeparator(menu);
            this._addMenuItem(menu, '📌 Открепить', () => {
                if (client && typeof client.unpinMessage === 'function') {
                    client.unpinMessage(client.currentRoom, messageId);
                }
            });
        }
    }

    static showForwardedMessageContextMenu(event, messageId, messageObj) {
        event.preventDefault();
        event.stopPropagation();
        const { x, y } = this._extractCoordinates(event);
        const menu = this._createBaseMenu(x, y);
        const client = window.voiceClient;
        if (!client) {
            this.hideContextMenu();
            return;
        }
        const canDelete = this._canDeleteMessage(client, messageId, messageObj?.userId, messageObj);
        this._addMenuItem(menu, '🔗 Перейти к источнику', () => {
            if (client && typeof client.jumpToForwardSource === 'function' && messageObj.forwardedFrom) {
                client.jumpToForwardSource(messageObj.forwardedFrom);
            }
        });
        if (canDelete) {
            this._addSeparator(menu);
            this._addMenuItem(menu, '🗑️ Удалить пересланное сообщение', () => {
                UIManager.confirmDeleteMessage(messageId);
            }, true);
        }
    }
}

export default ContextMenuManager;
