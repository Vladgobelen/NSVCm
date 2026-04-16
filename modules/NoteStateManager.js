'use strict';

class NoteStateManager {
    constructor() {
        this.viewMode = 'chat';
        this.context = { type: null, targetId: null, noteId: null };
        this.cache = { personal: new Map(), public: new Map(), threads: new Map() };
        this.scrollPositions = new Map();
        this.paginationState = new Map();
        this.loadingFlags = new Map();
    }

    getState() {
        return {
            viewMode: this.viewMode,
            context: { ...this.context }
        };
    }

    isNotesView() {
        return ['personal', 'public', 'thread'].includes(this.viewMode);
    }

    setView(mode, contextType = null, targetId = null, noteId = null) {
        this.viewMode = mode;
        this.context.type = contextType;
        this.context.targetId = targetId;
        this.context.noteId = noteId;
    }

    resetToChat() {
        this.viewMode = 'chat';
        this.context.type = null;
        this.context.targetId = null;
        this.context.noteId = null;
    }

    getContextKey() {
        if (this.viewMode === 'personal') return `personal:${this.context.targetId}`;
        if (this.viewMode === 'public') return `public:${this.context.targetId}`;
        if (this.viewMode === 'thread') return `thread:${this.context.noteId}`;
        return 'chat';
    }

    setLoading(type, targetId, isLoading) {
        const key = `${type}:${targetId}`;
        if (isLoading) this.loadingFlags.set(key, Date.now());
        else this.loadingFlags.delete(key);
    }

    isLoading(type, targetId) {
        const key = `${type}:${targetId}`;
        if (!this.loadingFlags.has(key)) return false;
        const startTime = this.loadingFlags.get(key);
        return Date.now() - startTime < 30000;
    }

    cacheNotes(type, targetId, notes, hasMore, oldestId) {
        const map = this.cache[type];
        if (!map) return;
        map.set(targetId, notes || []);
        this.paginationState.set(`${type}:${targetId}`, { hasMore: !!hasMore, oldestId });
    }

    getCachedNotes(type, targetId) {
        const map = this.cache[type];
        if (!map) return null;
        return map.get(targetId) || null;
    }

    cacheThread(noteId, messages, hasMore, oldestId) {
        this.cache.threads.set(noteId, messages || []);
        this.paginationState.set(`thread:${noteId}`, { hasMore: !!hasMore, oldestId });
    }

    getCachedThread(noteId) {
        return this.cache.threads.get(noteId) || null;
    }

    getPaginationState(type, targetId) {
        return this.paginationState.get(`${type}:${targetId}`) || { hasMore: true, oldestId: null };
    }

    saveScrollPosition(position) {
        const key = this.getContextKey();
        if (position !== null && position !== undefined) {
            this.scrollPositions.set(key, position);
        }
    }

    getScrollPosition() {
        return this.scrollPositions.get(this.getContextKey()) || 0;
    }

    clearCache(type, targetId) {
        const key = `${type}:${targetId}`;
        if (this.cache[type]) this.cache[type].delete(targetId);
        this.paginationState.delete(key);
        this.scrollPositions.delete(key);
        this.loadingFlags.delete(key);
    }

    clearAllCache() {
        this.cache.personal.clear();
        this.cache.public.clear();
        this.cache.threads.clear();
        this.paginationState.clear();
        this.scrollPositions.clear();
        this.loadingFlags.clear();
    }
}

export default new NoteStateManager();
