import { createCloseButton, createModalOverlay } from "../dist/shared/DomHelpers.js";
import UIManager from './UIManager.js';

class CreatePollModal {
    static _modal = null;
    static _client = null;
    static _roomId = null;
    static _options = [];
    static _nextOptionId = 0;

    static open(client, roomId, preset = null) {
        if (this._modal) {
            this.close();
        }

        this._client = client;
        this._roomId = roomId;
        this._options = [];
        this._nextOptionId = 0;

        const content = document.createElement('div');
        content.className = 'create-poll-modal-content';
        content.style.cssText = 'background: #2d2d44; border-radius: 12px; padding: 0; max-width: 500px; width: 90%; max-height: 80vh; border: 1px solid #404060; display: flex; flex-direction: column; overflow: hidden;';

        this._modal = createModalOverlay(content, () => this.close());
        document.body.appendChild(this._modal);

        fetch("/templates/poll-modal.html")
            .then(response => response.text())
            .then(html => {
                content.innerHTML = html;
                initModal();
            });

        const initModal = () => {
            const questionInput = content.querySelector('#poll-question-input');
            const optionsContainer = content.querySelector('#poll-options-container');
            const addOptionBtn = content.querySelector('#poll-add-option-btn');
            const multipleCheckbox = content.querySelector('#poll-multiple-checkbox');
            const anonymousCheckbox = content.querySelector('#poll-anonymous-checkbox');
            const cancelBtn = content.querySelector('.poll-modal-cancel');
            const createBtn = content.querySelector('.poll-modal-create');

            const header = content.querySelector('.poll-modal-header');
            if (header) {
                const existingClose = header.querySelector('.poll-modal-close');
                if (existingClose) existingClose.remove();
                header.appendChild(createCloseButton(() => this.close()));
            }

            if (preset) {
                if (preset.question) questionInput.value = preset.question;
                if (preset.options && Array.isArray(preset.options)) {
                    preset.options.forEach(opt => {
                        this._addOptionInput(optionsContainer, opt);
                    });
                }
                if (preset.multiple) multipleCheckbox.checked = true;
            }

            if (this._options.length === 0) {
                this._addOptionInput(optionsContainer, '');
                this._addOptionInput(optionsContainer, '');
            }

            addOptionBtn.addEventListener('click', () => {
                if (this._options.length < 10) {
                    this._addOptionInput(optionsContainer, '');
                } else {
                    UIManager.showError('Максимум 10 вариантов');
                }
            });

            cancelBtn.addEventListener('click', () => this.close());

            createBtn.addEventListener('click', () => {
                this._handleCreate(questionInput, multipleCheckbox, anonymousCheckbox);
            });

            questionInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._handleCreate(questionInput, multipleCheckbox, anonymousCheckbox);
                }
            });

            questionInput.focus();
        };
    }

    static _addOptionInput(container, value = '') {
        const optionId = this._nextOptionId++;
        
        const optionEl = document.createElement('div');
        optionEl.className = 'poll-option-input-group';
        optionEl.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        optionEl.dataset.optionId = optionId;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'poll-option-input-field';
        input.placeholder = `Вариант ${this._options.length + 1}`;
        input.maxLength = 100;
        input.value = value;
        input.style.cssText = 'flex: 1; padding: 8px 10px; background: #1a1a2e; border: 1px solid #404060; color: #e0e0e0; border-radius: 6px; font-size: 13px; outline: none;';
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'poll-option-remove-btn';
        removeBtn.innerHTML = '✕';
        removeBtn.title = 'Удалить вариант';
        removeBtn.style.cssText = 'width: 28px; height: 28px; background: #404060; color: #e0e0e0; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;';
        
        removeBtn.addEventListener('click', () => {
            if (this._options.length > 2) {
                optionEl.remove();
                this._options = this._options.filter(opt => opt.id !== optionId);
                this._updatePlaceholders(container);
            } else {
                UIManager.showError('Минимум 2 варианта');
            }
        });
        
        optionEl.appendChild(input);
        optionEl.appendChild(removeBtn);
        container.appendChild(optionEl);
        
        this._options.push({
            id: optionId,
            input: input,
            element: optionEl
        });
    }

    static _updatePlaceholders(container) {
        const groups = container.querySelectorAll('.poll-option-input-group');
        groups.forEach((group, index) => {
            const input = group.querySelector('.poll-option-input-field');
            if (input && !input.placeholder.startsWith('Вариант')) {
                input.placeholder = `Вариант ${index + 1}`;
            }
        });
    }

    static _handleCreate(questionInput, multipleCheckbox, anonymousCheckbox) {
        const question = questionInput.value.trim();
        
        if (!question) {
            UIManager.showError('Введите вопрос опроса');
            questionInput.focus();
            return;
        }
        
        if (question.length < 1 || question.length > 256) {
            UIManager.showError('Вопрос должен быть от 1 до 256 символов');
            questionInput.focus();
            return;
        }
        
        const options = [];
        const optionGroups = document.querySelectorAll('.poll-option-input-group');
        
        for (const group of optionGroups) {
            const input = group.querySelector('.poll-option-input-field');
            const value = input.value.trim();
            
            if (!value) {
                UIManager.showError('Все варианты должны быть заполнены');
                input.focus();
                return;
            }
            
            if (value.length < 1 || value.length > 100) {
                UIManager.showError('Каждый вариант должен быть от 1 до 100 символов');
                input.focus();
                return;
            }
            
            options.push(value);
        }
        
        if (options.length < 2) {
            UIManager.showError('Нужно минимум 2 варианта');
            return;
        }
        
        if (options.length > 10) {
            UIManager.showError('Максимум 10 вариантов');
            return;
        }
        
        const uniqueOptions = new Set(options);
        if (uniqueOptions.size !== options.length) {
            UIManager.showError('Варианты не должны повторяться');
            return;
        }
        
        const settings = {
            multiple: multipleCheckbox.checked,
            anonymous: anonymousCheckbox.checked,
            maxChoices: multipleCheckbox.checked ? options.length : 1,
            closed: false,
            closeAt: null
        };
        
        if (this._client && typeof this._client.createPoll === 'function') {
            this._client.createPoll(this._roomId, question, options, settings);
            this.close();
        } else {
            UIManager.showError('Функция создания опроса недоступна');
        }
    }

    static close() {
        if (this._modal) {
            this._modal.remove();
            this._modal = null;
        }
        this._client = null;
        this._roomId = null;
        this._options = [];
        this._nextOptionId = 0;
    }
}

export default CreatePollModal;
