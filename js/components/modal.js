/**
 * Modal Component
 */

const modal = {
    container: null,

    init() {
        this.container = document.getElementById('modal-container');
    },

    show(options) {
        if (!this.container) this.init();

        const { title, content, onSave, onDelete, saveText = 'Save', deleteText = 'Delete' } = options;

        const modalHtml = `
            <div class="modal" id="current-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>${title}</h2>
                        <button class="modal-close" id="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        ${content}
                    </div>
                    <div class="modal-footer">
                        ${onDelete ? `<button class="btn btn-danger" id="modal-delete">${deleteText}</button>` : ''}
                        <div style="flex: 1;"></div>
                        <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
                        ${onSave ? `<button class="btn btn-primary" id="modal-save">${saveText}</button>` : ''}
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = modalHtml;

        // Event listeners
        const modalEl = document.getElementById('current-modal');
        const closeBtn = document.getElementById('modal-close');
        const cancelBtn = document.getElementById('modal-cancel');
        const saveBtn = document.getElementById('modal-save');
        const deleteBtn = document.getElementById('modal-delete');

        const close = () => {
            this.container.innerHTML = '';
        };

        closeBtn.addEventListener('click', close);
        cancelBtn.addEventListener('click', close);

        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) close();
        });

        if (saveBtn && onSave) {
            saveBtn.addEventListener('click', async () => {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';
                try {
                    await onSave();
                    close();
                } catch (error) {
                    toast.error(error.message || 'Failed to save');
                    saveBtn.disabled = false;
                    saveBtn.textContent = saveText;
                }
            });
        }

        if (deleteBtn && onDelete) {
            deleteBtn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to delete this?')) {
                    deleteBtn.disabled = true;
                    try {
                        await onDelete();
                        close();
                    } catch (error) {
                        toast.error(error.message || 'Failed to delete');
                        deleteBtn.disabled = false;
                    }
                }
            });
        }

        // Return close function for external use
        return close;
    },

    hide() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    },

    // Utility: Get form data from modal
    getFormData(formId) {
        const form = document.getElementById(formId);
        if (!form) return {};

        const formData = new FormData(form);
        const data = {};
        for (const [key, value] of formData.entries()) {
            data[key] = value;
        }
        return data;
    }
};
