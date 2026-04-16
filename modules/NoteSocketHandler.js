// modules/NoteSocketHandler.js
'use strict';

class NoteSocketHandler {
    constructor(client, userId, io) {
        this.client = client;
        this.userId = userId;
        this.io = io;
        this.socket = null;
    }

    registerHandlers(socket) {
        this.socket = socket;

        socket.on('note:created', this.handleNoteCreated.bind(this));
        socket.on('note:updated', this.handleNoteUpdated.bind(this));
        socket.on('note:deleted', this.handleNoteDeleted.bind(this));
        socket.on('note:reaction', this.handleNoteReaction.bind(this));
        socket.on('note:thread:message', this.handleThreadMessage.bind(this));
    }

    handleNoteCreated(data) {
        const { note, type, targetId } = data;
        if (!note || !type) return;

        // Обновляем кэш и рендерим, если это наша комната/пользователь
        if (this._isRelevantContext(type, targetId)) {
            const cached = this.client.noteStateManager?.getCachedNotes(type, targetId) || [];
            this.client.noteStateManager?.cacheNotes(type, targetId, [note, ...cached], true, note.id);
            this.client.noteUIManager?.renderMainList([note, ...cached]);
            this.client.noteUIManager?.renderSidebarList([note, ...cached]);
        }
    }

    handleNoteUpdated(data) {
        const { noteId, content, type, targetId } = data;
        if (!noteId || !content) return;

        if (this._isRelevantContext(type, targetId)) {
            const cached = this.client.noteStateManager?.getCachedNotes(type, targetId);
            if (cached) {
                const idx = cached.findIndex(n => n.id === noteId);
                if (idx !== -1) {
                    cached[idx] = { ...cached[idx], content, updatedAt: new Date().toISOString() };
                    this.client.noteStateManager?.cacheNotes(type, targetId, cached, true, cached[cached.length - 1]?.id);
                    this.client.noteUIManager?.renderMainList(cached);
                }
            }
        }
    }

    handleNoteDeleted(data) {
        const { noteId, type, targetId } = data;
        if (!noteId) return;

        if (this._isRelevantContext(type, targetId)) {
            const cached = this.client.noteStateManager?.getCachedNotes(type, targetId);
            if (cached) {
                const filtered = cached.filter(n => n.id !== noteId);
                this.client.noteStateManager?.cacheNotes(type, targetId, filtered, true, filtered[filtered.length - 1]?.id);
                this.client.noteUIManager?.renderMainList(filtered);
            }
        }
    }

    handleNoteReaction(data) {
        const { noteId, emoji, userId, type, targetId, reactions } = data;
        if (!noteId || !reactions) return;

        if (this._isRelevantContext(type, targetId)) {
            // Обновляем реакции в карточке заметки
            const card = document.querySelector(`.note-card[data-note-id="${noteId}"]`);
            if (card) {
                const reactionsEl = card.querySelector('.note-reactions');
                if (reactionsEl) {
                    this.client.noteRenderer?.renderReactionsBlock(reactionsEl, reactions, noteId, type, targetId, null);
                }
            }
            // Обновляем в сайдбаре
            const sidebarItem = document.querySelector(`.note-sidebar-item[data-note-id="${noteId}"]`);
            if (sidebarItem) {
                const reactionsEl = sidebarItem.querySelector('.note-sidebar-reactions');
                if (reactionsEl) {
                    this.client.noteRenderer?.renderReactionsBlock(reactionsEl, reactions, noteId, type, null, null);
                }
            }
        }
    }

    handleThreadMessage(data) {
        const { noteId, message, roomId } = data;
        if (!noteId || !message) return;

        // Если открыт тред этой заметки — добавляем сообщение
        const context = this.client.noteStateManager?.context;
        if (context?.noteId === noteId && context?.targetId === roomId) {
            const threadContainer = document.querySelector('.note-thread-messages');
            if (threadContainer) {
                const msgEl = this.client.noteRenderer?.createThreadMessage(message, {});
                if (msgEl) {
                    threadContainer.appendChild(msgEl);
                    threadContainer.scrollTop = threadContainer.scrollHeight;
                }
            }
        }
    }

    _isRelevantContext(type, targetId) {
        const state = this.client.noteStateManager?.getState();
        if (!state) return false;
        return state.viewMode !== 'chat' &&
               state.context.type === type &&
               state.context.targetId === targetId;
    }
}

export default NoteSocketHandler;
