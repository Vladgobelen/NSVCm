import { formatTime, formatDateTime, formatShortDateTime } from "../dist/shared/formatTime.js";
import { escapeHtml } from "../dist/shared/escapeHtml.js";
import MessageRenderer from './MessageRenderer.js';
import UIManager from './UIManager.js';

class NoteRenderer {
  static client = null;

  static setClient(client) {
    this.client = client;
  }

  static formatText(text) {
    if (MessageRenderer?.escapeHtmlAndFormat) {
      return MessageRenderer.escapeHtmlAndFormat(text);
    }
    return escapeHtml(text).replace(/\n/g, '<br>');
  }

  static createNoteCard(note, type, targetId, callbacks) {
    const el = document.createElement('div');
    el.className = 'note-card';
    el.dataset.noteId = note.id;
    el.dataset.type = type;
    el.dataset.targetId = targetId || '';

    const isOwn = String(this.client?.userId) === String(note.authorId);

    const createdAt = formatShortDateTime(note.createdAt);
    const isEdited = note.updatedAt && note.updatedAt !== note.createdAt;
    const editedAt = isEdited ? formatDateTime(note.updatedAt) : '';

    let authorName = note.authorName || note.username;
    if (!authorName && note.authorId) {
      authorName = UIManager.usernameCache?.get(note.authorId);
    }
    if (!authorName) {
      authorName = 'Пользователь';
      if (note.authorId) UIManager.fetchUsername(note.authorId);
    }

    let contextInfo = '';
    if (type === 'room' && targetId) {
      let roomName = targetId;
      if (this.client?.rooms && Array.isArray(this.client.rooms)) {
        const room = this.client.rooms.find(r => r.id === targetId);
        if (room) roomName = room.name || targetId;
      }
      contextInfo = `<span class="note-context room" title="Публичная заметка в гнезде ${escapeHtml(roomName)}">📢 ${escapeHtml(roomName)}</span>`;
    } else if (type === 'personal' && targetId && String(targetId) !== String(this.client?.userId)) {
      let userName = targetId;
      if (this.client?.users) {
        if (typeof this.client.users.get === 'function') {
          const user = this.client.users.get(targetId);
          if (user) userName = user.username || targetId;
        } else if (this.client.users[targetId]) {
          userName = this.client.users[targetId].username || targetId;
        }
      }
      const cachedName = UIManager.usernameCache?.get(targetId);
      if (cachedName) userName = cachedName;
      else if (targetId) UIManager.fetchUsername(targetId);
      contextInfo = `<span class="note-context personal" title="Заметка пользователя ${escapeHtml(userName)}">👤 ${escapeHtml(userName)}</span>`;
    } else if (type === 'personal') {
      contextInfo = `<span class="note-context personal" title="Личная заметка">📌 Личное</span>`;
    }

    const replyBtn = type === 'room' ? '<button class="note-reply-btn" title="Ответить в треде">💬</button>' : '';
    const editBtn = isOwn ? '<button class="note-edit-btn" title="Редактировать">✏️</button>' : '';
    const deleteBtn = isOwn ? '<button class="note-delete-btn" title="Удалить">🗑️</button>' : '';

    el.innerHTML = `
      <div class="note-card-header">
        <div class="note-header-left">
          <span class="note-author" data-user-id="${note.authorId || ''}">${escapeHtml(authorName)}</span>
          ${contextInfo}
          <span class="note-date">${createdAt}${isEdited ? ` <span class="note-edited">(ред. ${editedAt})</span>` : ''}</span>
        </div>
        <div class="note-actions">${replyBtn}${editBtn}${deleteBtn}</div>
      </div>
      <div class="note-content">${this.formatText(note.content)}</div>
      <div class="note-reactions"></div>
    `;

    this.renderReactionsBlock(
      el.querySelector('.note-reactions'),
      note.reactions || {},
      note.id,
      type,
      targetId,
      callbacks?.onReact
    );

    const replyEl = el.querySelector('.note-reply-btn');
    if (replyEl && callbacks?.onReply) {
      replyEl.addEventListener('click', (e) => {
        e.stopPropagation();
        callbacks.onReply(note.id);
      });
    }

    const editEl = el.querySelector('.note-edit-btn');
    if (editEl && callbacks?.onEdit) {
      editEl.addEventListener('click', (e) => {
        e.stopPropagation();
        callbacks.onEdit(note.id, el);
      });
    }

    const deleteEl = el.querySelector('.note-delete-btn');
    if (deleteEl && callbacks?.onDelete) {
      deleteEl.addEventListener('click', (e) => {
        e.stopPropagation();
        callbacks.onDelete(note.id);
      });
    }

    return el;
  }

