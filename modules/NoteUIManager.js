// modules/NoteUIManager.js
'use strict';

import NoteStateManager from './NoteStateManager.js';
import NoteRenderer from './NoteRenderer.js';

class NoteUIManager {
    static client = null;
    static api = null;
    static loading = false;
    static currentScrollObserver = null;

    static init(client, api) {
        this.client = client;
        this.api = api;
        this._setupEventListeners();
    }

    // Безопасный метод получения имени комнаты (РАБОТАЕТ С МАССИВОМ!)
    static _getRoomName(roomId) {
        if (!roomId) return null;
        try {
            if (this.client?.rooms) {
                if (Array.isArray(this.client.rooms)) {
                    const room = this.client.rooms.find(r => r.id === roomId);
                    if (room) return room.name || roomId;
                }
            }
        } catch (e) {}
        return roomId;
    }

    static _setupEventListeners() {
        const notesBtn = document.getElementById('notesToggle');
        const dropdown = document.getElementById('notes-dropdown-menu');
        const dropdownItems = document.querySelectorAll('.notes-dropdown-item');
        const modeBtns = document.querySelectorAll('.notes-mode-btn');
        const closeNotesPanelBtn = document.querySelector('.notes-list-close-btn');
        const threadBackBtn = document.querySelector('.note-thread-back-btn');
        const threadInput = document.querySelector('.note-thread-input');
        const threadSendBtn = document.querySelector('.note-thread-send-btn');
        const newNoteBtn = document.getElementById('new-note-btn');

        if (notesBtn && dropdown) {
            const newBtn = notesBtn.cloneNode(true);
            notesBtn.parentNode.replaceChild(newBtn, notesBtn);
            
            dropdown.style.setProperty('display', 'none', 'important');
            
            newBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                
                const isVisible = dropdown.style.display === 'block';
                
                if (!isVisible) {
                    const rect = newBtn.getBoundingClientRect();
                    dropdown.style.setProperty('position', 'fixed', 'important');
                    dropdown.style.setProperty('left', `${rect.left}px`, 'important');
                    dropdown.style.setProperty('top', `${rect.bottom + 5}px`, 'important');
                    dropdown.style.setProperty('zIndex', '10000', 'important');
                    dropdown.style.setProperty('display', 'block', 'important');
                } else {
                    dropdown.style.setProperty('display', 'none', 'important');
                }
            });
        }

        if (dropdownItems.length > 0) {
            dropdownItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const type = item.dataset.type;
                    if (dropdown) dropdown.style.setProperty('display', 'none', 'important');
                    if (type === 'personal') this.switchView('personal');
                    else if (type === 'public') this.switchView('public');
                });
            });
        }

        document.addEventListener('click', (e) => {
            if (dropdown && !notesBtn?.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.setProperty('display', 'none', 'important');
            }
        });

        modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                this.switchView(mode);
            });
        });

        if (closeNotesPanelBtn) {
            closeNotesPanelBtn.addEventListener('click', () => this.returnToChat());
        }

        if (threadBackBtn) {
            threadBackBtn.addEventListener('click', () => this.returnToChat());
        }

        if (threadInput && threadSendBtn) {
            const sendThread = async () => {
                const text = threadInput.value.trim();
                const context = NoteStateManager.context;
                if (text && context.noteId && context.targetId) {
                    threadInput.value = '';
                    threadInput.style.height = '40px';
                    await this.api.sendThreadMessage(context.noteId, context.targetId, text);
                    this.loadThread(context.noteId);
                }
            };
            threadSendBtn.addEventListener('click', sendThread);
            threadInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendThread();
                }
            });
            threadInput.addEventListener('input', (e) => {
                e.target.style.height = '40px';
                e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
            });
        }

        if (newNoteBtn) {
            const newBtn = newNoteBtn.cloneNode(true);
            newNoteBtn.parentNode.replaceChild(newBtn, newNoteBtn);
            newBtn.addEventListener('click', () => this.showNewNoteEditor());
        }

        const notesContainer = document.getElementById('notes-view-container');
        if (notesContainer && !document.getElementById('new-note-btn')) {
            const btn = document.createElement('button');
            btn.id = 'new-note-btn';
            btn.className = 'new-note-btn';
            btn.textContent = '+ Новая заметка';
            btn.addEventListener('click', () => this.showNewNoteEditor());
            
            const header = notesContainer.querySelector('.notes-header');
            if (header) {
                header.after(btn);
            } else {
                notesContainer.prepend(btn);
            }
        }

        const notesListContainer = document.querySelector('.notes-list-container');
        if (notesListContainer && !document.querySelector('.notes-scroll-sentinel')) {
            const sentinel = document.createElement('div');
            sentinel.className = 'notes-scroll-sentinel';
            notesListContainer.appendChild(sentinel);
        }
    }

    static switchView(mode, targetId = null) {
        const activeTarget = targetId || (mode === 'personal' ? this.client.userId : this.client.currentRoom);
        if (!activeTarget) {
            console.warn('Нет targetId для переключения режима заметок');
            return;
        }

        NoteStateManager.setView(mode, mode, activeTarget);

        this._togglePanels(true);
        this._updateHeader(mode);
        this._clearViews();

        const type = mode === 'public' ? 'room' : 'personal';
        this.loadNotes(type, activeTarget, true);
    }

    static returnToChat() {
        NoteStateManager.resetToChat();
        this._togglePanels(false);
        this._restoreHeader();
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
    
    // ✅ Гарантируем видимость основных элементов
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

    static _updateHeader(mode) {
        const title = document.querySelector('.current-room-title');
        if (!title) return;
        
        if (mode === 'personal') {
            title.textContent = '📝 Личные заметки';
        } else if (mode === 'public') {
            const roomId = this.client.currentRoom;
            const roomName = this._getRoomName(roomId) || roomId || 'Публичные заметки';
            title.textContent = `📝 Заметки: ${roomName}`;
        }
        
        document.querySelectorAll('.notes-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
    }

    static _restoreHeader() {
        const title = document.querySelector('.current-room-title');
        if (!title) return;
        
        if (this.client.currentRoom) {
            const roomId = this.client.currentRoom;
            const roomName = this._getRoomName(roomId) || roomId;
            title.textContent = roomName;
        } else {
            title.textContent = 'Выберите гнездо';
        }
    }

    static _clearViews() {
        const notesList = document.querySelector('.notes-list');
        const notesSidebar = document.querySelector('.notes-list-content');
        const threadMessages = document.querySelector('.note-thread-messages');
        if (notesList) notesList.innerHTML = '';
        if (notesSidebar) notesSidebar.innerHTML = '';
        if (threadMessages) threadMessages.innerHTML = '';
    }

    static showNewNoteEditor() {
        const container = document.querySelector('.notes-list');
        if (!container || container.querySelector('.note-editor')) return;

        const editor = document.createElement('div');
        editor.className = 'note-editor';
        editor.innerHTML = `
            <textarea class="note-editor-textarea" placeholder="Текст заметки..." rows="3"></textarea>
            <div class="note-editor-controls">
                <button class="note-save" title="Сохранить">💾</button>
                <button class="note-cancel" title="Отмена">❌</button>
            </div>
        `;
        container.prepend(editor);
        const textarea = editor.querySelector('.note-editor-textarea');
        textarea.focus();

        const save = async () => {
            const text = textarea.value.trim();
            const { viewMode, context } = NoteStateManager.getState();
            if (text) {
                const type = viewMode === 'public' ? 'room' : 'personal';
                try {
                    await this.api.createNote(type, text, context.targetId);
                    this.loadNotes(type, context.targetId, true);
                } catch (error) {
                    console.error('Ошибка создания заметки:', error);
                }
            } else {
                editor.remove();
            }
        };

        editor.querySelector('.note-save').addEventListener('click', save);
        editor.querySelector('.note-cancel').addEventListener('click', () => editor.remove());
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { 
                e.preventDefault(); 
                save(); 
            }
            if (e.key === 'Escape') editor.remove();
        });
    }

    static async loadNotes(type, targetId, isInitial) {
        if (this.loading) return;
        this.loading = true;
        NoteStateManager.setLoading(type, targetId, true);

        const state = NoteStateManager.getPaginationState(type, targetId);
        const beforeId = isInitial ? null : state.oldestId;

        try {
            const { notes, hasMore } = await this.api.loadNotes(type, targetId, 30, beforeId);
            
            if (isInitial) {
                NoteStateManager.cacheNotes(type, targetId, notes, hasMore, notes.length > 0 ? notes[notes.length - 1].id : null);
                this.renderMainList(notes);
                this.renderSidebarList(notes);
                this._setupInfiniteScroll();
            } else {
                if (notes.length > 0) {
                    const cached = NoteStateManager.getCachedNotes(type, targetId) || [];
                    const combined = [...cached, ...notes];
                    NoteStateManager.cacheNotes(type, targetId, combined, hasMore, notes[notes.length - 1].id);
                    this.appendMainList(notes);
                }
            }

            this.showEmptyState(notes.length === 0 && isInitial);
        } catch (error) {
            console.error('Ошибка загрузки заметок:', error);
            this.showEmptyState(true);
        } finally {
            this.loading = false;
            NoteStateManager.setLoading(type, targetId, false);
        }
    }

    static renderMainList(notes) {
        const container = document.querySelector('.notes-list');
        if (!container) return;
        
        const fragment = document.createDocumentFragment();
        const { viewMode, context } = NoteStateManager.getState();
        const type = viewMode === 'public' ? 'room' : 'personal';
        const targetId = context.targetId;

        notes.forEach(note => {
            const el = NoteRenderer.createNoteCard(note, type, targetId, {
                onReply: (id) => this.openThread(id),
                onEdit: (id, el) => this.handleEdit(id, el),
                onDelete: (id) => this.handleDelete(id, type, targetId),
                onReact: (id, emoji) => this.handleReact(id, emoji, type, targetId)
            });
            fragment.appendChild(el);
        });
        
        container.innerHTML = '';
        container.appendChild(fragment);
    }

    static appendMainList(notes) {
        const container = document.querySelector('.notes-list');
        if (!container) return;
        
        const fragment = document.createDocumentFragment();
        const { viewMode, context } = NoteStateManager.getState();
        const type = viewMode === 'public' ? 'room' : 'personal';
        const targetId = context.targetId;

        notes.forEach(note => {
            const el = NoteRenderer.createNoteCard(note, type, targetId, {
                onReply: (id) => this.openThread(id),
                onEdit: (id, el) => this.handleEdit(id, el),
                onDelete: (id) => this.handleDelete(id, type, targetId),
                onReact: (id, emoji) => this.handleReact(id, emoji, type, targetId)
            });
            fragment.appendChild(el);
        });
        
        container.appendChild(fragment);
    }

    static renderSidebarList(notes) {
        const container = document.querySelector('.notes-list-content');
        if (!container) return;
        
        const fragment = document.createDocumentFragment();
        notes.forEach(note => {
            const el = NoteRenderer.createSidebarItem(note, 'sidebar', (id) => this.scrollToNote(id));
            fragment.appendChild(el);
        });
        
        container.innerHTML = '';
        container.appendChild(fragment);
    }

    static scrollToNote(noteId) {
        const el = document.querySelector(`.note-card[data-note-id="${noteId}"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('highlighted');
            setTimeout(() => el.classList.remove('highlighted'), 1500);
        }
    }

    static _setupInfiniteScroll() {
        if (this.currentScrollObserver) this.currentScrollObserver.disconnect();
        
        const container = document.querySelector('.notes-list');
        const sentinel = document.querySelector('.notes-scroll-sentinel');
        if (!container || !sentinel) return;

        this.currentScrollObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !this.loading) {
                const { viewMode, context } = NoteStateManager.getState();
                const type = viewMode === 'public' ? 'room' : 'personal';
                const state = NoteStateManager.getPaginationState(type, context.targetId);
                if (state.hasMore) {
                    this.loadNotes(type, context.targetId, false);
                }
            }
        }, { root: container, rootMargin: '200px' });

        this.currentScrollObserver.observe(sentinel);
    }

    static handleEdit(noteId, cardElement) {
        const { viewMode, context } = NoteStateManager.getState();
        const type = viewMode === 'public' ? 'room' : 'personal';
        const cached = NoteStateManager.getCachedNotes(type, context.targetId);
        const note = cached?.find(n => n.id === noteId);
        
        if (note) {
            NoteRenderer.enableInlineEditor(
                cardElement, 
                note, 
                type, 
                context.targetId, 
                async (id, text) => {
                    await this.api.updateNote(type, id, text, context.targetId);
                    this.loadNotes(type, context.targetId, true);
                },
                () => {}
            );
        }
    }

    static async handleDelete(noteId, type, targetId) {
        if (confirm('Удалить заметку?')) {
            try {
                await this.api.deleteNote(type, noteId, targetId);
                this.loadNotes(type, targetId, true);
            } catch (error) {
                console.error('Ошибка удаления заметки:', error);
            }
        }
    }

    static async handleReact(noteId, emoji, type, targetId) {
        console.log('Reaction:', noteId, emoji, type, targetId);
    }

    static openThread(noteId) {
        const { viewMode, context } = NoteStateManager.getState();
        const roomId = context.targetId;
        
        NoteStateManager.setView('thread', 'thread', roomId, noteId);
        
        const notesView = document.getElementById('notes-view-container');
        const threadView = document.getElementById('note-thread-container');
        const newNoteBtn = document.getElementById('new-note-btn');
        
        if (notesView) notesView.style.display = 'none';
        if (threadView) threadView.style.display = 'flex';
        if (newNoteBtn) newNoteBtn.style.display = 'none';
        
        this.loadThread(noteId);
    }

    static async loadThread(noteId) {
        const container = document.querySelector('.note-thread-messages');
        if (!container) return;
        
        try {
            const { messages } = await this.api.loadThread(noteId, 50);
            const fragment = document.createDocumentFragment();
            
            messages.reverse().forEach(msg => {
                fragment.appendChild(NoteRenderer.createThreadMessage(msg, {
                    onThreadReact: (nId, emoji) => console.log('Thread reaction:', nId, emoji)
                }));
            });
            
            container.innerHTML = '';
            container.appendChild(fragment);
            container.scrollTop = container.scrollHeight;
        } catch (error) {
            console.error('Ошибка загрузки треда:', error);
        }
    }

    static showEmptyState(isEmpty) {
        const emptyEl = document.querySelector('.notes-empty');
        const loadingEl = document.querySelector('.notes-loading');
        const listEl = document.querySelector('.notes-list');
        
        if (emptyEl) emptyEl.style.display = isEmpty ? 'block' : 'none';
        if (loadingEl) loadingEl.style.display = 'none';
        if (listEl && isEmpty) listEl.innerHTML = '';
    }

    static handleNoteCreated(note, type, targetId) {
        const state = NoteStateManager.getState();
        if (state.viewMode === type && state.context.targetId === targetId) {
            const cached = NoteStateManager.getCachedNotes(type, targetId) || [];
            NoteStateManager.cacheNotes(type, targetId, [note, ...cached], true, cached[cached.length - 1]?.id);
            this.renderMainList([note, ...cached]);
            this.renderSidebarList([note, ...cached]);
        }
    }

    static handleNoteUpdated(noteId, content, type, targetId) {
        const state = NoteStateManager.getState();
        if (state.viewMode === type && state.context.targetId === targetId) {
            const cached = NoteStateManager.getCachedNotes(type, targetId);
            if (cached) {
                const idx = cached.findIndex(n => n.id === noteId);
                if (idx !== -1) {
                    cached[idx] = { ...cached[idx], content, updatedAt: new Date().toISOString() };
                    NoteStateManager.cacheNotes(type, targetId, cached, true, cached[cached.length - 1]?.id);
                    this.renderMainList(cached);
                }
            }
        }
    }

    static handleNoteDeleted(noteId, type, targetId) {
        const state = NoteStateManager.getState();
        if (state.viewMode === type && state.context.targetId === targetId) {
            const cached = NoteStateManager.getCachedNotes(type, targetId);
            if (cached) {
                const filtered = cached.filter(n => n.id !== noteId);
                NoteStateManager.cacheNotes(type, targetId, filtered, true, filtered[filtered.length - 1]?.id);
                this.renderMainList(filtered);
                this.renderSidebarList(filtered);
            }
        }
    }
}

export default NoteUIManager;
