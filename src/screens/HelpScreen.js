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
                    <section class="help-section important-notice">
                        <h2>Important: Discord Data File</h2>
                        <p>Some features require your Discord data file:</p>
                        <ol class="steps-list">
                            <li>Open Discord Settings > Privacy & Safety</li>
                            <li>Click "Request Data"</li>
                            <li>Wait for Discord's email (usually within 24-48 hours)</li>
                            <li>Download and extract the ZIP file</li>
                            <li>Locate the <code>messages/index.json</code> file</li>
                        </ol>
                        <p class="note">This file is required for the "Find Closed DMs" and "Message Wiper" features</p>
                    </section>

                    <section class="help-section">
                        <h2>Features Overview</h2>
                        
                        <div class="feature-block">
                            <h3>View Open DMs</h3>
                            <p>Manage and delete messages from your active direct message channels:</p>
                            <ul class="feature-list">
                                <li>Select multiple DMs using checkboxes</li>
                                <li>Set message deletion filters (date range, specific text)</li>
                                <li>Option to automatically close DMs after deletion</li>
                                <li>Adjustable delay between operations</li>
                                <li>View message counts before deleting</li>
                            </ul>
                        </div>
                        
                        <div class="feature-block">
                            <h3>Accessible Servers</h3>
                            <p>Manage messages across servers you have access to:</p>
                            <ul class="feature-list">
                                <li>Batch delete messages from multiple servers</li>
                                <li>Filter by date range and message content</li>
                                <li>Target specific channels using Channel ID</li>
                                <li>Option to leave servers after deletion</li>
                                <li>Filter messages by user ID</li>
                            </ul>
                            <div class="tip-box">
                                <strong>Getting Channel IDs:</strong> 
                                Enable Developer Mode in Discord Settings > App Settings > Advanced, 
                                then right-click any channel and select "Copy Channel ID"
                            </div>
                        </div>
                        
                        <div class="feature-block">
                            <h3>Find Closed DMs</h3>
                            <p>Locate and recover closed DM channels:</p>
                            <ul class="feature-list">
                                <li>Upload your Discord data file to view closed DMs</li>
                                <li>Filter between open and closed DMs</li>
                                <li>Easily reopen closed conversations</li>
                                <li>Search functionality to find specific users</li>
                            </ul>
                        </div>
                        
                        <div class="feature-block">
                            <h3>Message Wiper</h3>
                            <p>Advanced tools for removing messages from your account:</p>
                            <ul class="feature-list">
                                <li>Upload Discord data to view all message history</li>
                                <li>Track deletion progress with detailed statistics</li>
                                <li>Filter channels by type (DM/Server)</li>
                                <li>Save channel states for long-term operations</li>
                            </ul>

                            <div class="tip-box">
                                <strong>Channel States:</strong>
                                <ul class="feature-list">
                                    <li>Unmarked (Default): Channel hasn't been processed yet</li>
                                    <li>Green: Successfully wiped messages from this channel</li>
                                    <li>Red: Unable to wipe messages (e.g., no longer in server)</li>
                                    <li>Locked: Channel will be skipped during wiping operations</li>
                                </ul>
                                <p>Channel states persist between sessions, allowing you to:</p>
                                <ul class="feature-list">
                                    <li>Close the program and continue progress later</li>
                                    <li>Lock channels you want to preserve</li>
                                    <li>Track which channels have been completed</li>
                                </ul>
                                <p class="note">States can be reset using the "Reset States" button if needed</p>
                            </div>
                        </div>
                    </section>
                    
                    <section class="help-section">
                        <h2>Need Help?</h2>
                        <p>Each screen includes progress tracking, adjustable delays, and detailed console output to help you monitor operations.</p>
                        <p>Use the search functions and filters to easily manage large numbers of channels.</p>
                    </section>
                </div>
            </div>
        `;
    }
}

module.exports = HelpScreen; 