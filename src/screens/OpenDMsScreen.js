const BaseScreen = require('./BaseScreen');

class OpenDMsScreen extends BaseScreen {
    constructor(token) {
        super(token);
    }

    render(container) {
        container.innerHTML = `
            <div class="screen-container">
                <h1>View Open DMs</h1>
                <div class="loading-indicator">
                    <p>Loading your open DMs...</p>
                </div>
                <div class="dm-list">
                    <!-- DM list will be populated here -->
                </div>
            </div>
        `;

        this.loadDMs(container);
    }

    async loadDMs(container) {
        // Here you would add the logic to fetch and display open DMs
        // For now, we'll just show a placeholder
        setTimeout(() => {
            const dmList = container.querySelector('.dm-list');
            const loadingIndicator = container.querySelector('.loading-indicator');
            
            if (loadingIndicator) {
                loadingIndicator.remove();
            }
            
            dmList.innerHTML = `
                <div class="info-message">
                    <p>This screen will show your open DM channels.</p>
                    <p>Implementation coming soon...</p>
                </div>
            `;
        }, 1000);
    }
}

module.exports = OpenDMsScreen; 