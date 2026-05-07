'use strict';

import { escapeHtml } from "../dist/shared/escapeHtml.js";
import { createContextMenu } from "../dist/shared/ContextMenuBuilder.js";
import ServerManager from './ServerManager.js';
import UIManager from './UIManager.js';
import ForwardModal from './ForwardModal.js';

class ContextMenuManager {
    static contextMenu = null;

    static hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.remove();
            this.contextMenu = null;
        }
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
        const client = window.voiceClient;
        if (!client) return;

        const isOwnMessage = client.userId === userId;
        const canDelete = this._canDeleteMessage(client, messageId, userId, messageObj);
        const canPin = this._canManagePinnedMessages(client, client.currentRoom);
        const isPinned = this._isMessagePinned(client, messageId);
        const isPoll = messageObj && messageObj.type === 'poll';
        const canManagePoll = isPoll && this._canManagePoll(client, messageObj);
        const hasVoted = isPoll && this._hasVotedInPoll(client, messageObj);
        const isPollClosed = isPoll && messageObj.poll && messageObj.poll.settings && messageObj.poll.settings.closed;
        const isForwardedPoll = isPoll && messageObj && messageObj.pollRef;

        const items = [];

        items.push({ label: 'Ответить', icon: '↩️', onClick: () => {
            if (messageObj) UIManager.setReplyTarget(messageObj);
        }});

        items.push({ label: 'Переслать', icon: '📤', onClick: () => {
            if (messageObj && messageId) {
                ForwardModal.open(client, messageId, client.currentRoom, messageObj);
            }
        }});

        items.push({ label: 'Информация', icon: 'ℹ️', onClick: () => {
            UIManager.showMessageInfo(messageId, userId, username, timestamp);
        }});

        if (userId && userId !== client.userId && !isForwardedPoll) {
            items.push({ label: 'Личка', icon: '💬', onClick: () => {
                const existing = client.servers.find(s => s.id?.startsWith("user_") && s.id?.includes(userId));
                if (existing) {
                    client.currentServerId = existing.id;
                    client.currentServer = existing;
                    localStorage.setItem("lastServerId", existing.id);
                    client.joinRoom(existing.id);
                } else {
                    ServerManager.createDirectRoom(client, userId, username);
                }
            }});
        }

        if (isPoll) {
            if (!isPollClosed && hasVoted) {
                items.push({ label: 'Показать результаты', icon: '📊', onClick: () => {
                    const msgEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
                    if (msgEl) {
                        const container = msgEl.querySelector('.poll-container');
                        if (container && window.PollWidget) {
                            window.PollWidget.showResults(container, messageObj);
                        }
                    }
                }});
            }
            if (canManagePoll && !isPollClosed) {
                items.push({ label: 'Закрыть опрос', icon: '🔒', onClick: () => {
                    if (client && typeof client.closePoll === 'function') {
                        client.closePoll(client.currentRoom, messageId);
                    }
                }});
            }
        }

        if (canPin) {
            if (isPinned) {
                items.push({ label: 'Открепить', icon: '📌', onClick: () => {
                    if (client && typeof client.unpinMessage === 'function') {
                        client.unpinMessage(client.currentRoom, messageId);
                    }
                }});
            } else {
                items.push({ label: 'Закрепить', icon: '📌', onClick: () => {
                    if (client && typeof client.pinMessage === 'function') {
                        client.pinMessage(client.currentRoom, messageId);
                    }
                }});
            }
        }

        if (canDelete) {
            const deleteLabel = isForwardedPoll ? 'Удалить пересланный опрос' : 'Удалить';
            items.push({ label: deleteLabel, icon: '🗑️', onClick: () => {
                UIManager.confirmDeleteMessage(messageId);
            }, isDanger: true });
        }

        createContextMenu(x, y, items);
    }

    static showMemberContextMenu(event, userId, username) {
        event.preventDefault();
        event.stopPropagation();
        const client = window.voiceClient;
        if (!userId || (client && userId === client.userId)) return;
        const { x, y } = this._extractCoordinates(event);

        const items = [
            { label: 'Личка', icon: '💬', onClick: () => {
                const existing = client.servers.find(s => s.id?.startsWith("user_") && s.id?.includes(userId));
                if (existing) {
                    client.currentServerId = existing.id;
                    client.currentServer = existing;
                    localStorage.setItem("lastServerId", existing.id);
                    client.joinRoom(existing.id);
                } else {
                    ServerManager.createDirectRoom(client, userId, username);
                }
            }},
            { label: 'Заметки', icon: '📝', onClick: () => {
                if (client && typeof client.openUserPublicNotes === 'function') {
                    client.openUserPublicNotes(userId);
                }
            }}
        ];

        createContextMenu(x, y, items);
    }

    static showPinnedMessageContextMenu(event, messageId, messageObj) {
        event.preventDefault();
        event.stopPropagation();
        const { x, y } = this._extractCoordinates(event);
        const client = window.voiceClient;
        if (!client) return;

        const canPin = this._canManagePinnedMessages(client, client.currentRoom);

        const items = [
            { label: 'Перейти к сообщению', icon: '↩️', onClick: () => {
                UIManager.scrollToMessage(messageId, null, true);
            }}
        ];

        if (messageObj && messageObj.forwardedFrom) {
            items.push({ label: 'Перейти к источнику', icon: '🔗', onClick: () => {
                if (client && typeof client.jumpToForwardSource === 'function') {
                    client.jumpToForwardSource(messageObj.forwardedFrom);
                }
            }});
        }

        if (canPin) {
            items.push({ label: 'Открепить', icon: '📌', onClick: () => {
                if (client && typeof client.unpinMessage === 'function') {
                    client.unpinMessage(client.currentRoom, messageId);
                }
            }});
        }

        createContextMenu(x, y, items);
    }

    static showForwardedMessageContextMenu(event, messageId, messageObj) {
        event.preventDefault();
        event.stopPropagation();
        const { x, y } = this._extractCoordinates(event);
        const client = window.voiceClient;
        if (!client) return;

        const canDelete = this._canDeleteMessage(client, messageId, messageObj?.userId, messageObj);

        const items = [
            { label: 'Перейти к источнику', icon: '🔗', onClick: () => {
                if (client && typeof client.jumpToForwardSource === 'function' && messageObj.forwardedFrom) {
                    client.jumpToForwardSource(messageObj.forwardedFrom);
                }
            }}
        ];

        if (canDelete) {
            items.push({ label: 'Удалить пересланное сообщение', icon: '🗑️', onClick: () => {
                UIManager.confirmDeleteMessage(messageId);
            }, isDanger: true });
        }

        createContextMenu(x, y, items);
    }
}

export default ContextMenuManager;