  static createSidebarItem(note, type, onNavigate) {
    const el = document.createElement('div');
    el.className = 'note-sidebar-item';
    el.dataset.noteId = note.id;
    el.dataset.type = type;

    const preview = note.content.length > 40 ? note.content.substring(0, 40) + '...' : note.content;
    const date = formatTime(note.createdAt);
    let authorName = note.authorName || note.username;
    if (!authorName && note.authorId) {
      authorName = UIManager.usernameCache?.get(note.authorId);
    }
    if (!authorName) {
      authorName = 'Автор';
      if (note.authorId) UIManager.fetchUsername(note.authorId);
    }

    el.innerHTML = `
      <div class="note-sidebar-header">
        <span class="note-sidebar-author" data-user-id="${note.authorId || ''}">${escapeHtml(authorName)}</span>
        <span class="note-sidebar-date">${date}</span>
      </div>
      <div class="note-sidebar-preview">${escapeHtml(preview)}</div>
      <div class="note-sidebar-reactions"></div>
    `;

    this.renderReactionsBlock(
      el.querySelector('.note-sidebar-reactions'),
      note.reactions || {},
      note.id,
      type,
      null,
      null
    );

    if (onNavigate) {
      el.addEventListener('click', () => onNavigate(note.id));
    }
    return el;
  }

  static createThreadMessage(message, callbacks) {
    const el = document.createElement('div');
    el.className = 'thread-message';
    el.dataset.msgId = message.id;
    el.dataset.noteId = message.noteId;
    
    const isOwn = String(this.client?.userId) === String(message.userId);
    const time = formatTime(message.timestamp);
    let authorName = message.username;
    if (!authorName && message.userId) {
      authorName = UIManager.usernameCache?.get(message.userId);
    }
    if (!authorName) {
      authorName = 'Пользователь';
      if (message.userId) UIManager.fetchUsername(message.userId);
    }

    el.innerHTML = `
      <div class="thread-msg-header">
        <span class="thread-author" data-user-id="${message.userId || ''}">${escapeHtml(authorName)}</span>
        <span class="thread-time">${time}</span>
      </div>
      <div class="thread-msg-content">${this.formatText(message.text)}</div>
      <div class="thread-msg-reactions"></div>
    `;

    this.renderReactionsBlock(
      el.querySelector('.thread-msg-reactions'),
      message.reactions || {},
      message.noteId,
      'thread',
      null,
      callbacks?.onThreadReact
    );
    return el;
  }

  static renderReactionsBlock(container, reactions, noteId, type, targetId, onReact) {
    if (!container || !reactions) return;
    const allowed = ['🤣', '🫡', '🤬', '💩', '😈', '👌', '✍️', '🤝', '👍', '👎', '💋', '😳', '🤩', '🤔', '🥲', '😅', '😢', '🔥', '🤦', '🦄', '🚀', '😎', '🎉', '❤️'];
    container.innerHTML = '';
    
    const allUserIds = new Set();
    for (const emoji of allowed) {
        const users = reactions[emoji];
        if (users && users.length > 0) {
            users.forEach(uid => {
                allUserIds.add(uid);
                if (!UIManager.usernameCache?.has(uid)) {
                    UIManager.fetchUsername(uid);
                }
            });
        }
    }

    for (const emoji of allowed) {
      const users = reactions[emoji];
      if (!users || users.length === 0) continue;
      const pill = document.createElement('span');
      pill.className = 'reaction-pill';
      pill.dataset.emoji = emoji;
      
      const reacted = this.client?.userId && users.includes(this.client.userId);
      pill.style.background = reacted ? 'rgba(88,101,242,0.25)' : 'rgba(64,64,96,0.5)';
      pill.style.border = reacted ? '1px solid #5865f2' : '1px solid transparent';
      
      const names = users.map(uid => UIManager.usernameCache?.get(uid) || uid.substring(0, 8)).join(', ');
      pill.title = names;

      pill.innerHTML = `<span class="emoji">${emoji}</span><span class="count">${users.length}</span>`;
      if (onReact) {
        pill.addEventListener('click', (e) => {
          e.stopPropagation();
          onReact(noteId, emoji, type, targetId);
        });
      }
      container.appendChild(pill);
    }
  }

  static enableInlineEditor(cardElement, note, type, targetId, onSave, onCancel) {
    const contentEl = cardElement.querySelector('.note-content');
    if (!contentEl || contentEl.querySelector('.note-editor')) return;
    const originalHtml = contentEl.innerHTML;
    contentEl.innerHTML = '';
    const editor = document.createElement('div');
    editor.className = 'note-editor';
    editor.innerHTML = `
      <textarea class="note-editor-textarea" rows="3">${escapeHtml(note.content)}</textarea>
      <div class="note-editor-controls">
        <button class="note-save" title="Сохранить">💾</button>
        <button class="note-cancel" title="Отмена">❌</button>
      </div>
    `;
    contentEl.appendChild(editor);
    const textarea = editor.querySelector('.note-editor-textarea');
    textarea.focus();
    const commit = (save) => {
      if (save) {
        const newText = textarea.value.trim();
        if (newText && newText !== note.content) {
          onSave(note.id, newText);
        } else {
          this.restoreCardContent(contentEl, originalHtml);
        }
      } else {
        this.restoreCardContent(contentEl, originalHtml);
        if (onCancel) onCancel();
      }
    };
    editor.querySelector('.note-save').addEventListener('click', () => commit(true));
    editor.querySelector('.note-cancel').addEventListener('click', () => commit(false));
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commit(true);
      }
      if (e.key === 'Escape') commit(false);
    });
  }

  static restoreCardContent(container, html) {
    container.innerHTML = html;
  }
}

export default NoteRenderer;
