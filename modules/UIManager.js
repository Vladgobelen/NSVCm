import TextChatManager from './TextChatManager.js';
import MembersManager from './MembersManager.js';
import VolumeBoostManager from './VolumeBoostManager.js';
import RoomManager from './RoomManager.js';
import ServerManager from './ServerManager.js';

const CONNECTION_STATUS_ICONS = {
  unknown: '❓',
  connecting: '🔄',
  connected: '✅',
  success: '✅',
  error: '❌',
  info: 'ℹ️',
  disconnected: '🔴'
};

const CONNECTION_STATUS_COLORS = {
  unknown: '#606070',
  connecting: '#f1c40f',
  connected: '#2ecc71',
  success: '#2ecc71',
  error: '#e74c3c',
  info: '#3498db',
  disconnected: '#e74c3c'
};

class UIManager {
  static client = null;
  static unreadCounts = {};
  static unreadVersion = 0;
  static unreadLastSync = null;
  static usernameCache = new Map();
  static contextMenu = null;
  static connectionStatusMap = new Map();
  static notificationTimer = null;
  static replyTarget = null;
  static secondaryChat = {
    enabled: false,
    direction: 'side',
    roomId: null,
    container: null,
    messagesContainer: null,
    inputEl: null,
    roomSelector: null,
    roomList: null,
    isLoading: false,
    hasMore: true,
    oldestMessageId: null
  };

  static setClient(client) {
    this.client = client;
    if (!client.secondaryChat) {
      client.secondaryChat = { enabled: false, roomId: null, isLoading: false, hasMore: true, oldestMessageId: null };
    }
  }

  static setReplyTarget(msg) {
    if (!msg) return;
    this.replyTarget = { id: msg.id, userId: msg.userId, username: msg.username, text: msg.text };
    const existing = document.querySelector('.reply-preview-bar');
    if (existing) existing.remove();
    const bar = document.createElement('div');
    bar.className = 'reply-preview-bar';
    bar.innerHTML = `<span class="reply-target-user">${this.escapeHtml(msg.username)}</span><span class="reply-target-text">${this.escapeHtml(msg.text?.substring(0, 60) || '')}...</span><button class="reply-close-btn">✕</button>`;
    bar.style.cssText = 'background: #3a3a5c; border-top: 2px solid #5865f2; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #e0e0e0; border-radius: 8px 8px 0 0; margin-bottom: -8px; position: relative; z-index: 10;';
    const inputArea = document.querySelector('.input-area') || document.querySelector('.secondary-input-area');
    if (inputArea) {
      inputArea.style.borderRadius = '0';
      inputArea.parentNode.insertBefore(bar, inputArea);
    }
    bar.querySelector('.reply-close-btn').addEventListener('click', () => { this.clearReplyTarget(); });
  }

  static clearReplyTarget() {
    this.replyTarget = null;
    const bar = document.querySelector('.reply-preview-bar');
    if (bar) bar.remove();
    const inputArea = document.querySelector('.input-area') || document.querySelector('.secondary-input-area');
    if (inputArea) inputArea.style.borderRadius = '';
  }

  static showConnectionStatus(userId, status) {
    const memberElement = document.querySelector(`.member-item[data-user-id="${userId}"]`);
    if (!memberElement) return;
    UIManager.connectionStatusMap.set(userId, status);
    const icon = CONNECTION_STATUS_ICONS[status] || CONNECTION_STATUS_ICONS.unknown;
    const color = CONNECTION_STATUS_COLORS[status] || CONNECTION_STATUS_COLORS.unknown;
    let title = '';
    switch (status) {
      case 'connecting': title = 'Подключение...'; break;
      case 'success': case 'connected': title = 'Подключен'; break;
      case 'error': title = 'Ошибка подключения'; break;
      case 'disconnected': title = 'Отключен'; break;
      default: title = 'Неизвестно';
    }
    let statusElement = memberElement.querySelector('.connection-status-icon');
    if (!statusElement) {
      statusElement = document.createElement('span');
      statusElement.className = 'connection-status-icon';
      statusElement.style.cssText = 'margin-left: 6px; font-size: 12px; cursor: help;';
      const memberName = memberElement.querySelector('.member-name');
      if (memberName) memberName.appendChild(statusElement);
    }
    statusElement.textContent = icon;
    statusElement.style.color = color;
    statusElement.title = title;
  }

  static getConnectionStatus(userId) {
    return UIManager.connectionStatusMap.get(userId) || 'unknown';
  }

  static clearConnectionStatuses() {
    UIManager.connectionStatusMap.clear();
    document.querySelectorAll('.connection-status-icon').forEach((el) => el.remove());
  }

