class AuthManager {
    static STORAGE_KEY = 'voicechat_users';
    static LAST_USER_KEY = 'voicechat_lastuser';

    static getAllUsers() {
        try {
            const usersJson = localStorage.getItem(this.STORAGE_KEY);
            return usersJson ? JSON.parse(usersJson) : {};
        } catch (error) {
            console.error('[AUTH] Ошибка получения пользователей:', error);
            return {};
        }
    }

    static saveAllUsers(users) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(users));
        } catch (error) {
            console.error('[AUTH] Ошибка сохранения пользователей:', error);
        }
    }

    static loadLastUser() {
        try {
            const userJson = localStorage.getItem(this.LAST_USER_KEY);
            return userJson ? JSON.parse(userJson) : null;
        } catch (error) {
            console.error('[AUTH] Ошибка загрузки последнего пользователя:', error);
            return null;
        }
    }

    static saveLastUser(user) {
        try {
            localStorage.setItem(this.LAST_USER_KEY, JSON.stringify(user));
        } catch (error) {
            console.error('[AUTH] Ошибка сохранения последнего пользователя:', error);
        }
    }

    static removeUser(username) {
        const users = this.getAllUsers();
        delete users[username];
        this.saveAllUsers(users);
        
        const lastUser = this.loadLastUser();
        if (lastUser && lastUser.username === username) {
            localStorage.removeItem(this.LAST_USER_KEY);
        }
    }

    static async tryAutoLogin(client) {
        console.log('[AUTH] Попытка автовхода...');
        const lastUser = this.loadLastUser();
        if (!lastUser) {
            console.log('[AUTH] Нет сохраненного пользователя');
            return false;
        }

        console.log('[AUTH] Автовход: найден пользователь', lastUser.username);
        
        // Проверяем токен
        const isValid = await this.validateToken(lastUser.userId, lastUser.token);
        if (!isValid) {
            console.log('[AUTH] Токен невалиден');
            this.removeUser(lastUser.username);
            return false;
        }

        client.userId = lastUser.userId;
        client.token = lastUser.token;
        client.username = lastUser.username;
        console.log('[AUTH] Автовход успешен');
        return true;
    }

    static async validateToken(userId, token) {
        console.log('[AUTH] Проверка токена...');
        try {
            const response = await fetch(`${client.API_SERVER_URL}/api/auth/validate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ userId, token })
            });

            if (!response.ok) {
                console.log('[AUTH] Токен не прошёл проверку');
                return false;
            }

            const data = await response.json();
            return data.valid === true;
        } catch (error) {
            console.error('[AUTH] Ошибка проверки токена:', error);
            return false;
        }
    }

    static async registerUser(client, username, password) {
        console.log('[AUTH] registerUser вызван:', username);
        try {
            const response = await fetch(`${client.API_SERVER_URL}/api/auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            // Сначала получаем текст ответа для отладки
            const responseText = await response.text();
            console.log('[AUTH] Ответ сервера:', response.status, responseText);

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                console.error('[AUTH] Ошибка парсинга JSON:', e);
                throw new Error('Сервер вернул неверный формат данных');
            }

            if (!response.ok) {
                throw new Error(data.error || `Ошибка сервера: ${response.status}`);
            }

            // Сохраняем пользователя
            const users = this.getAllUsers();
            users[username] = {
                username: username,
                password: password, // Внимание: это небезопасно, лучше хранить хэш
                userId: data.userId,
                token: data.token
            };
            this.saveAllUsers(users);
            this.saveLastUser({
                username: username,
                userId: data.userId,
                token: data.token
            });

            client.userId = data.userId;
            client.token = data.token;
            client.username = username;

            console.log('[AUTH] Пользователь зарегистрирован и вошел');
            return true;
        } catch (error) {
            console.error('[AUTH] Ошибка входа:', error);
            throw error;
        }
    }
}
