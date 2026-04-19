class AvatarManager {
    static _cache = new Map();
    static _client = null;
    static _uploadPromises = new Map();

    static init(client) {
        this._client = client;
    }

    static getUrl(userId) {
        return this._cache.get(userId) || null;
    }

    static setUrl(userId, url) {
        if (userId && url) {
            this._cache.set(userId, url);
        }
    }

    static async upload(file, userId) {
        if (!this._client?.token) throw new Error('Не авторизован');
        if (this._uploadPromises.has(userId)) return this._uploadPromises.get(userId);
        const formData = new FormData();
        formData.append('avatar', file);
        const promise = fetch(`${this._client.API_SERVER_URL}/api/users/avatar/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this._client.token}` },
            body: formData
        }).then(async (response) => {
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Ошибка загрузки аватара');
            }
            const data = await response.json();
            const avatarUrl = data.avatarUrl || data.url;
            this._cache.set(userId, avatarUrl);
            return avatarUrl;
        }).catch((error) => {
            console.error('❌ [AvatarManager] Critical upload error:', error.message);
            throw error;
        }).finally(() => {
            this._uploadPromises.delete(userId);
        });
        this._uploadPromises.set(userId, promise);
        return promise;
    }

    static async fetchUser(userId) {
        if (!this._client?.token || this._cache.has(userId)) return !!this._cache.get(userId);
        try {
            const response = await fetch(`${this._client.API_SERVER_URL}/api/users/${userId}`, {
                headers: { 'Authorization': `Bearer ${this._client.token}` }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.avatarUrl) {
                    this._cache.set(userId, data.avatarUrl);
                    return true;
                }
            }
        } catch (error) {
            console.error('❌ [AvatarManager] Critical fetch error:', error.message);
        }
        return false;
    }

    static async fetchUsers(userIds) {
        if (!Array.isArray(userIds) || userIds.length === 0) return false;
        // Фильтруем только тех, кого нет в кэше и кто валиден
        const missing = userIds.filter(id => id && !this._cache.has(id));
        if (missing.length === 0) return false;
        
        let updated = false;
        try {
            const response = await fetch(`${this._client.API_SERVER_URL}/api/users/batch?userIds=${encodeURIComponent(missing.join(','))}`, {
                headers: { 'Authorization': `Bearer ${this._client.token}` }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.users) {
                    for (const [uid, uData] of Object.entries(data.users)) {
                        if (uData.avatarUrl) {
                            this._cache.set(uid, uData.avatarUrl);
                            updated = true;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('❌ [AvatarManager] Critical batch fetch error:', error.message);
            // Фоллбэк: пробуем загрузить по одному
            for (const uid of missing) {
                if (await this.fetchUser(uid)) updated = true;
            }
        }
        return updated;
    }
}

export default AvatarManager;
