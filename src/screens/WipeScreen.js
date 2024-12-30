const BaseScreen = require('./BaseScreen');

class WipeScreen extends BaseScreen {
    constructor(token) {
        super(token);
    }

    render(container) {
        container.innerHTML = `
            <div class="screen-container">
                <h1>Wipe Account</h1>
                <div class="wipe-content">
                    <div class="warning-message">
                        <h2>⚠️ Warning</h2>
                        <p>This tool will help you remove messages from your Discord account.</p>
                        <p>Please use this feature carefully as actions cannot be undone.</p>
                    </div>
                    <div class="wipe-options">
                        <button class="wipe-btn" disabled>
                            Wipe Messages
                            <span class="coming-soon">(Coming Soon)</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
}

module.exports = WipeScreen; 