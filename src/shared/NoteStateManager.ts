interface NoteStateContext {
    type: string | null;
    targetId: string | null;
    noteId: string | null;
}

interface NoteStateData {
    viewMode: string;
    context: NoteStateContext;
}

interface PaginationState {
    hasMore: boolean;
    oldestId: string | null;
}

class NoteStateManager {
    viewMode: string;
    context: NoteStateContext;
    cache: {
        personal: Map<string, any[]>;
        public: Map<string, any[]>;
        threads: Map<string, any[]>;
    };
    scrollPositions: Map<string, number>;
    paginationState: Map<string, PaginationState>;
    loadingFlags: Map<string, number>;

    constructor() {
        this.viewMode = 'chat';
        this.context = { type: null, targetId: null, noteId: null };
        this.cache = { personal: new Map(), public: new Map(), threads: new Map() };
        this.scrollPositions = new Map();
        this.paginationState = new Map();
        this.loadingFlags = new Map();
    }

    getState(): NoteStateData {
        return {
            viewMode: this.viewMode,
            context: { ...this.context }
        };
    }

    isNotesView(): boolean {
        return ['personal', 'public', 'thread'].includes(this.viewMode);
    }

    setView(mode: string, contextType: string | null = null, targetId: string | null = null, noteId: string | null = null): void {
        this.viewMode = mode;
        this.context.type = contextType;
        this.context.targetId = targetId;
        this.context.noteId = noteId;
    }

    resetToChat(): void {
        this.viewMode = 'chat';
        this.context.type = null;
        this.context.targetId = null;
        this.context.noteId = null;
    }

    getContextKey(): string {
        if (this.viewMode === 'personal') return `personal:${this.context.targetId}`;
        if (this.viewMode === 'public') return `public:${this.context.targetId}`;
        if (this.viewMode === 'thread') return `thread:${this.context.noteId}`;
        return 'chat';
    }

    setLoading(type: string, targetId: string, isLoading: boolean): void {
        const key = `${type}:${targetId}`;
        if (isLoading) this.loadingFlags.set(key, Date.now());
        else this.loadingFlags.delete(key);
    }

    isLoading(type: string, targetId: string): boolean {
        const key = `${type}:${targetId}`;
        if (!this.loadingFlags.has(key)) return false;
        const startTime = this.loadingFlags.get(key)!;
        return Date.now() - startTime < 30000;
    }

    cacheNotes(type: string, targetId: string, notes: any[], hasMore: boolean, oldestId: string | null): void {
        const map = this.cache[type as keyof typeof this.cache];
        if (!map) return;
        map.set(targetId, notes || []);
        this.paginationState.set(`${type}:${targetId}`, { hasMore: !!hasMore, oldestId });
    }

    getCachedNotes(type: string, targetId: string): any[] | null {
        const map = this.cache[type as keyof typeof this.cache];
        if (!map) return null;
        return map.get(targetId) || null;
    }

    cacheThread(noteId: string, messages: any[], hasMore: boolean, oldestId: string | null): void {
        this.cache.threads.set(noteId, messages || []);
        this.paginationState.set(`thread:${noteId}`, { hasMore: !!hasMore, oldestId });
    }

    getCachedThread(noteId: string): any[] | null {
        return this.cache.threads.get(noteId) || null;
    }

    getPaginationState(type: string, targetId: string): PaginationState {
        return this.paginationState.get(`${type}:${targetId}`) || { hasMore: true, oldestId: null };
    }

    saveScrollPosition(position: number): void {
        const key = this.getContextKey();
        if (position !== null && position !== undefined) {
            this.scrollPositions.set(key, position);
        }
    }

    getScrollPosition(): number {
        return this.scrollPositions.get(this.getContextKey()) || 0;
    }

    clearCache(type: string, targetId: string): void {
        const key = `${type}:${targetId}`;
        const map = this.cache[type as keyof typeof this.cache];
        if (map) map.delete(targetId);
        this.paginationState.delete(key);
        this.scrollPositions.delete(key);
        this.loadingFlags.delete(key);
    }

    clearAllCache(): void {
        this.cache.personal.clear();
        this.cache.public.clear();
        this.cache.threads.clear();
        this.paginationState.clear();
        this.scrollPositions.clear();
        this.loadingFlags.clear();
    }
}

export default new NoteStateManager();
