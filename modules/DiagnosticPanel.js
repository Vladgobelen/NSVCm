class DiagnosticPanel {
    static _modal = null;
    static _expandedUsers = new Set();
    static _dragHandlers = {
        move: null,
        up: null
    };
    static _recoveryInfo = null;
    static _recoverySection = null;

    static _injectStyles() {
        if (document.getElementById('diag-panel-styles')) return;
        const style = document.createElement('style');
        style.id = 'diag-panel-styles';
        style.textContent = `
            .diagnostic-floating-panel { position: fixed; top: 20px; right: 20px; width: 800px; max-width: calc(100vw - 40px); max-height: calc(100vh - 40px); background: #1a1a2e; border: 1px solid #404060; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.6); display: flex; flex-direction: column; z-index: 10000; pointer-events: auto; resize: both; overflow: hidden; }
            .diagnostic-header { padding: 12px 16px; border-bottom: 1px solid #2d2d44; display: flex; justify-content: space-between; align-items: center; cursor: move; user-select: none; background: #2d2d44; border-radius: 12px 12px 0 0; }
            .diagnostic-header h3 { margin: 0; color: #e0e0e0; font-size: 15px; }
            #diag-close-btn { background: #ed4245; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; }
            .diagnostic-table-wrapper { flex: 1; overflow-y: auto; padding: 0; min-height: 200px; }
            .diagnostic-table { width: 100%; border-collapse: collapse; color: #b0b0c0; font-size: 13px; }
            .diagnostic-table th { background: #2d2d44; padding: 10px; text-align: left; position: sticky; top: 0; z-index: 10; }
            .diagnostic-table td { padding: 10px; border-bottom: 1px solid #2d2d44; }
            .diag-user { cursor: pointer; color: #5865f2; font-weight: 500; display: flex; align-items: center; gap: 6px; }
            .diag-user:hover { text-decoration: underline; }
            .diag-status { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
            .status-ok { background: #2ecc71; }
            .status-warn { background: #f1c40f; }
            .status-err { background: #e74c3c; }
            .status-exhausted { background: #e74c3c; animation: pulse-red 1.5s infinite; }
            .status-recovering { background: #f39c12; animation: pulse-orange 1s infinite; }
            .route-details { display: none; background: #2d2d44; }
            .route-details.active { display: table-row; }
            .route-details td { padding: 8px 12px; font-size: 12px; color: #888; }
            .route-list { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
            .route-chip { background: #1a1a2e; padding: 2px 6px; border-radius: 4px; border: 1px solid #404060; }
            .diagnostic-footer { padding: 8px 16px; font-size: 11px; color: #606070; text-align: center; border-top: 1px solid #2d2d44; background: #1a1a2e; }
            .recovery-section { padding: 12px 16px; border-bottom: 1px solid #2d2d44; background: #222238; }
            .recovery-title { color: #e0e0e0; font-size: 13px; font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
            .recovery-stats { display: flex; flex-wrap: wrap; gap: 16px; }
            .recovery-stat { display: flex; align-items: center; gap: 6px; }
            .recovery-stat-label { color: #808090; font-size: 12px; }
            .recovery-stat-value { color: #e0e0e0; font-size: 13px; font-weight: 500; }
            .recovery-consumers { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
            .recovery-chip { background: #2d2d44; padding: 4px 8px; border-radius: 4px; font-size: 11px; display: flex; align-items: center; gap: 4px; }
            .recovery-chip.exhausted { background: #4a2525; border-left: 3px solid #e74c3c; }
            .recovery-chip.recovering { background: #4a3a1a; border-left: 3px solid #f39c12; }
            .transport-status { display: flex; gap: 16px; margin-top: 4px; }
            .transport-item { display: flex; align-items: center; gap: 4px; font-size: 12px; }
            @keyframes pulse-red { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
            @keyframes pulse-orange { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        `;
        document.head.appendChild(style);
    }

    static open(client) {
        if (this._modal) return;
        this._injectStyles();

        this._modal = document.createElement('div');
        this._modal.id = 'diagnostic-panel';
        this._modal.className = 'diagnostic-floating-panel';
        this._modal.innerHTML = `
            <div class="diagnostic-header" id="diag-drag-handle">
                <h3>📊 Диагностика комнаты</h3>
                <button id="diag-close-btn">✕ Закрыть</button>
            </div>
            <div id="diag-recovery-section" class="recovery-section" style="display: none;">
                <div class="recovery-title">
                    <span>🔄 Восстановление соединений</span>
                    <span id="recovery-summary" style="font-size: 11px; color: #808090;"></span>
                </div>
                <div class="recovery-stats" id="recovery-stats"></div>
                <div class="recovery-consumers" id="recovery-consumers"></div>
                <div class="transport-status" id="transport-status"></div>
            </div>
            <div class="diagnostic-table-wrapper">
                <table class="diagnostic-table">
                    <thead>
                        <tr>
                            <th>Участник</th>
                            <th>Микрофон</th>
                            <th>Говорит</th>
                            <th>Воспроизведение</th>
                            <th>Статус</th>
                        </tr>
                    </thead>
                    <tbody id="diag-tbody">
                        <tr><td colspan="5" style="text-align:center; padding: 20px;">Загрузка данных...</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="diagnostic-footer">Обновление в реальном времени • Нажмите на ник, чтобы увидеть маршруты</div>
        `;
        document.body.appendChild(this._modal);

        this._recoverySection = this._modal.querySelector('#diag-recovery-section');

        this._modal.querySelector('#diag-close-btn').addEventListener('click', () => {
            client?.stopDiagnostic?.();
        });

        const dragHandle = this._modal.querySelector('#diag-drag-handle');
        let isDragging = false;
        let startX = 0, startY = 0, initialX = 0, initialY = 0;

        dragHandle.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = this._modal.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            this._modal.style.top = `${initialY}px`;
            this._modal.style.right = 'auto';
            this._modal.style.left = `${initialX}px`;
            document.body.style.cursor = 'move';
        });

        this._dragHandlers.move = (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            this._modal.style.left = `${initialX + dx}px`;
            this._modal.style.top = `${initialY + dy}px`;
        };

        this._dragHandlers.up = () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.cursor = '';
            }
        };

        window.addEventListener('mousemove', this._dragHandlers.move);
        window.addEventListener('mouseup', this._dragHandlers.up);

        this._modal.addEventListener('click', (e) => {
            const userCell = e.target.closest('.diag-user');
            if (userCell) {
                const userId = userCell.dataset.userId;
                const detailsRow = this._modal.querySelector(`#routes-${userId}`);
                if (detailsRow) {
                    const isActive = detailsRow.classList.toggle('active');
                    if (isActive) this._expandedUsers.add(userId);
                    else this._expandedUsers.delete(userId);
                }
            }
        });
    }

    static close() {
        if (!this._modal) return;
        
        this._modal.remove();
        this._modal = null;
        this._expandedUsers.clear();
        this._recoveryInfo = null;
        this._recoverySection = null;

        window.removeEventListener('mousemove', this._dragHandlers.move);
        window.removeEventListener('mouseup', this._dragHandlers.up);
        this._dragHandlers.move = null;
        this._dragHandlers.up = null;
    }

    static updateRecoveryInfo(recoveryInfo) {
        this._recoveryInfo = recoveryInfo;
        if (!this._modal || !this._recoverySection) return;

        if (!recoveryInfo || (!recoveryInfo.consumers?.length && !recoveryInfo.pendingConsumeQueue && !recoveryInfo.transports)) {
            this._recoverySection.style.display = 'none';
            return;
        }

        this._recoverySection.style.display = 'block';

        const summaryEl = this._modal.querySelector('#recovery-summary');
        const statsEl = this._modal.querySelector('#recovery-stats');
        const consumersEl = this._modal.querySelector('#recovery-consumers');
        const transportEl = this._modal.querySelector('#transport-status');

        const activeRecoveries = recoveryInfo.consumers?.filter(c => !c.exhausted).length || 0;
        const exhaustedRecoveries = recoveryInfo.consumers?.filter(c => c.exhausted).length || 0;

        if (summaryEl) {
            summaryEl.textContent = `${activeRecoveries} активных, ${exhaustedRecoveries} безнадежных`;
        }

        if (statsEl) {
            statsEl.innerHTML = `
                <div class="recovery-stat">
                    <span class="recovery-stat-label">Очередь:</span>
                    <span class="recovery-stat-value">${recoveryInfo.pendingConsumeQueue || 0}</span>
                </div>
                <div class="recovery-stat">
                    <span class="recovery-stat-label">Транспорт готов:</span>
                    <span class="recovery-stat-value" style="color: ${recoveryInfo.transportReadyForConsume ? '#2ecc71' : '#e74c3c'}">
                        ${recoveryInfo.transportReadyForConsume ? '✅ Да' : '❌ Нет'}
                    </span>
                </div>
            `;
        }

        if (consumersEl && recoveryInfo.consumers?.length) {
            consumersEl.innerHTML = recoveryInfo.consumers.map(c => {
                const chipClass = c.exhausted ? 'exhausted' : 'recovering';
                const statusIcon = c.exhausted ? '❌' : '🔄';
                return `
                    <div class="recovery-chip ${chipClass}" title="Последняя ошибка: ${c.lastError || 'неизвестно'}">
                        ${statusIcon} ${c.producerId} (${c.attempts}/8)
                    </div>
                `;
            }).join('');
        } else if (consumersEl) {
            consumersEl.innerHTML = '<span style="color: #606070; font-size: 12px;">Нет активных восстановлений</span>';
        }

        if (transportEl && recoveryInfo.transports) {
            const recvState = recoveryInfo.transports.recv?.state || 'none';
            const sendState = recoveryInfo.transports.send?.state || 'none';
            const recvAttempts = recoveryInfo.transports.recv?.recoveryAttempts || 0;
            const sendAttempts = recoveryInfo.transports.send?.recoveryAttempts || 0;

            const getStateColor = (state) => {
                if (state === 'connected') return '#2ecc71';
                if (state === 'connecting' || state === 'new') return '#f1c40f';
                return '#e74c3c';
            };

            transportEl.innerHTML = `
                <div class="transport-item">
                    <span style="color: #808090;">Recv:</span>
                    <span style="color: ${getStateColor(recvState)};">${recvState}</span>
                    ${recvAttempts > 0 ? `<span style="color: #f39c12;">(${recvAttempts})</span>` : ''}
                </div>
                <div class="transport-item">
                    <span style="color: #808090;">Send:</span>
                    <span style="color: ${getStateColor(sendState)};">${sendState}</span>
                    ${sendAttempts > 0 ? `<span style="color: #f39c12;">(${sendAttempts})</span>` : ''}
                </div>
            `;
        }
    }

    static renderSnapshot(snapshot) {
        const tbody = document.getElementById('diag-tbody');
        if (!tbody || !this._modal) return;

        const fragment = document.createDocumentFragment();

        snapshot.participants.forEach(p => {
            const mainRow = document.createElement('tr');
            const healthColor = p.tabHidden
                ? 'status-warn'
                : (p.clientHealth.consumersPlaying === p.clientHealth.consumersTotal ? 'status-ok' : 'status-err');

            mainRow.innerHTML = `
                <td><span class="diag-user" data-user-id="${p.userId}">${p.isSpeaking ? '🎤' : '👤'} ${p.username}</span></td>
                <td>${p.micState === 'active' ? '<span style="color:#2ecc71">✅ Вкл</span>' : '<span style="color:#e74c3c">🔇 Выкл</span>'}</td>
                <td>${p.isSpeaking ? '<span style="color:#f1c40f">🗣️ Говорит</span>' : '🤫 Молчит'}</td>
                <td><span class="diag-status ${healthColor}"></span>${p.clientHealth.consumersPlaying}/${p.clientHealth.consumersTotal}</td>
                <td>${p.tabHidden ? '<span style="color:#f1c40f">👁️ Вкладка скрыта</span>' : '<span style="color:#2ecc71">👁️ Активна</span>'}</td>
            `;
            fragment.appendChild(mainRow);

            const detailRow = document.createElement('tr');
            detailRow.id = `routes-${p.userId}`;
            detailRow.className = `route-details ${this._expandedUsers.has(p.userId) ? 'active' : ''}`;

            const hearsList = p.hears.length
                ? p.hears.map(uid => `<span class="route-chip">👂 ${uid.substring(0, 6)}</span>`).join('')
                : 'Никого';
            const heardByList = p.heardBy.length
                ? p.heardBy.map(uid => `<span class="route-chip">📢 ${uid.substring(0, 6)}</span>`).join('')
                : 'Никого';

            detailRow.innerHTML = `
                <td colspan="5">
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div><strong>Слышит:</strong> <div class="route-list">${hearsList}</div></div>
                        <div><strong>Слышат:</strong> <div class="route-list">${heardByList}</div></div>
                    </div>
                    <div style="margin-top:6px; font-size:11px; color:#666;">Маршрутов: ${p.routes.length}</div>
                </td>
            `;
            fragment.appendChild(detailRow);
        });

        tbody.innerHTML = '';
        tbody.appendChild(fragment);
    }
}

export default DiagnosticPanel;
