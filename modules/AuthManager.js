import InviteManager from './InviteManager.js';

class AuthManager {
  static LAST_USER_KEY = 'voicechat_lastuser';

  static loadLastUser() {
    try {
      return JSON.parse(localStorage.getItem(this.LAST_USER_KEY));
    } catch {
      return null;
    }
  }

  static saveLastUser(user) {
    localStorage.setItem(this.LAST_USER_KEY, JSON.stringify({
      username: user.username,
      userId: user.userId,
      token: user.token,
      tokenVersion: user.tokenVersion
    }));
  }

  static removeUser(username) {
    const lastUser = this.loadLastUser();
    if (lastUser && lastUser.username === username) {
      localStorage.removeItem(this.LAST_USER_KEY);
    }
  }

  static async tryAutoLogin(client) {
    const lastUser = this.loadLastUser();
    if (!lastUser) return false;

    const isValid = await this.validateToken(client, lastUser.userId, lastUser.token, lastUser.tokenVersion);
    if (!isValid) {
      this.removeUser(lastUser.username);
      return false;
    }

    client.userId = lastUser.userId;
    client.token = lastUser.token;
    client.username = lastUser.username;
    client.tokenVersion = lastUser.tokenVersion || 1;
    InviteManager.init(client);
    return true;
  }

  static async validateToken(client, userId, token, tokenVersion = 1) {
    try {
      const response = await fetch(`${client.API_SERVER_URL}/api/auth/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId, token, tokenVersion })
      });
      if (!response.ok) return false;
      const data = await response.json();
      return data.valid === true;
    } catch {
      return false;
    }
  }

  static async registerUser(client, username, password) {
    try {
      const response = await fetch(`${client.API_SERVER_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error('API вернул неверный формат данных');
      }
      if (!response.ok) {
        throw new Error(data.error || `Ошибка системы: ${response.status}`);
      }
      this.saveLastUser({
        username,
        userId: data.userId,
        token: data.token,
        tokenVersion: data.tokenVersion || 1
      });
      client.userId = data.userId;
      client.token = data.token;
      client.username = username;
      client.tokenVersion = data.tokenVersion || 1;
      InviteManager.init(client);
      return true;
    } catch (error) {
      throw error;
    }
  }

  static showAuthModal(client) {
    const lastUser = this.loadLastUser();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>Вход в систему</h2>
        ${lastUser ? `<div class="last-user-hint">Последний пользователь: ${lastUser.username}</div>` : ''}
        <input type="text" id="usernameInput" placeholder="Никнейм" value="${lastUser ? lastUser.username : ''}">
        <input type="password" id="passwordInput" placeholder="Пароль">
        <button id="authSubmitBtn">Войти</button>
        <button id="createNewUserBtn">➕ Создать нового</button>
      </div>
    `;
    document.body.appendChild(modal);

    const usernameInput = modal.querySelector('#usernameInput');
    const passwordInput = modal.querySelector('#passwordInput');
    const submitBtn = modal.querySelector('#authSubmitBtn');

    modal.querySelector('#createNewUserBtn').addEventListener('click', () => {
      usernameInput.value = '';
      passwordInput.value = '';
      usernameInput.focus();
    });

    const handleSubmit = async () => {
      const u = usernameInput.value.trim();
      const p = passwordInput.value.trim();
      if (u.length < 3 || p.length < 4) {
        alert('Ник — от 3, пароль — от 4');
        return;
      }
      try {
        const success = await this.registerUser(client, u, p);
        if (success) {
          modal.remove();
          await import('./ServerManager.js').then(module => module.default.loadServers(client));

          const inviteApplied = await InviteManager.applyPendingInvite();
          if (inviteApplied) return;

          if (client.inviteServerId) {
            const serverExists = client.servers.some(s => s.id === client.inviteServerId);
            if (serverExists) {
              client.currentServerId = client.inviteServerId;
              await import('./RoomManager.js').then(module => module.default.loadRoomsForServer(client, client.inviteServerId));
              return;
            }
          }

          if (client.currentServerId) {
            await import('./RoomManager.js').then(module => module.default.loadRoomsForServer(client, client.currentServerId));
          }

          if (client.currentRoom) {
            await client.reconnectToRoom(client.currentRoom);
          }
        }
      } catch (error) {
        alert('Ошибка: ' + error.message);
      }
    };

    submitBtn.addEventListener('click', handleSubmit);
    passwordInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') handleSubmit();
    });

    InviteManager.init(client);
  }
}

export default AuthManager;