  static openCreateRoomModal(client, onSubmit) {
    const modalOverlay = document.querySelector('.modal-overlay');
    const modalContent = document.querySelector('.modal-content');
    if (!modalOverlay || !modalContent) {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center; align-items: center; z-index: 10000;';
      const content = document.createElement('div');
      content.className = 'modal-content';
      content.style.cssText = 'background: #2d2d44; border-radius: 12px; padding: 24px; max-width: 400px; width: 90%; border: 1px solid #404060;';
      content.innerHTML = `
        <h2 style="margin: 0 0 20px 0; color: #e0e0e0;">Свить гнездо</h2>
        <input type="text" id="createRoomNameInput" placeholder="Название гнезда" style="width: 100%; padding: 10px; margin-bottom: 15px; background: #1a1a2e; border: 1px solid #404060; color: #e0e0e0; border-radius: 6px; font-size: 14px;">
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="createRoomCancelBtn" style="padding: 10px 20px; background: #404060; color: #e0e0e0; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">Отмена</button>
          <button id="createRoomSubmitBtn" style="padding: 10px 20px; background: #5865f2; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">Свить</button>
        </div>
      `;
      overlay.appendChild(content);
      document.body.appendChild(overlay);
      const input = content.querySelector('#createRoomNameInput');
      const submitBtn = content.querySelector('#createRoomSubmitBtn');
      const cancelBtn = content.querySelector('#createRoomCancelBtn');
      const handleSubmit = () => {
        const name = input.value.trim();
        if (name.length < 3) return alert('Название должно быть от 3 символов');
        overlay.remove();
        if (onSubmit) onSubmit(name);
      };
      submitBtn.addEventListener('click', handleSubmit);
      cancelBtn.addEventListener('click', () => overlay.remove());
      input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSubmit(); });
      input.focus();
      return;
    }
    modalContent.innerHTML = `
      <h2>Свить гнездо</h2>
      <input type="text" id="createRoomNameInput" placeholder="Название гнезда" style="width: 100%; padding: 10px; margin: 15px 0; background: #1a1a2e; border: 1px solid #404060; color: #e0e0e0; border-radius: 6px;">
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button class="modal-cancel">Отмена</button>
        <button class="modal-submit">Свить</button>
      </div>
    `;
    modalOverlay.classList.remove('hidden');
    const input = modalContent.querySelector('#createRoomNameInput');
    const submitButton = modalContent.querySelector('.modal-submit');
    const cancelButton = modalContent.querySelector('.modal-cancel');
    const handleSubmit = () => {
      const name = input.value.trim();
      if (name.length < 3) return alert('Название должно быть от 3 символов');
      UIManager.closeModal();
      if (onSubmit) onSubmit(name);
    };
    if (submitButton) submitButton.addEventListener('click', handleSubmit);
    if (cancelButton) cancelButton.addEventListener('click', () => UIManager.closeModal());
    if (input) {
      input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSubmit(); });
      input.focus();
    }
  }

  static showMessageContextMenu(event, messageId, userId, username, timestamp, messageObj = null) {
    event.preventDefault();
    event.stopPropagation();
    if (UIManager.contextMenu) UIManager.contextMenu.remove();
    const menu = document.createElement('div');
    menu.className = 'message-context-menu';
    menu.style.cssText = 'position: fixed; background: #2d2d44; border: 1px solid #404060; border-radius: 8px; padding: 8px 0; min-width: 200px; z-index: 10000; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);';
    const client = UIManager.client || window.voiceClient;
    const isOwnMessage = client && client.userId === userId;
    const canDelete = isOwnMessage || (client && client.currentServer && client.currentServer.ownerId === client.userId);
    const replyItem = document.createElement('div');
    replyItem.className = 'context-menu-item';
    replyItem.innerHTML = '<span class="context-menu-icon">↩️</span><span class="context-menu-text">Ответить</span>';
    replyItem.style.cssText = 'padding: 10px 16px; cursor: pointer; display: flex; align-items: center; gap: 10px; color: #e0e0e0; transition: background 0.2s;';
    replyItem.addEventListener('mouseenter', () => { replyItem.style.background = '#3d3d5c'; });
    replyItem.addEventListener('mouseleave', () => { replyItem.style.background = 'transparent'; });
    replyItem.addEventListener('click', () => { if (messageObj) UIManager.setReplyTarget(messageObj); UIManager.hideContextMenu(); });
    menu.appendChild(replyItem);
    const infoItem = document.createElement('div');
    infoItem.className = 'context-menu-item';
    infoItem.innerHTML = '<span class="context-menu-icon">ℹ️</span><span class="context-menu-text">Информация</span>';
    infoItem.style.cssText = 'padding: 10px 16px; cursor: pointer; display: flex; align-items: center; gap: 10px; color: #e0e0e0; transition: background 0.2s;';
    infoItem.addEventListener('mouseenter', () => { infoItem.style.background = '#3d3d5c'; });
    infoItem.addEventListener('mouseleave', () => { infoItem.style.background = 'transparent'; });
    infoItem.addEventListener('click', () => { UIManager.showMessageInfo(messageId, userId, username, timestamp); UIManager.hideContextMenu(); });
    menu.appendChild(infoItem);
    if (canDelete) {
      const separator = document.createElement('div');
      separator.style.cssText = 'height: 1px; background: #404060; margin: 4px 0;';
      menu.appendChild(separator);
      const deleteItem = document.createElement('div');
      deleteItem.className = 'context-menu-item delete';
      deleteItem.innerHTML = '<span class="context-menu-icon">🗑️</span><span class="context-menu-text">Удалить</span>';
      deleteItem.style.cssText = 'padding: 10px 16px; cursor: pointer; display: flex; align-items: center; gap: 10px; color: #ed4245; transition: background 0.2s;';
      deleteItem.addEventListener('mouseenter', () => { deleteItem.style.background = 'rgba(237, 66, 69, 0.1)'; });
      deleteItem.addEventListener('mouseleave', () => { deleteItem.style.background = 'transparent'; });
      deleteItem.addEventListener('click', () => { UIManager.confirmDeleteMessage(messageId); UIManager.hideContextMenu(); });
      menu.appendChild(deleteItem);
    }
    let x = event.clientX;
    let y = event.clientY;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 10}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 10}px`;
    document.body.appendChild(menu);
    UIManager.contextMenu = menu;
    const closeHandler = () => { UIManager.hideContextMenu(); document.removeEventListener('click', closeHandler); };
    setTimeout(() => { document.addEventListener('click', closeHandler); }, 100);
    const escapeHandler = (e) => { if (e.key === 'Escape') { UIManager.hideContextMenu(); document.removeEventListener('keydown', escapeHandler); } };
    document.addEventListener('keydown', escapeHandler);
  }

  static hideContextMenu() {
    if (UIManager.contextMenu) { UIManager.contextMenu.remove(); UIManager.contextMenu = null; }
  }

  static async showMessageInfo(messageId, userId, username, timestamp) {
    try {
      const response = await fetch(`${UIManager.client.API_SERVER_URL}/api/messages/${UIManager.client.currentRoom}/${messageId}/info`, {
        headers: { Authorization: `Bearer ${UIManager.client.token}`, 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Не удалось получить информацию');
      const data = await response.json();
      const message = data.message;
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center; align-items: center; z-index: 10001;';
      const content = document.createElement('div');
      content.style.cssText = 'background: #2d2d44; border-radius: 12px; padding: 24px; max-width: 500px; width: 90%; border: 1px solid #404060;';
      content.innerHTML = `
        <h3 style="margin: 0 0 20px 0; color: #e0e0e0;">📋 Информация о сообщении</h3>
        <div style="color: #b0b0c0; line-height: 1.8;">
          <div><strong>ID:</strong> <code style="background: #1a1a2e; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${message.id}</code></div>
          <div style="margin-top: 12px;"><strong>Автор:</strong> ${UIManager.escapeHtml(message.username)}</div>
          <div style="margin-top: 8px;"><strong>ID автора:</strong> <code style="background: #1a1a2e; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${message.userId}</code></div>
          <div style="margin-top: 8px;"><strong>Время:</strong> ${new Date(message.timestamp).toLocaleString('ru-RU')}</div>
          <div style="margin-top: 8px;"><strong>Тип:</strong> ${message.type || 'text'}</div>
          <div style="margin-top: 8px;"><strong>Гнездо:</strong> <code style="background: #1a1a2e; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${message.roomId}</code></div>
          ${message.text ? `<div style="margin-top: 16px; padding: 12px; background: #1a1a2e; border-radius: 8px;"><strong>Текст:</strong><br><span style="color: #e0e0e0;">${UIManager.escapeHtml(message.text)}</span></div>` : ''}
        </div>
        <button id="closeInfoModal" style="margin-top: 20px; padding: 10px 24px; background: #5865f2; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">Закрыть</button>
      `;
      modal.appendChild(content);
      document.body.appendChild(modal);
      const closeBtn = content.querySelector('#closeInfoModal');
      closeBtn.addEventListener('click', () => { modal.remove(); });
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    } catch {
      UIManager.showError('Не удалось получить информацию о сообщении');
    }
  }

  static async confirmDeleteMessage(messageId) {
    const confirmed = confirm('Вы уверены, что хотите удалить это сообщение? Это действие нельзя отменить.');
    if (!confirmed) return;
    try {
      const response = await fetch(`${UIManager.client.API_SERVER_URL}/api/messages/${UIManager.client.currentRoom}/${messageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${UIManager.client.token}`, 'Content-Type': 'application/json' }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Не удалось удалить сообщение');
      }
    } catch (error) {
      UIManager.showError('Не удалось удалить сообщение: ' + error.message);
    }
  }

  static async fetchUsername(userId) {
    if (!userId) return 'Unknown';
    if (UIManager.usernameCache.has(userId)) return UIManager.usernameCache.get(userId);
    try {
      const response = await fetch(`${UIManager.client.API_SERVER_URL}/api/users/${userId}`, {
        headers: { Authorization: `Bearer ${UIManager.client.token}`, 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        const username = data.username || userId.replace('user_', '');
        UIManager.usernameCache.set(userId, username);
        return username;
      }
    } catch {}
    const fallback = userId.replace('user_', '');
    UIManager.usernameCache.set(userId, fallback);
    return fallback;
  }

  static async fetchUsernames(userIds) {
    if (!Array.isArray(userIds) || userIds.length === 0) return;
    const missing = userIds.filter((id) => !UIManager.usernameCache.has(id));
    if (missing.length === 0) return;
    try {
      const response = await fetch(`${UIManager.client.API_SERVER_URL}/api/users/batch?userIds=${missing.join(',')}`, {
        headers: { Authorization: `Bearer ${UIManager.client.token}`, 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.users) {
          for (const [uid, uData] of Object.entries(data.users)) {
            UIManager.usernameCache.set(uid, uData.username || uid.replace('user_', ''));
          }
        }
      }
    } catch {}
  }

  static syncUnreadCounts(serverData) {
    UIManager.unreadVersion++;
    UIManager.unreadLastSync = new Date().toISOString();
    UIManager.unreadCounts = {};
    for (const [serverId, rooms] of Object.entries(serverData)) {
      if (!UIManager.unreadCounts[serverId]) {
        UIManager.unreadCounts[serverId] = { total: 0, personalTotal: 0, hasMentionTotal: false, rooms: {} };
      }
      for (const [roomId, roomData] of Object.entries(rooms)) {
        UIManager.unreadCounts[serverId].rooms[roomId] = { count: roomData.count || 0, hasMention: roomData.hasMention || false, personalCount: roomData.personalCount || 0 };
        UIManager.unreadCounts[serverId].total += roomData.count || 0;
        UIManager.unreadCounts[serverId].personalTotal += roomData.personalCount || 0;
        if (roomData.hasMention) UIManager.unreadCounts[serverId].hasMentionTotal = true;
      }
    }
    UIManager.updateServerBadges();
    UIManager.updateRoomBadges();
    UIManager.updateTotalBadge();
    if (UIManager.client) UIManager.updateRoomTitleBadge(UIManager.client);
  }

  static updateStatus(text, status) {
    const statusText = document.querySelector('.status-text');
    const statusIndicator = document.querySelector('.status-indicator');
    if (statusText) statusText.textContent = text;
    if (statusIndicator) {
      statusIndicator.className = 'status-indicator';
      if (status === 'connecting') statusIndicator.classList.add('connecting');
      else if (status === 'disconnected') statusIndicator.classList.add('disconnected');
      else if (status === 'connected') statusIndicator.classList.add('connected');
    }
  }

  static _createMessageElement(user, text, timestamp = null, type = 'text', imageUrl = null, messageId = null, readBy = [], userId = null, broadcast = false, thumbnailUrl = null, replyTo = null) {
    const safeUser = user || 'Unknown';
    const safeText = text || '';
    const client = UIManager.client || window.voiceClient;
    const isOwn = client && client.username && safeUser === client.username;
    const messageElement = document.createElement('div');
    messageElement.className = 'message' + (type === 'system' ? ' system-message' : '');
    if (messageId) messageElement.dataset.messageId = messageId;
    if (userId) messageElement.dataset.userId = userId;
    if (timestamp) messageElement.dataset.timestamp = timestamp;
    if (readBy?.length) messageElement.dataset.readBy = JSON.stringify(readBy);
    if (broadcast) messageElement.dataset.broadcast = 'true';
    messageElement.addEventListener('contextmenu', (event) => {
      if (messageId && userId) {
        const msgObj = { id: messageId, userId, username: safeUser, text: safeText, timestamp, type, imageUrl, thumbnailUrl };
        UIManager.showMessageContextMenu(event, messageId, userId, safeUser, timestamp, msgObj);
      }
    });
    const time = timestamp
      ? new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      : new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    let finalImageUrl = imageUrl;
    let finalThumbnailUrl = thumbnailUrl;
    if (imageUrl?.startsWith('/')) { if (client?.API_SERVER_URL) finalImageUrl = client.API_SERVER_URL + imageUrl; }
    if (thumbnailUrl?.startsWith('/')) { if (client?.API_SERVER_URL) finalThumbnailUrl = client.API_SERVER_URL + thumbnailUrl; }
    const avatarHtml = (isOwn && type !== 'system') ? '' : `<div class="message-avatar">${safeUser.charAt(0).toUpperCase()}</div>`;
    let replyBlockHtml = '';
    if (replyTo && replyTo.id) {
      const replyUsername = replyTo.username || 'Unknown';
      const replyText = replyTo.text || '';
      replyBlockHtml = `<div class="reply-block" data-reply-id="${replyTo.id}" style="background: #3a3a5c; padding: 8px 12px; border-radius: 8px 8px 0 0; margin-bottom: 6px; font-size: 12px; color: #a0a0b0; border-left: 3px solid #5865f2; cursor: pointer; display: flex; flex-direction: column; gap: 2px;">
        <div style="color: #5865f2; font-weight: 600; display: flex; align-items: center; gap: 4px;">↩️ ${UIManager.escapeHtml(replyUsername)}</div>
        <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${UIManager.escapeHtml(replyText)}</div>
      </div>`;
    }
    if (type === 'image') {
      const displayUrl = finalThumbnailUrl || finalImageUrl;
      messageElement.innerHTML = `
        ${replyBlockHtml}
        ${avatarHtml}
        <div class="message-content${isOwn ? ' own' : ''}">
          <div class="message-header">
            <span class="message-username">${UIManager.escapeHtml(safeUser)}</span>
            <span class="message-time">${time}</span>
          </div>
          <div class="message-text">
            <div class="image-thumbnail" data-full-size="${UIManager.escapeHtml(finalImageUrl)}" style="cursor: pointer;">
              <img src="${UIManager.escapeHtml(displayUrl)}" alt="Изображение" loading="lazy" style="max-width: 320px; max-height: 240px; border-radius: 8px; object-fit: cover; border: none !important; outline: none !important; box-shadow: none !important; display: block;">
              <div class="image-overlay">🔍 Нажмите для просмотра</div>
            </div>
          </div>
        </div>
      `;
      const replyBlock = messageElement.querySelector('.reply-block');
      if (replyBlock && replyTo) replyBlock.addEventListener('click', () => UIManager.handleReplyClick(replyTo.id));
      const imageThumbnail = messageElement.querySelector('.image-thumbnail');
      if (imageThumbnail && finalImageUrl) imageThumbnail.addEventListener('click', () => { UIManager.openImageModal(finalImageUrl); });
    } else {
      const formattedText = type === 'system'
        ? `<pre style="white-space: pre-wrap; font-family: monospace; font-size: 12px; background: #1a1a2e; padding: 10px; border-radius: 5px; overflow-x: auto;">${UIManager.escapeHtml(safeText)}</pre>`
        : UIManager.escapeHtmlAndFormat(safeText);
      messageElement.innerHTML = `
        ${replyBlockHtml}
        ${avatarHtml}
        <div class="message-content${isOwn ? ' own' : ''}">
          <div class="message-header">
            <span class="message-username">${UIManager.escapeHtml(safeUser)}</span>
            <span class="message-time">${time}</span>
          </div>
          <div class="message-text">${formattedText}</div>
        </div>
      `;
      const replyBlock = messageElement.querySelector('.reply-block');
      if (replyBlock && replyTo) replyBlock.addEventListener('click', () => UIManager.handleReplyClick(replyTo.id));
    }
    return messageElement;
  }

  static async handleReplyClick(messageId) {
    const container = document.querySelector('.messages-container');
    const target = container?.querySelector(`.message[data-message-id="${messageId}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.style.transition = 'background 0.3s';
      target.style.background = 'rgba(88, 101, 242, 0.2)';
      setTimeout(() => { target.style.background = ''; }, 1500);
    } else {
      try {
        const response = await fetch(`${UIManager.client.API_SERVER_URL}/api/messages/${UIManager.client.currentRoom}/${messageId}/info`, {
          headers: { Authorization: `Bearer ${UIManager.client.token}`, 'Content-Type': 'application/json' }
        });
        if (response.ok) {
          const data = await response.json();
          UIManager.showReplyInfoModal(data.message);
        } else {
          UIManager.showError('Сообщение не найдено в архиве');
        }
      } catch {
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
    content.innerHTML = `
      <h3 style="margin: 0 0 20px 0; color: #e0e0e0;">↩️ Исходное сообщение</h3>
      <div style="color: #b0b0c0; line-height: 1.8;">
        <div style="margin-top: 12px;"><strong>Автор:</strong> ${UIManager.escapeHtml(message.username)}</div>
        <div style="margin-top: 8px;"><strong>Время:</strong> ${new Date(message.timestamp).toLocaleString('ru-RU')}</div>
        ${message.text ? `<div style="margin-top: 16px; padding: 12px; background: #1a1a2e; border-radius: 8px; border-left: 3px solid #5865f2;"><span style="color: #e0e0e0;">${UIManager.escapeHtml(message.text)}</span></div>` : ''}
      </div>
      <button class="reply-modal-close" style="margin-top: 20px; padding: 10px 24px; background: #5865f2; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">Закрыть</button>
    `;
    modal.appendChild(content);
    document.body.appendChild(modal);
    const closeBtn = content.querySelector('.reply-modal-close');
    closeBtn.addEventListener('click', () => { modal.remove(); });
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }

  static addMessage(user, text, timestamp = null, type = 'text', imageUrl = null, messageId = null, readBy = [], userId = null, broadcast = false, thumbnailUrl = null, targetContainer = null, replyTo = null) {
    const container = targetContainer || document.querySelector('.messages-container');
    if (!container) return;
    const messageElement = this._createMessageElement(user, text, timestamp, type, imageUrl, messageId, readBy, userId, broadcast, thumbnailUrl, replyTo);
    if (!messageElement) return;
    container.appendChild(messageElement);
    container.scrollTop = container.scrollHeight;
    setTimeout(() => messageElement.classList.add('appeared'), 10);
  }

  static prependMessageToContainer(user, text, timestamp = null, type = 'text', imageUrl = null, messageId = null, readBy = [], userId = null, broadcast = false, thumbnailUrl = null, container = null, replyTo = null) {
    const targetContainer = container || document.querySelector('.messages-container');
    if (!targetContainer) return;
    const sentinel = targetContainer.querySelector('.history-sentinel');
    const refNode = sentinel ? sentinel.nextSibling : targetContainer.firstChild;
    const oldScrollHeight = targetContainer.scrollHeight;
    const messageElement = this._createMessageElement(user, text, timestamp, type, imageUrl, messageId, readBy, userId, broadcast, thumbnailUrl, replyTo);
    if (!messageElement) return;
    targetContainer.insertBefore(messageElement, refNode);
    requestAnimationFrame(() => {
      messageElement.classList.add('appeared');
      const newScrollHeight = targetContainer.scrollHeight;
      targetContainer.scrollTop = newScrollHeight - oldScrollHeight;
    });
  }

  static clearContainerMessages(container = null) {
    const targetContainer = container || document.querySelector('.messages-container');
    if (!targetContainer) return;
    const sentinel = targetContainer.querySelector('.history-sentinel');
    const children = Array.from(targetContainer.children);
    for (const child of children) {
      if (child !== sentinel) targetContainer.removeChild(child);
    }
    if (sentinel && targetContainer.firstChild !== sentinel) targetContainer.prepend(sentinel);
  }

  static prependMessage(user, text, timestamp = null, type = 'text', imageUrl = null, messageId = null, readBy = [], userId = null, broadcast = false, thumbnailUrl = null, replyTo = null) {
    const container = document.querySelector('.messages-container');
    if (!container) return;
    const sentinel = container.querySelector('.history-sentinel');
    const refNode = sentinel ? sentinel.nextSibling : container.firstChild;
    const oldScrollHeight = container.scrollHeight;
    const messageElement = this._createMessageElement(user, text, timestamp, type, imageUrl, messageId, readBy, userId, broadcast, thumbnailUrl, replyTo);
    if (!messageElement) return;
    container.insertBefore(messageElement, refNode);
    requestAnimationFrame(() => {
      messageElement.classList.add('appeared');
      const newScrollHeight = container.scrollHeight;
      container.scrollTop = newScrollHeight - oldScrollHeight;
    });
  }

  static prependMessagesBatch(messages) {
    const container = document.querySelector('.messages-container');
    if (!container || !messages?.length) return;
    const sentinel = container.querySelector('.history-sentinel');
    const refNode = sentinel ? sentinel.nextSibling : container.firstChild;
    const oldScrollHeight = container.scrollHeight;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const el = this._createMessageElement(msg.username, msg.text, msg.timestamp, msg.type, msg.imageUrl, msg.id, msg.readBy || [], msg.userId, false, msg.thumbnailUrl, msg.replyTo);
      if (el) { el.classList.add('appeared'); fragment.appendChild(el); }
    }
    container.insertBefore(fragment, refNode);
    requestAnimationFrame(() => {
      const newScrollHeight = container.scrollHeight;
      const scrollDiff = newScrollHeight - oldScrollHeight;
      container.scrollTop += scrollDiff;
    });
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
    closeBtn.addEventListener('click', () => { modalOverlay.remove(); });
    modalOverlay.appendChild(imageElement);
    modalOverlay.appendChild(closeBtn);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.remove(); });
    const escapeHandler = (e) => { if (e.key === 'Escape') { modalOverlay.remove(); document.removeEventListener('keydown', escapeHandler); } };
    document.addEventListener('keydown', escapeHandler);
    document.body.appendChild(modalOverlay);
  }

  static updateMessageReadStatus(messageId, readerId, readerName) {
    const msgEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!msgEl) return;
    const readBy = JSON.parse(msgEl.dataset.readBy || '[]');
    if (!readBy.includes(readerId)) {
      readBy.push(readerId);
      msgEl.dataset.readBy = JSON.stringify(readBy);
    }
    const timeEl = msgEl.querySelector('.message-time');
    if (timeEl) {
      const ownMsg = msgEl.querySelector('.message-content.own');
      if (ownMsg) {
        const readers = readBy.length;
        if (readers === 0) timeEl.textContent = timeEl.textContent.replace(/✓✓?$/, '') + ' ✓';
        else if (readers === 1) timeEl.textContent = timeEl.textContent.replace(/✓✓?$/, '') + ' ✓✓';
        else timeEl.textContent = timeEl.textContent.replace(/✓✓?$/, '') + ' ✓✓✓';
      }
    }
  }

  static removeMessageFromUI(messageId) {
    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (messageElement) {
      messageElement.style.transition = 'all 0.3s ease';
      messageElement.style.opacity = '0';
      messageElement.style.transform = 'translateX(-20px)';
      setTimeout(() => { if (messageElement && messageElement.parentNode) messageElement.remove(); }, 300);
    }
  }

  static updateMicButton(status) {
    const states = {
      disconnected: { class: 'disconnected', text: '🎤', title: 'Не подключен к голосовому каналу' },
      connecting: { class: 'connecting', text: '🎤', title: 'Подключение...' },
      connected: { class: 'connected', text: '🎤', title: 'Микрофон выключен (нажмите чтобы включить)' },
      active: { class: 'active', text: '🔴', title: 'Микрофон включен (нажмите чтобы выключить)' },
      paused: { class: 'paused', text: '⏸️', title: 'Микрофон на паузе (нажмите чтобы возобновить)' },
      error: { class: 'error', text: '🎤', title: 'Ошибка доступа к микрофону' }
    };
    const state = states[status] || states.disconnected;
    ['.mic-button', '.mic-toggle-btn'].forEach((sel) => {
      const element = document.querySelector(sel);
      if (element) {
        element.className = sel.replace('.', '') + ' ' + state.class;
        element.textContent = state.text;
        element.title = state.title;
      }
    });
  }

  static updateAudioStatus(activeConsumers) {
    const statusElement = document.querySelector('.audio-status');
    if (!statusElement) return;
    if (activeConsumers > 0) {
      statusElement.textContent = `Активных аудиопотоков: ${activeConsumers}`;
      statusElement.style.color = 'var(--success)';
    } else {
      statusElement.textContent = 'Нет активных аудиопотоков';
      statusElement.style.color = 'var(--text-muted)';
    }
  }

  static escapeHtmlAndFormat(text) {
    if (!text) return '';
    let processed = text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    const urlRegex = /(?<!href=")(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*))(?![^<]*>)/gi;
    processed = processed.replace(urlRegex, (match) => {
      let cleanUrl = match.replace(/[.,;:!?)\]]+$/, '');
      const trailingPunctuation = match.slice(cleanUrl.length);
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="chat-link" style="color: #5865f2; text-decoration: underline; word-break: break-all;">${cleanUrl}</a>${trailingPunctuation}`;
    });
    processed = processed
      .replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>')
      .replace(/__([^_]+?)__/g, '<u>$1</u>')
      .replace(/~~([^~]+?)~~/g, '<s>$1</s>')
      .replace(/\*([^*]+?)\*/g, '<i>$1</i>')
      .replace(/[\r\n]+/g, '<br>');
    return processed;
  }

  static escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  static updateMembersListWithStatus(onlineMembers, offlineMembers) {
    const membersList = document.querySelector('.members-list');
    if (!membersList) return;
    const savedSliderValues = new Map();
    membersList.querySelectorAll('.member-item').forEach((item) => {
      const userId = item.dataset.userId;
      const slider = item.querySelector('.member-volume-slider');
      if (userId && slider) {
        let value = VolumeBoostManager.getGain(userId);
        savedSliderValues.set(userId, value !== null ? Math.round(value * 100) : slider.value);
      }
    });
    membersList.innerHTML = '';
    const onlineHeader = document.createElement('div');
    onlineHeader.className = 'members-section-header online-header';
    onlineHeader.innerHTML = `<span class="section-toggle-icon">${MembersManager.isSectionCollapsed('online') ? '▶' : '▼'}</span><span class="section-title">Онлайн (${onlineMembers?.length || 0})</span>`;
    onlineHeader.addEventListener('click', () => { MembersManager.toggleSection('online'); });
    membersList.appendChild(onlineHeader);
    const onlineContainer = document.createElement('div');
    onlineContainer.className = 'members-section-content';
    onlineContainer.style.display = MembersManager.isSectionCollapsed('online') ? 'none' : 'block';
    if (onlineMembers && onlineMembers.length > 0) {
      onlineMembers.forEach((user) => {
        const el = UIManager._createMemberElement(user, savedSliderValues, true);
        if (el) onlineContainer.appendChild(el);
      });
    }
    membersList.appendChild(onlineContainer);
    const offlineHeader = document.createElement('div');
    offlineHeader.className = 'members-section-header offline-header';
    offlineHeader.innerHTML = `<span class="section-toggle-icon">${MembersManager.isSectionCollapsed('offline') ? '▶' : '▼'}</span><span class="section-title">Офлайн (${offlineMembers?.length || 0})</span>`;
    offlineHeader.addEventListener('click', () => { MembersManager.toggleSection('offline'); });
    membersList.appendChild(offlineHeader);
    const offlineContainer = document.createElement('div');
    offlineContainer.className = 'members-section-content';
    offlineContainer.style.display = MembersManager.isSectionCollapsed('offline') ? 'none' : 'block';
    if (offlineMembers && offlineMembers.length > 0) {
      offlineMembers.forEach((user) => {
        const el = UIManager._createMemberElement(user, savedSliderValues, false);
        if (el) offlineContainer.appendChild(el);
      });
    }
    membersList.appendChild(offlineContainer);
    if ((!onlineMembers || onlineMembers.length === 0) && (!offlineMembers || offlineMembers.length === 0)) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'members-empty';
      emptyMessage.textContent = 'В гнезде нет участников';
      membersList.appendChild(emptyMessage);
    }
    UIManager.syncVolumeSliders();
  }

  static _createMemberElement(user, savedSliderValues, isOnline) {
    if (!user || !user.userId) return null;
    const memberElement = document.createElement('div');
    memberElement.className = 'member-item' + (isOnline ? '' : ' offline');
    memberElement.dataset.userId = user.userId;
    memberElement.dataset.clientId = user.clientId || '';
    const savedValue = savedSliderValues.get(user.userId) || 100;
    memberElement.innerHTML = `
      <div class="member-avatar">${user.username.charAt(0).toUpperCase()}</div>
      <div class="member-info">
        <div class="member-name ${isOnline ? '' : 'offline-text'}">${UIManager.escapeHtml(user.username)}</div>
        <div class="member-controls">
          <div class="member-status">
            <div class="mic-indicator ${isOnline && user.isMicActive ? 'active' : ''}" title="${user.isMicActive ? 'Микрофон включен' : 'Микрофон выключен'}"></div>
          </div>
          <input type="range" class="member-volume-slider" min="0" max="200" value="${savedValue}" title="Громкость: ${savedValue}%" data-producer-id="" style="display: none;">
        </div>
      </div>
    `;
    const slider = memberElement.querySelector('.member-volume-slider');
    if (slider && !slider._hasVolumeHandler) {
      slider.addEventListener('input', (e) => {
        const value = e.target.value;
        const producerId = e.target.dataset.producerId;
        e.target.title = `Громкость: ${value}%`;
        const uid = window.producerUserMap?.get(producerId) || window.producerClientMap?.get(producerId);
        if (uid) VolumeBoostManager.setGain(uid, value / 100);
      });
      slider._hasVolumeHandler = true;
    }
    if (isOnline) {
      memberElement.addEventListener('mouseenter', () => { if (slider.dataset.producerId) slider.style.display = 'block'; });
      memberElement.addEventListener('mouseleave', () => { setTimeout(() => { if (!slider.matches(':hover')) slider.style.display = 'none'; }, 100); });
      slider.addEventListener('mouseleave', () => { slider.style.display = 'none'; });
    }
    return memberElement;
  }

  static updateMembersList(members) {
    const onlineMembers = members.filter((m) => m.isOnline === true);
    const offlineMembers = members.filter((m) => m.isOnline !== true);
    UIManager.updateMembersListWithStatus(onlineMembers, offlineMembers);
  }

  static syncVolumeSliders() {
    const membersList = document.querySelector('.members-list');
    if (!membersList) return;
    const memberItems = membersList.querySelectorAll('.member-item:not(.offline)');
    const producerUserMap = window.producerUserMap || new Map();
    const producerClientMap = window.producerClientMap || new Map();
    memberItems.forEach((item) => {
      const slider = item.querySelector('.member-volume-slider');
      if (slider) { slider.style.display = 'none'; slider.dataset.producerId = ''; }
    });
    for (const [producerId, userId] of producerUserMap.entries()) {
      const memberItem = membersList.querySelector(`.member-item[data-user-id="${userId}"]:not(.offline)`);
      if (memberItem) {
        const slider = memberItem.querySelector('.member-volume-slider');
        if (slider) { slider.dataset.producerId = producerId; slider.style.display = 'block'; }
      }
    }
    for (const [producerId, clientId] of producerClientMap.entries()) {
      if (producerUserMap.has(producerId)) continue;
      const memberItem = membersList.querySelector(`.member-item[data-client-id="${clientId}"]:not(.offline)`);
      if (memberItem) {
        const slider = memberItem.querySelector('.member-volume-slider');
        if (slider) {
          slider.dataset.producerId = producerId;
          slider.style.display = 'block';
          const userId = memberItem.dataset.userId;
          if (userId && !producerUserMap.has(producerId)) {
            if (!window.producerUserMap) window.producerUserMap = new Map();
            window.producerUserMap.set(producerId, userId);
          }
        }
      }
    }
  }

  static showVolumeSliderByUserId(producerId, userId) {
    const membersList = document.querySelector('.members-list');
    if (!membersList) return;
    const memberItem = membersList.querySelector(`.member-item[data-user-id="${userId}"]:not(.offline)`);
    if (memberItem) {
      const slider = memberItem.querySelector('.member-volume-slider');
      if (slider) {
        slider.dataset.producerId = producerId;
        slider.style.display = 'block';
        if (!slider._hasVolumeHandler) {
          slider.addEventListener('input', (e) => {
            const value = e.target.value;
            const pid = e.target.dataset.producerId;
            e.target.title = `Громкость: ${value}%`;
            const userId = window.producerUserMap?.get(pid) || window.producerClientMap?.get(pid);
            if (userId) VolumeBoostManager.setGain(userId, value / 100);
          });
          slider._hasVolumeHandler = true;
        }
      }
    }
  }

  static updateMemberMicState(userId, isActive, source = 'client') {
    const memberElement = document.querySelector(`.member-item[data-user-id="${userId}"]`);
    if (memberElement) {
      const micIndicator = memberElement.querySelector('.mic-indicator');
      if (micIndicator) {
        const isOnline = !memberElement.classList.contains('offline');
        const member = MembersManager.getMember(userId);
        const isServerData = member?.micSource === 'server' && member?.lastServerUpdate > Date.now() - 5000;
        if (isServerData || source === 'server') {
          if (isOnline) {
            micIndicator.className = isActive ? 'mic-indicator active' : 'mic-indicator';
            micIndicator.title = isActive ? 'Микрофон включен (сервер)' : 'Микрофон выключен (сервер)';
            micIndicator.style.backgroundColor = isActive ? '#2ecc71' : '#e74c3c';
            micIndicator.style.boxShadow = isActive ? '0 0 8px #2ecc71' : '0 0 8px #e74c3c';
            micIndicator.dataset.serverSync = 'true';
          } else {
            micIndicator.className = 'mic-indicator';
            micIndicator.title = 'Микрофон выключен';
            micIndicator.style.backgroundColor = '#606070';
            micIndicator.style.boxShadow = 'none';
            delete micIndicator.dataset.serverSync;
          }
        } else {
          if (isOnline) {
            micIndicator.className = isActive ? 'mic-indicator active' : 'mic-indicator';
            micIndicator.title = isActive ? 'Микрофон включен' : 'Микрофон выключен';
            micIndicator.style.backgroundColor = isActive ? '#2ecc71' : '#e74c3c';
            micIndicator.style.boxShadow = isActive ? '0 0 8px #2ecc71' : '0 0 8px #e74c3c';
          } else {
            micIndicator.className = 'mic-indicator';
            micIndicator.title = 'Микрофон выключен';
            micIndicator.style.backgroundColor = '#606070';
            micIndicator.style.boxShadow = 'none';
          }
        }
      }
    }
  }

  static openModal(title, content, onSubmit) {
    const modalOverlay = document.querySelector('.modal-overlay');
    const modalContent = document.querySelector('.modal-content');
    if (!modalOverlay || !modalContent) return;
    modalContent.innerHTML = `<h2>${title}</h2>${content}<button class="modal-submit">OK</button>`;
    modalOverlay.classList.remove('hidden');
    const submitButton = modalContent.querySelector('.modal-submit');
    if (submitButton && onSubmit) submitButton.addEventListener('click', onSubmit);
  }

  static closeModal() {
    const modalOverlay = document.querySelector('.modal-overlay');
    if (modalOverlay) modalOverlay.classList.add('hidden');
  }

  static showError(message) {
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;
    errorElement.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #ed4245; color: white; padding: 10px 15px; border-radius: 5px; z-index: 1000; max-width: 300px;';
    document.body.appendChild(errorElement);
    setTimeout(() => { if (document.body.contains(errorElement)) document.body.removeChild(errorElement); }, 5000);
  }

  static async updateRoomUI(client) {
    const messagesContainer = document.querySelector('.messages-container');
    if (messagesContainer) {
      const sentinel = messagesContainer.querySelector('.history-sentinel');
      const children = Array.from(messagesContainer.children);
      for (const child of children) {
        if (child !== sentinel) messagesContainer.removeChild(child);
      }
      if (sentinel && messagesContainer.firstChild !== sentinel) messagesContainer.prepend(sentinel);
    }
    let roomTitle = 'Выберите гнездо';
    if (client.currentRoom) {
      const currentRoomData = client.rooms.find((room) => room.id === client.currentRoom);
      if (currentRoomData) {
        const isPrivate = RoomManager.isPrivateRoom(client.currentRoom);
        if (isPrivate) {
          const displayName = await RoomManager.getPrivateRoomDisplayName(client.currentRoom, client.userId, client.currentServer);
          roomTitle = `👤 ${displayName || currentRoomData.name}`;
        } else {
          roomTitle = `Гнездо: ${currentRoomData.name}`;
        }
      } else {
        const isPrivate = RoomManager.isPrivateRoom(client.currentRoom);
        if (isPrivate) {
          const displayName = await RoomManager.getPrivateRoomDisplayName(client.currentRoom, client.userId, client.currentServer);
          roomTitle = `👤 ${displayName || client.currentRoom}`;
        } else {
          roomTitle = `Гнездо: ${client.currentRoom}`;
        }
      }
    }
    UIManager.updateRoomTitle(roomTitle);
    if (client.isConnected) {
      if (client.isMicPaused) UIManager.updateMicButton('paused');
      else if (client.isMicActive) UIManager.updateMicButton('active');
      else UIManager.updateMicButton('connected');
    } else {
      UIManager.updateMicButton('disconnected');
    }
    UIManager.updateRoomTitleBadge(client);
    UIManager.updateTotalBadge();
  }

  static updateRoomTitle(title) {
    const titleElement = document.querySelector('.current-room-title');
    if (titleElement) titleElement.textContent = title;
  }

  static updateRoomTitleBadge(client) {
    const titleElement = document.querySelector('.current-room-title');
    if (!titleElement) return;
    const existingBadge = titleElement.querySelector('.room-unread-badge');
    if (existingBadge) existingBadge.remove();
    if (!client || !client.currentRoom) return;
    let roomUnreadData = null;
    for (const serverId in UIManager.unreadCounts) {
      if (UIManager.unreadCounts[serverId].rooms?.[client.currentRoom]) {
        roomUnreadData = UIManager.unreadCounts[serverId].rooms[client.currentRoom];
        break;
      }
    }
    if (roomUnreadData && roomUnreadData.count > 0) {
      const badge = document.createElement('span');
      badge.className = 'room-unread-badge';
      badge.textContent = roomUnreadData.personalCount > 0 ? `${roomUnreadData.count}@${roomUnreadData.personalCount}` : roomUnreadData.count;
      titleElement.appendChild(badge);
    }
  }

  static clearMessages() {
    const container = document.querySelector('.messages-container');
    if (!container) return;
    const sentinel = container.querySelector('.history-sentinel');
    const children = Array.from(container.children);
    for (const child of children) {
      if (child !== sentinel) container.removeChild(child);
    }
    if (sentinel && container.firstChild !== sentinel) container.prepend(sentinel);
  }

  static setUnreadCount(serverId, roomId, count, hasMention, personalCount = 0) {
    if (!serverId) serverId = roomId;
    let normalizedServerId = serverId;
    if (serverId.startsWith('user_') || serverId.startsWith('direct_')) normalizedServerId = roomId || serverId;
    if (!UIManager.unreadCounts[normalizedServerId]) {
      UIManager.unreadCounts[normalizedServerId] = { total: 0, personalTotal: 0, hasMentionTotal: false, rooms: {} };
    }
    UIManager.unreadCounts[normalizedServerId].rooms[roomId] = { count, hasMention, personalCount };
    UIManager.unreadCounts[normalizedServerId].total = 0;
    UIManager.unreadCounts[normalizedServerId].personalTotal = 0;
    UIManager.unreadCounts[normalizedServerId].hasMentionTotal = false;
    for (const rid in UIManager.unreadCounts[normalizedServerId].rooms) {
      const data = UIManager.unreadCounts[normalizedServerId].rooms[rid];
      UIManager.unreadCounts[normalizedServerId].total += data.count || 0;
      UIManager.unreadCounts[normalizedServerId].personalTotal += data.personalCount || 0;
      if (data.hasMention) UIManager.unreadCounts[normalizedServerId].hasMentionTotal = true;
    }
    UIManager.updateServerBadges();
    UIManager.updateRoomBadges();
    UIManager.updateTotalBadge();
    UIManager.updateRoomTitleBadge(UIManager.client);
  }

  static updateServerBadges() {
    const serversList = document.querySelector('.servers-list');
    if (!serversList) return;
    const serverItems = serversList.querySelectorAll('.server-item');
    serverItems.forEach((item) => {
      const serverId = item.dataset.server;
      const existingBadge = item.querySelector('.unread-badge');
      if (existingBadge) existingBadge.remove();
      let serverData = UIManager.unreadCounts[serverId];
      if (!serverData && serverId && serverId.startsWith('user_')) {
        for (const sid in UIManager.unreadCounts) {
          if (sid === serverId) { serverData = UIManager.unreadCounts[sid]; break; }
        }
      }
      if (!serverData && UIManager.unreadCounts['null']) {
        const nullData = UIManager.unreadCounts['null'];
        if (nullData.rooms && nullData.rooms[serverId]) {
          serverData = { total: nullData.rooms[serverId].count || 0, personalTotal: nullData.rooms[serverId].personalCount || 0, hasMentionTotal: nullData.rooms[serverId].hasMention || false };
        }
      }
      if (serverData && serverData.total > 0) {
        const badge = document.createElement('span');
        badge.className = 'unread-badge' + (serverData.hasMentionTotal ? ' has-mention' : '');
        badge.textContent = serverData.personalTotal > 0 ? `${serverData.total}@${serverData.personalTotal}` : serverData.total;
        item.appendChild(badge);
      }
    });
  }

  static updateRoomBadges() {
    const roomsList = document.querySelector('.rooms-list');
    if (!roomsList) return;
    const roomItems = roomsList.querySelectorAll('.room-item');
    roomItems.forEach((item) => {
      const roomId = item.dataset.room;
      const existingBadge = item.querySelector('.room-unread-badge');
      if (existingBadge) existingBadge.remove();
      for (const serverId in UIManager.unreadCounts) {
        const roomData = UIManager.unreadCounts[serverId].rooms?.[roomId];
        if (roomData && roomData.count > 0) {
          const badge = document.createElement('span');
          badge.className = 'room-unread-badge' + (roomData.hasMention ? ' has-mention' : '');
          badge.textContent = roomData.personalCount > 0 ? `${roomData.count}@${roomData.personalCount}` : roomData.count;
          item.appendChild(badge);
          break;
        }
      }
    });
  }

  static updateTotalBadge() {
    let totalCount = 0;
    let totalPersonalCount = 0;
    let totalHasMention = false;
    for (const serverId in UIManager.unreadCounts) {
      totalCount += UIManager.unreadCounts[serverId].total || 0;
      totalPersonalCount += UIManager.unreadCounts[serverId].personalTotal || 0;
      if (UIManager.unreadCounts[serverId].hasMentionTotal) totalHasMention = true;
    }
    const currentRoomTitle = document.querySelector('.current-room-title');
    if (currentRoomTitle) {
      let existingTitleBadge = currentRoomTitle.querySelector('.title-unread-badge');
      if (existingTitleBadge) existingTitleBadge.remove();
      if (totalCount > 0) {
        const badge = document.createElement('span');
        badge.className = 'title-unread-badge';
        badge.textContent = totalCount > 99 ? '99+' : totalCount;
        currentRoomTitle.appendChild(badge);
      }
    }
  }

  static clearUnreadForServer(serverId) {
    if (UIManager.unreadCounts[serverId]) {
      delete UIManager.unreadCounts[serverId];
      UIManager.updateServerBadges();
      UIManager.updateRoomBadges();
      UIManager.updateTotalBadge();
    }
  }

  static clearUnreadForRoom(serverId, roomId) {
    if (!serverId) serverId = roomId;
    let normalizedServerId = serverId;
    if (serverId.startsWith('user_') || serverId.startsWith('direct_')) normalizedServerId = roomId || serverId;
    if (UIManager.unreadCounts[normalizedServerId]?.rooms?.[roomId]) {
      delete UIManager.unreadCounts[normalizedServerId].rooms[roomId];
      UIManager.unreadCounts[normalizedServerId].total = 0;
      UIManager.unreadCounts[normalizedServerId].personalTotal = 0;
      UIManager.unreadCounts[normalizedServerId].hasMentionTotal = false;
      for (const rid in UIManager.unreadCounts[normalizedServerId].rooms) {
        const data = UIManager.unreadCounts[normalizedServerId].rooms[rid];
        UIManager.unreadCounts[normalizedServerId].total += data.count || 0;
        UIManager.unreadCounts[normalizedServerId].personalTotal += data.personalCount || 0;
        if (data.hasMention) UIManager.unreadCounts[normalizedServerId].hasMentionTotal = true;
      }
      if (UIManager.unreadCounts[normalizedServerId].total === 0) {
        delete UIManager.unreadCounts[normalizedServerId];
      }
      UIManager.updateServerBadges();
      UIManager.updateRoomBadges();
      UIManager.updateTotalBadge();
      UIManager.updateRoomTitleBadge(UIManager.client);
    }
  }

  static clearAllUnread() {
    UIManager.unreadCounts = {};
    UIManager.updateServerBadges();
    UIManager.updateRoomBadges();
    UIManager.updateTotalBadge();
  }

  static getSyncStatus() {
    return { version: UIManager.unreadVersion, lastSync: UIManager.unreadLastSync, localTotal: UIManager.getLocalUnreadTotal() };
  }

  static getLocalUnreadTotal() {
    let total = 0;
    for (const serverId in UIManager.unreadCounts) total += UIManager.unreadCounts[serverId].total || 0;
    return total;
  }

  static getSecondaryChatDirection() {
    const frame = document.querySelector('.primary-frame') || document.querySelector('.chat-area');
    if (frame) {
      const rect = frame.getBoundingClientRect();
      return rect.width > rect.height ? 'side' : 'top';
    }
    return 'side';
  }

  static showLiveNotification(client, payload) {
    this.hideLiveNotification();
    const banner = document.createElement('div');
    banner.id = 'live-notification-banner';
    banner.style.cssText = 'position: sticky; top: 0; background: #2d2d44; border-bottom: 1px solid #404060; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; z-index: 1000; font-size: 13px; color: #e0e0e0;';
    const time = payload.timestamp ? new Date(payload.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
    banner.innerHTML = `
      <div style="overflow: hidden; white-space: nowrap; text-overflow: ellipsis; flex: 1; margin-right: 10px;">
        <strong style="color: #5865f2;">${this.escapeHtml(payload.username)}</strong> <span style="opacity: 0.7;">(${this.escapeHtml(payload.roomName)})</span>: ${this.escapeHtml(payload.text)}
        <span style="opacity: 0.5; margin-left: 5px; font-size: 11px;">${time}</span>
      </div>
      <button id="notif-close" style="background: none; border: none; color: #e0e0e0; cursor: pointer; font-size: 16px; padding: 0 8px;">✕</button>
    `;
    const chatArea = document.querySelector('.primary-frame') || document.querySelector('.chat-area');
    if (chatArea) chatArea.prepend(banner);
    this.notificationTimer = setTimeout(() => this.hideLiveNotification(), 10000);
    banner.querySelector('#notif-close').addEventListener('click', (e) => { e.stopPropagation(); this.hideLiveNotification(); });
    banner.addEventListener('click', () => { this.hideLiveNotification(); if (client) client.openSecondaryFromNotification(payload.roomId); });
  }

  static hideLiveNotification() {
    clearTimeout(this.notificationTimer);
    this.notificationTimer = null;
    const banner = document.getElementById('live-notification-banner');
    if (banner) banner.remove();
  }

  static async toggleSecondaryChat(client, direction = 'side') {
    this.secondaryChat.direction = direction;
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;
    this.secondaryChat.enabled = !this.secondaryChat.enabled;
    if (!client.secondaryChat) {
      client.secondaryChat = { enabled: false, roomId: null, isLoading: false, hasMore: true, oldestMessageId: null };
    }
    client.secondaryChat.enabled = this.secondaryChat.enabled;
    if (this.secondaryChat.enabled) {
      const chatArea = mainContent.querySelector('.chat-area');
      if (!chatArea) return;
      const splitContainer = document.createElement('div');
      splitContainer.className = `chat-split-container split-${direction}`;
      splitContainer.id = 'chat-split-container';
      const primaryFrame = document.createElement('div');
      primaryFrame.className = 'primary-frame';
      Array.from(chatArea.children).forEach((child) => primaryFrame.appendChild(child));
      const secondaryFrame = document.createElement('div');
      secondaryFrame.className = 'secondary-frame';
      secondaryFrame.innerHTML = `
        <div class="secondary-chat-header">
          <select class="secondary-room-selector"><option value="">📋 Выберите гнездо...</option></select>
          <button class="secondary-close-btn" title="Закрыть">✕</button>
        </div>
        <div class="secondary-room-list"><div class="no-results">Загрузка гнёзд...</div></div>
        <div class="secondary-messages-container" style="display: none;"></div>
        <div class="secondary-input-area" style="display: none;">
          <textarea class="message-input" placeholder="Написать сообщение..." rows="1"></textarea>
          <button class="send-btn">➤</button>
        </div>
      `;
      splitContainer.appendChild(primaryFrame);
      splitContainer.appendChild(secondaryFrame);
      chatArea.appendChild(splitContainer);
      this.secondaryChat.container = secondaryFrame;
      this.secondaryChat.messagesContainer = secondaryFrame.querySelector('.secondary-messages-container');
      this.secondaryChat.inputEl = secondaryFrame.querySelector('.secondary-input-area .message-input');
      this.secondaryChat.roomSelector = secondaryFrame.querySelector('.secondary-room-selector');
      this.secondaryChat.roomList = secondaryFrame.querySelector('.secondary-room-list');
      this._initSecondaryChatEvents(client);
      await this._loadSecondaryRoomOptions(client);
      const splitBtn = document.querySelector('.split-toggle-btn');
      if (splitBtn) splitBtn.classList.add('active');
    } else {
      if (client.secondaryChat.roomId) client.secondaryChat.roomId = null;
      const splitContainer = document.getElementById('chat-split-container');
      if (splitContainer) {
        const primaryFrame = splitContainer.querySelector('.primary-frame');
        const parent = splitContainer.parentNode;
        if (primaryFrame) {
          const children = Array.from(primaryFrame.children);
          children.forEach((child) => parent.insertBefore(child, splitContainer));
        }
        splitContainer.remove();
      }
      this.secondaryChat = { enabled: false, direction: 'side', roomId: null, container: null, messagesContainer: null, inputEl: null, roomSelector: null, roomList: null, isLoading: false, hasMore: true, oldestMessageId: null };
      client.secondaryChat.enabled = false;
      client.secondaryChat.roomId = null;
      client.secondaryChat.isLoading = false;
      const splitBtn = document.querySelector('.split-toggle-btn');
      if (splitBtn) splitBtn.classList.remove('active');
    }
  }

  static async openSecondaryChatDirect(client, roomId) {
    if (!client || !roomId) return;
    if (this.secondaryChat.enabled && this.secondaryChat.roomId === roomId) return;
    if (!this.secondaryChat.enabled) await client.toggleSecondaryChat('side');
    setTimeout(async () => { if (this.secondaryChat.enabled) await this._joinSecondaryRoom(client, roomId); }, 200);
  }

  static _initSecondaryChatEvents(client) {
    const { container, roomSelector, roomList, inputEl } = this.secondaryChat;
    if (!container) return;
    const closeBtn = container.querySelector('.secondary-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => { if (client?.toggleSecondaryChat) client.toggleSecondaryChat(); });
    if (roomSelector) {
      roomSelector.addEventListener('change', async (e) => {
        const roomId = e.target.value;
        if (roomId && !this.secondaryChat.isLoading) await this._joinSecondaryRoom(client, roomId);
      });
    }
    if (roomList) {
      roomList.addEventListener('click', async (e) => {
        const item = e.target.closest('.secondary-room-item');
        if (item && item.dataset.roomId && !this.secondaryChat.isLoading) await this._joinSecondaryRoom(client, item.dataset.roomId);
      });
    }
    if (inputEl) {
      const sendBtn = container.querySelector('.secondary-input-area .send-btn');
      const handleSend = async () => {
        if (this.secondaryChat.isLoading || !this.secondaryChat.roomId) return;
        const text = inputEl.value.trim();
        if (text && client) {
          const replyTarget = this.replyTarget ? { id: this.replyTarget.id, username: this.replyTarget.username } : null;
          await client.sendSecondaryMessage(text, this.secondaryChat.roomId, replyTarget);
          inputEl.value = '';
          inputEl.style.height = '36px';
          if (replyTarget) this.clearReplyTarget();
        }
      };
      inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } });
      inputEl.addEventListener('input', (e) => { e.target.style.height = '36px'; e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px'; });
      if (sendBtn) sendBtn.addEventListener('click', () => handleSend());
    }
  }

  static async _loadSecondaryRoomOptions(client) {
    const { roomSelector, roomList } = this.secondaryChat;
    if (!roomSelector || !roomList) return;
    roomList.innerHTML = '<div class="no-results">Загрузка...</div>';
    roomSelector.innerHTML = '<option value="">📋 Выберите гнездо...</option>';
    try {
      const servers = client.servers || [];
      let optionsHtml = '';
      let listHtml = '';
      for (const server of servers) {
        const isPrivateServer = server.type === 'private' || server.id?.startsWith('user_');
        const serverName = this.escapeHtml(isPrivateServer ? `🌳 ${server.displayName || server.name || 'Приватный'}` : `🌳 ${server.name}`);
        optionsHtml += `<optgroup label="${serverName}">`;
        listHtml += `<div class="secondary-room-group" data-server-id="${server.id}"><div class="secondary-room-group-title">${serverName}</div>`;
        if (isPrivateServer) {
          const roomId = server.id;
          optionsHtml += `<option value="${roomId}">${serverName} <span class="room-type-badge">🔒</span></option>`;
          listHtml += `<div class="secondary-room-item" data-room-id="${roomId}">${serverName} <span class="room-type-badge">🔒</span></div>`;
        } else {
          const serverRooms = client.rooms?.filter((r) => r.serverId === server.id) || [];
          for (const room of serverRooms) {
            const roomId = room.id || '';
            const roomName = this.escapeHtml(room.name || room.id || 'Гнездо');
            const isPrivateRoom = room.type === 'private' || roomId.startsWith('user_');
            const badge = isPrivateRoom ? '<span class="room-type-badge">🔒</span>' : '';
            optionsHtml += `<option value="${roomId}">${roomName}${badge}</option>`;
            listHtml += `<div class="secondary-room-item" data-room-id="${roomId}">${roomName}${badge}</div>`;
          }
        }
        optionsHtml += `</optgroup>`;
        listHtml += `</div>`;
      }
      roomSelector.innerHTML += optionsHtml;
      roomList.innerHTML = listHtml || '<div class="no-results">Нет доступных гнёзд</div>';
    } catch (error) {
      roomList.innerHTML = `<div class="error-message">Ошибка загрузки: ${error.message}</div>`;
    }
  }

  static async _joinSecondaryRoom(client, roomId) {
    if (!client) return;
    const secChat = this.secondaryChat;
    if (secChat.isLoading) return;
    secChat.roomId = roomId;
    secChat.isLoading = true;
    secChat.hasMore = true;
    secChat.oldestMessageId = null;
    client.secondaryChat.roomId = roomId;
    client.secondaryChat.isLoading = true;
    client.secondaryChat.hasMore = true;
    if (client.socket?.connected) client.socket.emit('secondary-chat-update', { roomId: roomId });
    const { messagesContainer, roomList, roomSelector, inputEl } = secChat;
    if (roomList) roomList.style.display = 'none';
    if (messagesContainer) {
      messagesContainer.style.display = 'block';
      messagesContainer.innerHTML = '<div class="history-loader"><span>⏳ Загрузка...</span></div>';
    }
    if (inputEl) {
      inputEl.parentElement.style.display = 'flex';
      inputEl.value = '';
    }
    if (roomList) {
      roomList.querySelectorAll('.secondary-room-item').forEach((item) => {
        item.classList.toggle('active', item.dataset.roomId === roomId);
      });
    }
    if (roomSelector) roomSelector.value = roomId;
    try {
      const result = await TextChatManager.loadMessages(client, roomId, 50, null, messagesContainer);
      if (result?.messages?.length > 0) {
        secChat.oldestMessageId = result.messages[0].id;
        secChat.hasMore = result.hasMore;
      } else {
        if (messagesContainer) messagesContainer.innerHTML = '<div class="no-results">Нет сообщений</div>';
        secChat.hasMore = false;
      }
      let serverId = roomId;
      const isPrivate = roomId.startsWith('user_') && roomId.includes('_user_');
      if (!isPrivate) {
        const room = client.rooms?.find((r) => r.id === roomId);
        if (room?.serverId) serverId = room.serverId;
      }
      this.clearUnreadForRoom(serverId, roomId);
    } catch (error) {
      if (messagesContainer) messagesContainer.innerHTML = `<div class="error-message">Ошибка загрузки: ${error.message}</div>`;
    } finally {
      secChat.isLoading = false;
      client.secondaryChat.isLoading = false;
    }
  }

  static addSecondaryMessage(user, text, timestamp = null, type = 'text', imageUrl = null, messageId = null, readBy = [], userId = null, broadcast = false, thumbnailUrl = null, replyTo = null) {
    if (!this.secondaryChat.enabled || !this.secondaryChat.messagesContainer) return;
    if (messageId && this.secondaryChat.messagesContainer.querySelector(`[data-message-id="${messageId}"]`)) return;
    if (this.secondaryChat.roomId) {
      let serverId = this.secondaryChat.roomId;
      const isPrivate = this.secondaryChat.roomId.startsWith('user_') && this.secondaryChat.roomId.includes('_user_');
      if (!isPrivate && this.client) {
        const room = this.client.rooms?.find((r) => r.id === this.secondaryChat.roomId);
        if (room?.serverId) serverId = room.serverId;
      }
      this.clearUnreadForRoom(serverId, this.secondaryChat.roomId);
    }
    this.addMessage(user, text, timestamp, type, imageUrl, messageId, readBy, userId, broadcast, thumbnailUrl, this.secondaryChat.messagesContainer, replyTo);
  }
}

export default UIManager;
