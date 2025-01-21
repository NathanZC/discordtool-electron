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
                                <li><a href="#media">Media Viewer</a></li>
                                <li><a href="#search">Enhanced Search</a></li>
                                <li><a href="#wiper">Message Wiper</a></li>
                                <li><a href="#closed-dms">Find Closed DMs</a></li>
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
                            <p>Perfect for cleaning up your active direct message conversations and managing your DM history.</p>
                            
                            <div class="tip-box">
                                <strong>When to Use:</strong>
                                <ul class="feature-list">
                                    <li>Clean up conversations with specific users</li>
                                    <li>Bulk delete messages across multiple DMs</li>
                                    <li>Remove messages from a specific time period</li>
                                    <li>Automatically close inactive DMs after cleaning</li>
                                </ul>
                            </div>

                            <div class="tip-box">
                                <strong>Best Practices:</strong>
                                <ul class="feature-list">
                                    <li>Use date filters to target specific time periods</li>
                                    <li>Enable "Close DM" option for inactive conversations</li>
                                    <li>Start with a higher delay for safer operation (avoid rate limits</li>
                                    <li>Use search to find specific users quickly</li>
                                </ul>
                            </div>
                        </div>
                        
                        <div id="servers" class="feature-block">
                            <h3>Accessible Servers</h3>
                            <p>Manage your message history across servers you have access to, with powerful filtering options.</p>

                            <div class="tip-box">
                                <strong>When to Use:</strong>
                                <ul class="feature-list">
                                    <li>Clean up messages from servers you're leaving</li>
                                    <li>Remove messages from specific channels</li>
                                    <li>Bulk delete messages across multiple servers</li>
                                    <li>Target messages containing specific content</li>
                                </ul>
                            </div>

                            <div class="tip-box">
                                <strong>Best Practices:</strong>
                                <ul class="feature-list">
                                    <li>Use Channel ID for targeting specific channels</li>
                                    <li>Enable "Leave Server" for servers you're done with</li>
                                    <li>Use "Only Me" to focus on your messages</li>
                                    <li>Set reasonable delays to avoid rate limits</li>
                                </ul>
                            </div>
                        </div>
                        
                        <div id="media" class="feature-block">
                            <h3>Media Viewer</h3>
                            <p>Browse and download media from your Discord conversations with smart caching and organization.</p>

                            <div class="tip-box">
                                <strong>When to Use:</strong>
                                <ul class="feature-list">
                                    <li>Bulk download media from channels</li>
                                    <li>Save important media from conversations</li>
                                    <li>Find and organize shared content quickly with lower loading times</li>
                                    <li>Review media history with specific users or all dms at once</li>
                                </ul>
                            </div>

                            <div class="tip-box">
                                <strong>Key Controls:</strong>
                                <ul class="feature-list">
                                    <li>←/→: Navigate between media</li>
                                    <li>↑: Save current and go to next</li>
                                    <li>↓: Undo last save</li>
                                    <li>S: Save all media that is loaded</li>
                                    <li>F: Toggle fullscreen</li>
                                </ul>
                            </div>

                            <div class="tip-box">
                                <strong>Best Practices:</strong>
                                <ul class="feature-list">
                                    <li>Set save location before starting downloads</li>
                                    <li>Use filters to find specific types of media</li>
                                    <li>Enable duplicate detection to avoid duplicates</li>
                                </ul>
                            </div>
                        </div>

                        <div id="search" class="feature-block">
                            <h3>Enhanced Search</h3>
                            <p>The Enhanced Search feature provides powerful tools to search through all your Discord DM messages, with advanced filtering and bulk deletion capabilities.</p>

                            <div class="tip-box">
                                <strong>When to Use:</strong>
                                <ul class="feature-list">
                                    <li>Find specific messages or conversations</li>
                                    <li>Clean up messages matching certain criteria</li>
                                    <li>Locate and manage shared content</li>
                                    <li>Review message history by type</li>
                                </ul>
                            </div>

                            <div class="tip-box">
                                <strong>Search Tips:</strong>
                                <ul class="feature-list">
                                    <li>Use date ranges for targeted searches</li>
                                    <li>Filter by content type (images, links, etc.)</li>
                                    <li>Combine filters for precise results</li>
                                    <li>Use "Only Me" for your messages</li>
                                </ul>
                            </div>

                            <div class="tip-box">
                                <strong>Best Practices:</strong>
                                <ul class="feature-list">
                                    <li>Start with broad searches, then refine</li>
                                    <li>Review message count before bulk operations</li>
                                    <li>Use tabs to organize different content types</li>
                                    <li>Allow time for results to fully load</li>
                                </ul>
                            </div>
                        </div>
                        
                        <div id="wiper" class="feature-block">
                            <h3>Message Wiper</h3>
                            <p>A comprehensive tool for removing messages from your account using your Discord data file.</p>

                            <div class="tip-box">
                                <strong>When to Use:</strong>
                                <ul class="feature-list">
                                    <li>Complete account message cleanup</li>
                                    <li>Process closed or inaccessible channels</li>
                                    <li>Track deletion progress across sessions</li>
                                    <li>Manage large-scale message deletion</li>
                                </ul>
                            </div>

                            <div class="tip-box">
                                <strong>Best Practices:</strong>
                                <ul class="feature-list">
                                    <li>Lock channels you want to preserve</li>
                                    <li>Use filters to organize your view</li>
                                    <li>Monitor progress in the console for rate limits or other issues (unlikely but can happen)</li>
                                    <li>Keep the delay at least 2 seconds to avoid rate limits</li>
                                </ul>
                            </div>
                        </div>
                        
                        <div id="closed-dms" class="feature-block">
                            <h3>Find Closed DMs</h3>
                            <p>Locate and reopen closed DM channels using your Discord data file.</p>

                            <div class="tip-box">
                                <strong>When to Use:</strong>
                                <ul class="feature-list">
                                    <li>Recover old conversations</li>
                                    <li>Find specific users from past DMs</li>
                                    <li>Batch reopen many at once DMs</li>
                                    <li>Review past DM history</li>
                                </ul>
                            </div>

                            <div class="tip-box">
                                <strong>Best Practices:</strong>
                                <ul class="feature-list">
                                    <li>Process DMs in batches of 100 or less (dicord has a limit of 1000 open dms at a time)</li>
                                    <li>Wait between batches to avoid rate limits</li>
                                    <li>Use filters to find specific users</li>
                                    <li>Check message counts before reopening</li>
                                </ul>
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