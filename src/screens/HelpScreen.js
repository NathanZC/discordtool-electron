const BaseScreen = require('./BaseScreen');

class HelpScreen extends BaseScreen {
    constructor(token) {
        super(token);
    }

    render(container) {
        container.innerHTML = `
            <div class="screen-container">
                <h1>How to Use</h1>
                <div class="help-content">
                    <section class="help-section">
                        <h2>Getting Started</h2>
                        <p>Welcome to Discord Tool! Here's how to use each feature:</p>
                        
                        <h3>View Open DMs</h3>
                        <p>Shows all your active direct message channels.</p>
                        
                        <h3>Accessible Servers</h3>
                        <p>Lists all servers you have access to.</p>
                        
                        <h3>Find Closed DMs</h3>
                        <p>Helps you locate and recover closed DM channels.</p>
                        
                        <h3>Wipe Account</h3>
                        <p>Tools for removing messages from your account.</p>
                    </section>
                    
                    <section class="help-section">
                        <h2>Need Help?</h2>
                        <p>More detailed documentation coming soon...</p>
                    </section>
                </div>
            </div>
        `;
    }
}

module.exports = HelpScreen; 