class BaseScreen {
    constructor(token) {
        this.token = token;
    }

    render(container) {
        throw new Error('render method must be implemented by child class');
    }

    showLoading(container, message = 'Loading...') {
        container.innerHTML = `
            <div class="loading-indicator">
                <p>${message}</p>
            </div>
        `;
    }

    showError(container, message) {
        container.innerHTML = `
            <div class="error-message">
                <p>${message}</p>
            </div>
        `;
    }
}

module.exports = BaseScreen; 