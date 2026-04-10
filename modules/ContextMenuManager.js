import ServerManager from './ServerManager.js';
import UIManager from './UIManager.js';

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

    static showMessageContextMenu(event, messageId, userId, username, timestamp, messageObj = null) {
        event.preventDefault();
        event.stopPropagation();
        const { x, y } = this._extractCoordinates(event);
        const menu = this._createBaseMenu(x, y);
        const client = window.voiceClient;
        const isOwnMessage = client && client.userId === userId;
        const canDelete = isOwnMessage || (client && client.currentServer && client.currentServer.ownerId === client.userId);

        this._addMenuItem(menu, '↩️ Ответить', () => { if (messageObj) UIManager.setReplyTarget(messageObj); });
        this._addMenuItem(menu, 'ℹ️ Информация', () => { UIManager.showMessageInfo(messageId, userId, username, timestamp); });
        
        if (userId && client && userId !== client.userId) {
            this._addMenuItem(menu, '💬 Личка', () => { ServerManager.createDirectRoom(client, userId, username); });
        }
        if (canDelete) {
            this._addSeparator(menu);
            this._addMenuItem(menu, '🗑️ Удалить', () => { UIManager.confirmDeleteMessage(messageId); }, true);
        }
    }

    static showMemberContextMenu(event, userId, username) {
        event.preventDefault();
        event.stopPropagation();
        const client = window.voiceClient;
        if (!userId || (client && userId === client.userId)) return;
        const { x, y } = this._extractCoordinates(event);
        const menu = this._createBaseMenu(x, y, '150px');
        this._addMenuItem(menu, '💬 Личка', () => { ServerManager.createDirectRoom(client, userId, username); });
    }
}

export default ContextMenuManager;
