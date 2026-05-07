interface CachedUser {
    username: string;
    avatarUrl: string | null;
    thumbnailUrl: string | null;
}

class UserCacheManager {
    private static cache: Map<string, CachedUser> = new Map();
    private static pendingFetches: Map<string, Promise<CachedUser | null>> = new Map();
    private static pendingBatchFetches: Map<string, Promise<void>> = new Map();

    static has(userId: string): boolean {
        return this.cache.has(userId);
    }

    static get(userId: string): CachedUser | null {
        return this.cache.get(userId) || null;
    }

    static getUsername(userId: string): string | null {
        return this.cache.get(userId)?.username || null;
    }

    static getAvatarUrl(userId: string): string | null {
        return this.cache.get(userId)?.avatarUrl || null;
    }

    static getThumbnailUrl(userId: string): string | null {
        return this.cache.get(userId)?.thumbnailUrl || null;
    }

    static set(userId: string, data: Partial<CachedUser>): void {
        const existing = this.cache.get(userId) || { username: '', avatarUrl: null, thumbnailUrl: null };
        this.cache.set(userId, { ...existing, ...data });
    }

    static setUsername(userId: string, username: string): void {
        const existing = this.cache.get(userId) || { username: '', avatarUrl: null, thumbnailUrl: null };
        existing.username = username;
        this.cache.set(userId, existing);
    }

    static setAvatarUrl(userId: string, avatarUrl: string): void {
        const existing = this.cache.get(userId) || { username: '', avatarUrl: null, thumbnailUrl: null };
        existing.avatarUrl = avatarUrl;
        this.cache.set(userId, existing);
    }

    static setThumbnailUrl(userId: string, thumbnailUrl: string): void {
        const existing = this.cache.get(userId) || { username: '', avatarUrl: null, thumbnailUrl: null };
        existing.thumbnailUrl = thumbnailUrl;
        this.cache.set(userId, existing);
    }

    static delete(userId: string): void {
        this.cache.delete(userId);
        this.pendingFetches.delete(userId);
    }

    static clear(): void {
        this.cache.clear();
        this.pendingFetches.clear();
        this.pendingBatchFetches.clear();
    }

    static async fetchUser(userId: string, apiServerUrl: string, token: string): Promise<CachedUser | null> {
        if (this.cache.has(userId)) {
            return this.cache.get(userId)!;
        }

        if (this.pendingFetches.has(userId)) {
            return this.pendingFetches.get(userId)!;
        }

        const promise = fetch(`${apiServerUrl}/api/users/${userId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        })
        .then(async (response) => {
            if (response.ok) {
                const data = await response.json();
                const user: CachedUser = {
                    username: data.username || 'Пользователь',
                    avatarUrl: data.avatarUrl || null,
                    thumbnailUrl: data.thumbnailUrl || null
                };
                this.cache.set(userId, user);
                return user;
            }
            throw new Error(`Failed to fetch user ${userId}`);
        })
        .catch(() => {
            const fallback: CachedUser = {
                username: 'Пользователь',
                avatarUrl: null,
                thumbnailUrl: null
            };
            this.cache.set(userId, fallback);
            return fallback;
        })
        .finally(() => {
            this.pendingFetches.delete(userId);
        });

        this.pendingFetches.set(userId, promise);
        return promise;
    }

    static async fetchUsers(userIds: string[], apiServerUrl: string, token: string): Promise<void> {
        const missing = userIds.filter(id => !this.cache.has(id));
        if (missing.length === 0) return;

        const batchSize = 5;
        for (let i = 0; i < missing.length; i += batchSize) {
            const batch = missing.slice(i, i + batchSize);
            await Promise.all(batch.map(id => this.fetchUser(id, apiServerUrl, token)));
        }
    }

    static async fetchAvatars(userIds: string[], apiServerUrl: string, token: string): Promise<void> {
        const missing = userIds.filter(id => id && !this.getAvatarUrl(id));
        if (missing.length === 0) return;

        const key = missing.sort().join(',');
        if (this.pendingBatchFetches.has(key)) {
            return this.pendingBatchFetches.get(key)!;
        }

        const promise = (async () => {
            try {
                const response = await fetch(`${apiServerUrl}/api/users/batch?userIds=${encodeURIComponent(missing.join(','))}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.users) {
                        for (const [uid, uData] of Object.entries(data.users)) {
                            const userData = uData as any;
                            const update: Partial<CachedUser> = {};
                            if (userData.username) update.username = userData.username;
                            if (userData.avatarUrl) update.avatarUrl = userData.avatarUrl;
                            if (userData.thumbnailUrl) update.thumbnailUrl = userData.thumbnailUrl;
                            this.set(uid, update);
                        }
                    }
                }
            } catch (error) {
                for (const uid of missing) {
                    await this.fetchUser(uid, apiServerUrl, token);
                }
            } finally {
                this.pendingBatchFetches.delete(key);
            }
        })();

        this.pendingBatchFetches.set(key, promise);
        return promise;
    }
}

export default UserCacheManager;
