import UserCacheManager from './UserCacheManager.js';

interface UploadResult {
    avatarUrl: string;
    thumbnailUrl: string;
}

class AvatarManager {
    private static client: any = null;
    private static uploadPromises: Map<string, Promise<string>> = new Map();

    static init(client: any): void {
        this.client = client;
    }

    static getUrl(userId: string): string | null {
        return UserCacheManager.getThumbnailUrl(userId) || UserCacheManager.getAvatarUrl(userId);
    }

    static getFullUrl(userId: string): string | null {
        return UserCacheManager.getAvatarUrl(userId);
    }

    static async upload(file: File, userId: string): Promise<string> {
        if (!this.client?.token) throw new Error('Не авторизован');
        if (this.uploadPromises.has(userId)) return this.uploadPromises.get(userId)!;

        const formData = new FormData();
        formData.append('avatar', file);

        const promise = fetch(`${this.client.API_SERVER_URL}/api/users/avatar/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.client.token}` },
            body: formData
        })
        .then(async (response) => {
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Ошибка загрузки аватара');
            }
            const data: UploadResult = await response.json();
            
            if (data.thumbnailUrl) {
                UserCacheManager.setThumbnailUrl(userId, data.thumbnailUrl);
            }
            if (data.avatarUrl) {
                UserCacheManager.setAvatarUrl(userId, data.avatarUrl);
            }
            
            this.updateUIAfterFetch([userId]);
            
            return data.thumbnailUrl || data.avatarUrl;
        })
        .catch((error: Error) => {
            console.error('❌ [AvatarManager] Upload error:', error.message);
            throw error;
        })
        .finally(() => {
            this.uploadPromises.delete(userId);
        });

        this.uploadPromises.set(userId, promise);
        return promise;
    }

    static async fetchUser(userId: string): Promise<boolean> {
        if (!this.client?.token) return false;
        const hasAvatar = UserCacheManager.getAvatarUrl(userId);
        if (hasAvatar) return true;

        const user = await UserCacheManager.fetchUser(userId, this.client.API_SERVER_URL, this.client.token);
        return !!user?.avatarUrl;
    }

    static async fetchUsers(userIds: string[]): Promise<boolean> {
        if (!Array.isArray(userIds) || userIds.length === 0) return false;
        if (!this.client?.token) return false;

        const missing = userIds.filter(id => id && !UserCacheManager.getAvatarUrl(id));
        if (missing.length === 0) return false;

        await UserCacheManager.fetchAvatars(missing, this.client.API_SERVER_URL, this.client.token);
        this.updateUIAfterFetch(missing);
        return true;
    }

    private static updateUIAfterFetch(userIds: string[]): void {
        import('../../modules/MemberListRenderer.js').then(module => {
            module.default.updateAllAvatars();
        }).catch(() => {});

        import('../../modules/MobileOnlineBar.js').then(module => {
            module.default.updateAllAvatars();
        }).catch(() => {});

        import('../../modules/MessageRenderer.js').then(module => {
            userIds.forEach(userId => {
                module.default._updateMessageAvatarsForUser(userId);
            });
        }).catch(() => {});
    }
}

export default AvatarManager;
