const BaseScreen = require('./BaseScreen');

class HelpScreen extends BaseScreen {
    constructor(token) {
        super(token);
    }

    render(container) {
        container.innerHTML = `
            <div class="help-screen-container">
                <div class="help-navigation">
                    <h2>Contents</h2>
                    <ul class="help-nav-list">
                        <li><a href="#data-file">Discord Data File</a></li>
                        <li><a href="#channel-indexing">Channel Indexing</a></li>
                        <li><a href="#features">Features</a>
                            <ul>
                                <li><a href="#open-dms">View Open DMs</a></li>
                                <li><a href="#servers">Accessible Servers</a></li>
                                <li><a href="#closed-dms">Find Closed DMs</a></li>
                                <li><a href="#media">Media Viewer</a></li>
                                <li><a href="#wiper">Message Wiper</a></li>
                            </ul>
                        </li>
                        <li><a href="#help">Need Help?</a></li>
                    </ul>
                </div>
                <div class="help-content">
                    <h1>How to Use</h1>
                    
                    <section id="data-file" class="help-section important-notice">
                        <h2>Important: Discord Data File</h2>
                        <p>Some features require your Discord data file:</p>
                        <ol class="steps-list">
                            <li>Open Discord Settings > Privacy & Safety</li>
                            <li>Click "Request Data" (make sure to check messages)</li>
                            <li>Wait for Discord's email (usually within 24-48 hours)</li>
                            <li>Download and extract the ZIP file</li>
                            <li>Locate the <code>messages/index.json</code> file</li>
                        </ol>
                        <p class="note">This file is required for the "Find Closed DMs" and "Message Wiper" features</p>
                        <p class="tip">Tip: Only select "Messages" when requesting data for fastest processing. Other data will increase processing time.</p>
                    </section>

                    <section id="channel-indexing" class="help-section important-notice">
                        <h2>Important: Channel Indexing</h2>
                        <p>For best results when deleting messages:</p>
                        <ul class="feature-list">
                            <li>Wait at least 2-3 minutes after sending messages in a channel before running deletion operations on that channel</li>
                            <li>If you stop a deletion operation, wait a few minutes before restarting it on the same channel</li>
                        </ul>
                        <p class="note">Discord needs time to properly index messages. Running deletions too quickly after sending messages or between operations may result in incomplete deletion (missed messages or infinite retry loops).</p>
                    </section>

                    <section id="features" class="help-section">
                        <h2>Features Overview</h2>
                        
                        <div id="open-dms" class="feature-block">
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
                        
                        <div id="servers" class="feature-block">
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
                        
                        <div id="closed-dms" class="feature-block">
                            <h3>Find Closed DMs</h3>
                            <p>Search through your Discord data file to find closed DMs and reopen them:</p>
                            <ul class="feature-list">
                                <li>Upload your Discord data file to search through past DMs</li>
                                <li>Filter and search through your DM history</li>
                                <li>Batch open multiple DMs at once</li>
                            </ul>

                            <div class="tip-box">
                                <strong>Batch Opening DMs:</strong>
                                <ul class="feature-list">
                                    <li>Discord limits DM opening to 100 channels per batch</li>
                                    <li>Use the index controls to open DMs in batches (e.g., 1-100, 101-200)</li>
                                    <li>Wait a few minutes between batches to avoid rate limits</li>
                                    <li>Use the "Select All" button to quickly select the current batch</li>
                                </ul>
                            </div>

                            <div class="tip-box">
                                <strong>Tips:</strong>
                                <ul class="feature-list">
                                    <li>Use filters to find specific users or date ranges</li>
                                    <li>The message count shows how many messages were in each DM</li>
                                    <li>Successfully opened DMs will be marked in green</li>
                                    <li>Failed attempts will be marked in red</li>
                                </ul>
                            </div>
                        </div>
                        
                        <div id="media" class="feature-block">
                            <h3>Media Viewer</h3>
                            <p>Browse and download media from your channels and DMs:</p>
                            <ul class="feature-list">
                                <li>View images, videos, and GIFs from any channel</li>
                                <li>Filter media types (images/videos/GIFs)</li>
                                <li>Autoplay functionality with adjustable delay</li>
                                <li>Batch download capabilities</li>
                                <li>Duplicate content detection</li>
                            </ul>

                            <div class="tip-box">
                                <strong>Keyboard Shortcuts:</strong>
                                <ul class="feature-list">
                                    <li>← / →: Navigate between media</li>
                                    <li>↑: Save current media and go to next</li>
                                    <li>↓: Undo last save</li>
                                    <li>S: Save all media in current view</li>
                                </ul>
                                <p class="note">Set a save location before using download features</p>
                            </div>

                            <div class="tip-box">
                                <strong>Features:</strong>
                                <ul class="feature-list">
                                    <li>Video volume control and autoplay settings</li>
                                    <li>Smart content loading with preloading</li>
                                    <li>Optional duplicate filtering</li>
                                    <li>Easy channel/server navigation</li>
                                    <li>Search functionality for finding specific channels</li>
                                </ul>
                            </div>
                        </div>
                        
                        <div id="wiper" class="feature-block">
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
                    
                    <section id="help" class="help-section">
                        <h2>Need Help?</h2>
                        <p>Each screen includes progress tracking, adjustable delays, and detailed console output to help you monitor operations.</p>
                        <p>Use the search functions and filters to easily manage large numbers of channels.</p>
                    </section>
                </div>
            </div>
        `;

        // Add click handlers for smooth scrolling
        container.querySelectorAll('.help-nav-list a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href');
                const targetElement = container.querySelector(targetId);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
    }
}

module.exports = HelpScreen; 