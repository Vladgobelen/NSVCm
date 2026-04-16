'use strict';

class NoteAPI {
    constructor(client) {
        this.client = client;
    }

    async _fetch(endpoint, options = {}) {
        if (!this.client?.token) {
            throw new Error('Требуется авторизация');
        }

        const url = `${this.client.API_SERVER_URL}/api/notes${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.client.token}`,
            ...(options.headers || {})
        };

        const response = await fetch(url, {
            ...options,
            headers
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(data?.error || `Ошибка сервера: ${response.status}`);
        }

        return data;
    }

    async loadNotes(type = 'personal', targetId, limit = 50, beforeId = null) {
        const params = new URLSearchParams({
            type,
            limit: limit.toString()
        });

        if (type === 'room' && targetId) {
            params.set('roomId', targetId);
        } else if (type === 'personal' && targetId) {
            params.set('targetUserId', targetId);
        }

        if (beforeId) {
            params.set('beforeId', beforeId);
        }

        const data = await this._fetch(`/?${params.toString()}`);
        return {
            notes: data.notes || [],
            hasMore: data.hasMore || false
        };
    }

    async createNote(type = 'personal', content, targetId = null) {
        const body = { type, content };
        if (type === 'room' && targetId) {
            body.roomId = targetId;
        }
        return this._fetch('/', { method: 'POST', body: JSON.stringify(body) });
    }

    async updateNote(type = 'personal', noteId, content, targetId = null) {
        const body = { type, content };
        if (type === 'room' && targetId) {
            body.roomId = targetId;
        }
        return this._fetch(`/${noteId}`, { method: 'PATCH', body: JSON.stringify(body) });
    }

    async deleteNote(type = 'personal', noteId, targetId = null) {
        const params = new URLSearchParams({ type });
        if (type === 'room' && targetId) {
            params.set('roomId', targetId);
        }
        return this._fetch(`/${noteId}?${params.toString()}`, { method: 'DELETE' });
    }

    async loadThread(noteId, limit = 50, beforeId = null) {
        const params = new URLSearchParams({ limit: limit.toString() });
        if (beforeId) {
            params.set('beforeId', beforeId);
        }
        const data = await this._fetch(`/${noteId}/thread?${params.toString()}`);
        return {
            messages: data.messages || [],
            hasMore: data.hasMore || false
        };
    }

    async sendThreadMessage(noteId, roomId, text) {
        return this._fetch(`/${noteId}/thread`, {
            method: 'POST',
            body: JSON.stringify({ roomId, text })
        });
    }
}

export default NoteAPI;
