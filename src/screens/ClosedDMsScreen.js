const BaseScreen = require('./BaseScreen');

class ClosedDMsScreen extends BaseScreen {
    constructor(token) {
        super(token);
    }

    render(container) {
        container.innerHTML = `
            <div class="screen-container">
                <h1>Find Closed DMs</h1>
                <div class="loading-indicator">
                    <p>Loading closed DM history...</p>
                </div>
                <div class="closed-dms-list">
                    <!-- Closed DMs list will be populated here -->
                </div>
            </div>
        `;

        this.loadClosedDMs(container);
    }

    async loadClosedDMs(container) {
        setTimeout(() => {
            const dmsList = container.querySelector('.closed-dms-list');
            const loadingIndicator = container.querySelector('.loading-indicator');
            
            if (loadingIndicator) {
                loadingIndicator.remove();
            }
            
            dmsList.innerHTML = `
                <div class="info-message">
                    <p>This screen will help you find your closed DM channels.</p>
                    <p>Implementation coming soon...</p>
                </div>
            `;
        }, 1000);
    }
}

module.exports = ClosedDMsScreen; 