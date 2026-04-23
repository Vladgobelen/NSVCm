import SoundManager from './SoundManager.js';
import SettingsManager from './SettingsManager.js';

class ModalManager {
    static _activeErrors = new Map();

    static openCreateRoomModal(client, onSubmit) {
        let overlay = document.querySelector('.modal-overlay');
        let content = document.querySelector('.modal-content');

        if (!overlay || !content) {
            overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center; align-items: center; z-index: 10000;';

            content = document.createElement('div');
            content.className = 'modal-content';
            content.style.cssText = 'background: #2d2d44; border-radius: 12px; padding: 24px; max-width: 400px; width: 90%; border: 1px solid #404060;';
            content.innerHTML = `
                <h2 style="margin: 0 0 20px 0; color: #e0e0e0;">Свить гнездо</h2>
                <input type="text" id="createRoomNameInput" placeholder="Название гнезда" style="width: 100%; padding: 10px; margin-bottom: 15px; background: #1a1a2e; border: 1px solid #404060; color: #e0e0e0; border-radius: 6px; font-size: 14px;">
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="createRoomCancelBtn" style="padding: 10px 20px; background: #404060; color: #e0e0e0; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">Отмена</button>
                    <button id="createRoomSubmitBtn" style="padding: 10px 20px; background: #5865f2; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">Свить</button>
                </div>
            `;
            overlay.appendChild(content);
            document.body.appendChild(overlay);
        } else {
            content.innerHTML = `
                <h2>Свить гнездо</h2>
                <input type="text" id="createRoomNameInput" placeholder="Название гнезда" style="width: 100%; padding: 10px; margin: 15px 0; background: #1a1a2e; border: 1px solid #404060; color: #e0e0e0; border-radius: 6px;">
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="modal-cancel">Отмена</button>
                    <button class="modal-submit">Свить</button>
                </div>
            `;
            overlay.classList.remove('hidden');
        }

        const input = content.querySelector('#createRoomNameInput');
        const submitBtn = content.querySelector('#createRoomSubmitBtn') || content.querySelector('.modal-submit');
        const cancelBtn = content.querySelector('#createRoomCancelBtn') || content.querySelector('.modal-cancel');

        const handleSubmit = () => {
            const name = input.value.trim();
            if (name.length < 3) return alert('Название должно быть от 3 символов');
            this.closeModal();
            if (onSubmit) onSubmit(name);
        };

        submitBtn.addEventListener('click', handleSubmit);
        cancelBtn.addEventListener('click', () => this.closeModal());
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSubmit(); });
        input.focus();
    }

    static _renderSettingsContent(client) {
        const soundGroups = SoundManager.getGroupedSoundTypes();
        let soundsHtml = '';
        for (const group of soundGroups) {
            let groupItemsHtml = '';
            for (const soundType of group.types) {
                const label = SoundManager.getLabel(soundType);
                const isEnabled = SoundManager.isEnabled(soundType);
                const checkedAttr = isEnabled ? 'checked' : '';
                groupItemsHtml += `
                <div class="sound-toggle-row">
                    <label class="sound-label">
                        <input type="checkbox" class="sound-checkbox" data-sound-type="${soundType}" ${checkedAttr}>
                        <span>${label}</span>
                    </label>
                </div>
                `;
            }
            soundsHtml += `
            <div class="sound-settings-group">
                <div class="sound-group-header">${group.name}</div>
                <div class="sound-group-items">
                    ${groupItemsHtml}
                </div>
            </div>
            `;
        }

        SettingsManager.init();
        const copyOnClick = SettingsManager.getCopyOnClick();

        // Чтение аудио настроек из клиента
        const audioDTX = client?.audioDTX ?? true;
        const audioNoiseSuppression = client?.audioNoiseSuppression ?? true;
        const audioEchoCancellation = client?.audioEchoCancellation ?? true;
        const audioAutoGainControl = client?.audioAutoGainControl ?? true;
        const audioRNNoise = client?.audioRNNoise ?? true;
        const audioMaxBitrate = client?.audioMaxBitrate ?? 48;
        const audioInputGain = client?.audioInputGain ?? 1.0;
        const audioChannelMode = client?.audioChannelMode ?? 'mono';
	const audioEchoCancellationType = client?.audioEchoCancellationType ?? 'browser';

        return `
        <div class="settings-modal-container">
            <div class="settings-tabs">
                <button class="settings-tab active" data-tab="general">⚙️ Основные</button>
                <button class="settings-tab" data-tab="sounds">🔊 Звуки</button>
                <button class="settings-tab" data-tab="ui">💬 Интерфейс</button>
                <button class="settings-tab" data-tab="audio">🎤 Аудио</button>
            </div>
            <div class="settings-tab-content active" data-tab-content="general">
                <div class="settings-section">
                    <div style="padding: 20px; text-align: center; color: #888; font-size: 13px;">Основные настройки</div>
                </div>
            </div>
            <div class="settings-tab-content" data-tab-content="sounds">
                <div class="sound-settings-container">
                    ${soundsHtml}
                </div>
                <div class="sound-settings-footer">
                    <button id="sound-reset-defaults" class="sound-reset-btn">Сбросить настройки звуков</button>
                </div>
            </div>
            <div class="settings-tab-content" data-tab-content="ui">
                <div class="ui-settings-container" style="padding: 12px 0;">
                    <label class="ui-setting-label" style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: #b0b0c0; font-size: 14px;">
                        <input type="checkbox" id="copy-on-click-checkbox" style="width: 18px; height: 18px; cursor: pointer; accent-color: #5865f2;" ${copyOnClick ? 'checked' : ''}>
                        <span>Копировать сообщение в буфер при клике</span>
                    </label>
                </div>
            </div>
            <div class="settings-tab-content" data-tab-content="audio">
                <div class="audio-settings-container" style="padding: 8px 0; display: flex; flex-direction: column; gap: 16px;">
                    <label style="display: flex; align-items: center; gap: 10px; color: #b0b0c0; font-size: 13px; cursor: pointer;">
                        <input type="checkbox" id="audio-dtx" ${audioDTX ? 'checked' : ''}>
                        <span>🔇 DTX (не передавать тишину)</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 10px; color: #b0b0c0; font-size: 13px; cursor: pointer;">
                        <input type="checkbox" id="audio-noise" ${audioNoiseSuppression ? 'checked' : ''}>
                        <span>🎛️ Шумоподавление браузера</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 10px; color: #b0b0c0; font-size: 13px; cursor: pointer;">
                        <input type="checkbox" id="audio-echo" ${audioEchoCancellation ? 'checked' : ''}>
                        <span>🔄 Эхоподавление (AEC)</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 10px; color: #b0b0c0; font-size: 13px; cursor: pointer;">
                        <input type="checkbox" id="audio-agc" ${audioAutoGainControl ? 'checked' : ''}>
                        <span>📢 Автоусиление (AGC)</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 10px; color: #b0b0c0; font-size: 13px; cursor: pointer;">
                        <input type="checkbox" id="audio-rnnoise" ${audioRNNoise ? 'checked' : ''}>
                        <span>🧠 RNNoise (нейросетевое шумоподавление)</span>
                    </label>
                    
                    <div style="margin-top: 8px;">
                        <label style="display: flex; justify-content: space-between; color: #b0b0c0; font-size: 13px; margin-bottom: 8px;">
                            <span>📊 Макс. битрейт: <span id="bitrate-value">${audioMaxBitrate}</span> kbps</span>
                        </label>
                        <input type="range" id="audio-bitrate" min="16" max="128" value="${audioMaxBitrate}" step="8" style="width: 100%; margin: 8px 0;">
                    </div>
                    
                    <div style="margin-top: 8px;">
                        <label style="display: flex; justify-content: space-between; color: #b0b0c0; font-size: 13px; margin-bottom: 8px;">
                            <span>🎤 Усиление микрофона: <span id="gain-value">${Math.round(audioInputGain * 100)}</span>%</span>
                        </label>
                        <input type="range" id="audio-gain" min="0" max="200" value="${Math.round(audioInputGain * 100)}" step="10" style="width: 100%; margin: 8px 0;">
                    </div>
                    
                    <div style="margin-top: 8px;">
                        <label style="display: block; color: #b0b0c0; font-size: 13px; margin-bottom: 8px;">📻 Режим канала:</label>
                        <select id="audio-channels" style="width: 100%; padding: 8px 12px; background: #1a1a2e; border: 1px solid #404060; color: #e0e0e0; border-radius: 6px; font-size: 13px;">
                            <option value="mono" ${audioChannelMode === 'mono' ? 'selected' : ''}>Моно</option>
                            <option value="stereo" ${audioChannelMode === 'stereo' ? 'selected' : ''}>Стерео</option>
                        </select>
			<div style="margin-top: 8px;">
    <label style="display: block; color: #b0b0c0; font-size: 13px; margin-bottom: 8px;">🔄 Тип эхоподавления:</label>
    <select id="audio-echo-type" style="width: 100%; padding: 8px 12px; background: #1a1a2e; border: 1px solid #404060; color: #e0e0e0; border-radius: 6px; font-size: 13px;">
        <option value="browser" ${audioEchoCancellationType === 'browser' ? 'selected' : ''}>Браузерное</option>
        <option value="system" ${audioEchoCancellationType === 'system' ? 'selected' : ''}>Системное</option>
    </select>
</div>
                    </div>
                    
                    <div class="audio-settings-footer" style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #404060;">
                        <button id="audio-reset-defaults" style="width: 100%; padding: 10px; background: #404060; color: #e0e0e0; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; transition: background 0.2s ease;">Сбросить настройки аудио</button>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    static openSettingsModal(client) {
        const existing = document.getElementById('settings-modal');
        if (existing) {
            existing.remove();
            return;
        }
        const modal = document.createElement('div');
        modal.id = 'settings-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 10001; backdrop-filter: blur(2px);';
        modal.innerHTML = `
        <div class="settings-modal-content" style="background: #2d2d44; border: 1px solid #404060; border-radius: 12px; padding: 0; width: 420px; max-width: 90%; max-height: 80vh; position: relative; box-shadow: 0 8px 24px rgba(0,0,0,0.4); display: flex; flex-direction: column; overflow: hidden;">
            <button id="close-settings-modal" style="position: absolute; top: 12px; right: 12px; background: none; border: none; color: #aaa; font-size: 22px; cursor: pointer; line-height: 1; z-index: 10;">&times;</button>
            <h3 style="margin: 0; padding: 20px 24px 16px; color: #e0e0e0; font-size: 16px; font-weight: 600; border-bottom: 1px solid #404060;">⚙️ Настройки</h3>
            <div id="settings-dynamic-content" style="padding: 20px 24px; overflow-y: auto; flex: 1;">
                ${this._renderSettingsContent(client)}
            </div>
        </div>
        `;
        document.body.appendChild(modal);
        this._initSettingsTabs(modal);
        this._initSoundCheckboxes(modal);
        this._initAudioSettings(modal, client); // <-- Вызов метода инициализации аудио

        const copyCheckbox = modal.querySelector('#copy-on-click-checkbox');
        if (copyCheckbox) {
            copyCheckbox.addEventListener('change', (e) => {
                SettingsManager.setCopyOnClick(e.target.checked);
            });
        }

        const closeBtn = modal.querySelector('#close-settings-modal');
        const closeModal = () => {
            modal.style.opacity = '0';
            setTimeout(() => modal.remove(), 200);
        };
        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    }

    static _initSettingsTabs(modal) {
        const tabs = modal.querySelectorAll('.settings-tab');
        const contents = modal.querySelectorAll('.settings-tab-content');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const targetContent = modal.querySelector(`[data-tab-content="${tabName}"]`);
                if (targetContent) targetContent.classList.add('active');
            });
        });
    }

    static _initSoundCheckboxes(modal) {
        const checkboxes = modal.querySelectorAll('.sound-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const soundType = checkbox.dataset.soundType;
                const enabled = checkbox.checked;
                SoundManager.setEnabled(soundType, enabled);
            });
        });
        
        const resetBtn = modal.querySelector('#sound-reset-defaults');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                SoundManager.resetToDefaults();
                const allCheckboxes = modal.querySelectorAll('.sound-checkbox');
                allCheckboxes.forEach(cb => {
                    const soundType = cb.dataset.soundType;
                    cb.checked = SoundManager.isEnabled(soundType);
                });
            });
        }
    }

    static _initAudioSettings(modal, client) {
        if (!client) return;

        const dtxCheckbox = modal.querySelector('#audio-dtx');
        const noiseCheckbox = modal.querySelector('#audio-noise');
        const echoCheckbox = modal.querySelector('#audio-echo');
        const agcCheckbox = modal.querySelector('#audio-agc');
        const rnnoiseCheckbox = modal.querySelector('#audio-rnnoise');
        const bitrateSlider = modal.querySelector('#audio-bitrate');
        const bitrateValue = modal.querySelector('#bitrate-value');
        const gainSlider = modal.querySelector('#audio-gain');
        const gainValue = modal.querySelector('#gain-value');
        const channelsSelect = modal.querySelector('#audio-channels');
        const echoTypeSelect = modal.querySelector('#audio-echo-type');
	const resetBtn = modal.querySelector('#audio-reset-defaults');

        const saveAudioSettings = () => {
            client.audioDTX = dtxCheckbox?.checked ?? true;
            client.audioNoiseSuppression = noiseCheckbox?.checked ?? true;
            client.audioEchoCancellation = echoCheckbox?.checked ?? true;
            client.audioAutoGainControl = agcCheckbox?.checked ?? true;
            client.audioRNNoise = rnnoiseCheckbox?.checked ?? true;
            client.audioMaxBitrate = parseInt(bitrateSlider?.value || '48', 10);
            client.audioInputGain = parseInt(gainSlider?.value || '100', 10) / 100;
            client.audioChannelMode = channelsSelect?.value || 'mono';
            client.audioEchoCancellationType = echoTypeSelect?.value || 'browser';
	    client.saveAudioSettings();
        };

        if (dtxCheckbox) dtxCheckbox.addEventListener('change', saveAudioSettings);
        if (noiseCheckbox) noiseCheckbox.addEventListener('change', saveAudioSettings);
        if (echoCheckbox) echoCheckbox.addEventListener('change', saveAudioSettings);
        if (agcCheckbox) agcCheckbox.addEventListener('change', saveAudioSettings);
        if (rnnoiseCheckbox) rnnoiseCheckbox.addEventListener('change', saveAudioSettings);

        if (bitrateSlider && bitrateValue) {
            bitrateSlider.addEventListener('input', () => {
                bitrateValue.textContent = bitrateSlider.value;
            });
            bitrateSlider.addEventListener('change', saveAudioSettings);
        }

        if (gainSlider && gainValue) {
            gainSlider.addEventListener('input', () => {
                gainValue.textContent = gainSlider.value;
            });
            gainSlider.addEventListener('change', saveAudioSettings);
        }

        if (channelsSelect) {
            channelsSelect.addEventListener('change', saveAudioSettings);
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                client.resetAudioSettingsToDefaults();
                
                if (dtxCheckbox) dtxCheckbox.checked = client.audioDTX;
                if (noiseCheckbox) noiseCheckbox.checked = client.audioNoiseSuppression;
                if (echoCheckbox) echoCheckbox.checked = client.audioEchoCancellation;
                if (agcCheckbox) agcCheckbox.checked = client.audioAutoGainControl;
                if (rnnoiseCheckbox) rnnoiseCheckbox.checked = client.audioRNNoise;
                if (bitrateSlider) bitrateSlider.value = client.audioMaxBitrate;
                if (bitrateValue) bitrateValue.textContent = client.audioMaxBitrate;
                if (gainSlider) gainSlider.value = Math.round(client.audioInputGain * 100);
                if (gainValue) gainValue.textContent = Math.round(client.audioInputGain * 100);
                if (channelsSelect) channelsSelect.value = client.audioChannelMode;
if (echoTypeSelect) echoTypeSelect.value = client.audioEchoCancellationType;
            });
        }
    }

    static openModal(title, content, onSubmit) {
        let overlay = document.querySelector('.modal-overlay');
        let contentBox = document.querySelector('.modal-content');

        if (!overlay || !contentBox) {
            overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center; align-items: center; z-index: 10000;';
            contentBox = document.createElement('div');
            contentBox.className = 'modal-content';
            contentBox.style.cssText = 'background: #2d2d44; border-radius: 12px; padding: 24px; max-width: 500px; width: 90%; border: 1px solid #404060;';
            overlay.appendChild(contentBox);
            document.body.appendChild(overlay);
        }

        contentBox.innerHTML = `<h2>${title}</h2>${content}<button class="modal-submit">OK</button>`;
        overlay.classList.remove('hidden');

        const submitBtn = contentBox.querySelector('.modal-submit');
        if (submitBtn && onSubmit) submitBtn.addEventListener('click', onSubmit);
    }

    static closeModal() {
        const overlay = document.querySelector('.modal-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.style.display = 'none';
        }
    }

    static showError(message) {
        if (this._activeErrors.has(message)) return;

        const errorEl = document.createElement('div');
        errorEl.className = 'error-message';
        errorEl.textContent = message;
        errorEl.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #ed4245; color: white; padding: 10px 15px; border-radius: 5px; z-index: 10002; max-width: 300px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-size: 14px;';
        document.body.appendChild(errorEl);

        const timeoutId = setTimeout(() => {
            if (errorEl.parentNode) errorEl.remove();
            this._activeErrors.delete(message);
        }, 5000);

        this._activeErrors.set(message, timeoutId);
    }
}

export default ModalManager;
