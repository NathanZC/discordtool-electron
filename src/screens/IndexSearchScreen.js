const BaseScreen = require('./BaseScreen');
const Console = require('../components/Console');
const DiscordAPI = require('../utils/discord');
const Store = require('electron-store');
const { shell } = require('electron');

class IndexSearchScreen extends BaseScreen {
    static TAB_ORDER = ['messages', 'links', 'media', 'files', 'pins'];

    constructor(token, userId, preloadedData = null) {
        super(token);
        this.api = new DiscordAPI(token, userId);
        this.userId = userId;
        this.isLoading = false;
        this.currentSearchTerm = '';
        this.currentSearchType = '';
        this.cursors = {};
        this.totalResults = {};
        this.loadedResults = {};
        this.openDMs = new Set(preloadedData?.dms?.map(dm => dm.id) || []);
        this.messageCounters = {};
        this.selectedMessages = new Map();
        this.loadAllInProgress = false;
        this.deleteInProgress = false;
        this.stopDeleteRequested = false;
    }

    async handleMessageJump(channelId, messageId) {
        // Check if this is a DM channel and if it's not open
        if (!this.openDMs.has(channelId)) {
            Console.log('DM channel not open, attempting to open...');
            try {
                const result = await this.api.openDM(channelId);
                
                if (result && result.recipients && result.recipients[0]) {
                    const username = result.recipients[0].username;
                    Console.success(`Successfully opened DM with ${username}`);
                    this.openDMs.add(channelId);
                } else {
                    Console.error('Failed to open DM channel');
                    return;
                }
            } catch (error) {
                Console.error('Error opening DM channel:', error);
                return;
            }
        }

        // Now that we're sure the DM is open (or it wasn't a DM), jump to the message
        shell.openExternal(`discord://discord.com/channels/@me/${channelId}/${messageId}`);
    }

    render(container) {
        container.innerHTML = `
            <div class="indexscreen-container">
                <div class="indexscreen-header">
                    <h1 class="indexscreen-title">Index Search</h1>
                    
                    <div class="indexscreen-search-box">
                        <div class="indexscreen-search-controls">
                            <input type="text" 
                                id="indexscreen-search-input" 
                                placeholder="Enter your search term... (This will search all dms!!!)"
                                class="indexscreen-input">
                            <button id="indexscreen-search-btn" class="indexscreen-button">
                                Search
                            </button>
                        </div>

                        <div class="indexscreen-selection-controls">
                            <span class="indexscreen-selected-count">0 messages selected</span>
                            <button id="indexscreen-select-loaded" class="indexscreen-button" disabled>Select All Loaded</button>
                            <button id="indexscreen-delete-selected" class="indexscreen-button indexscreen-button-danger" disabled>Delete Selected</button>
                            <div class="indexscreen-load-controls">
                                <button id="indexscreen-load-all" class="indexscreen-button" disabled>Load All</button>
                                <label class="indexscreen-only-me">
                                    <input type="checkbox" id="indexscreen-only-me-checkbox" checked>
                                    Only Me
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="indexscreen-results" class="indexscreen-results">
                    <!-- Initial tabs structure -->
                    <div class="indexsearch-tabs">
                        <button class="indexsearch-tab-button active" data-tab="messages">
                            Messages
                            <span class="indexsearch-tab-button-count">0</span>
                        </button>
                        <button class="indexsearch-tab-button" data-tab="links">
                            Links
                            <span class="indexsearch-tab-button-count">0</span>
                        </button>
                        <button class="indexsearch-tab-button" data-tab="media">
                            Media
                            <span class="indexsearch-tab-button-count">0</span>
                        </button>
                        <button class="indexsearch-tab-button" data-tab="files">
                            Files
                            <span class="indexsearch-tab-button-count">0</span>
                        </button>
                        <button class="indexsearch-tab-button" data-tab="pins">
                            Pins
                            <span class="indexsearch-tab-button-count">0</span>
                        </button>
                    </div>
                    <div class="indexsearch-results-container">
                        <div class="indexsearch-tab-content active" id="tab-messages">
                            <div class="indexsearch-messages">
                                <div class="indexsearch-loading">Loading messages...</div>
                            </div>
                        </div>
                        <div class="indexsearch-tab-content" id="tab-links">
                            <div class="indexsearch-messages">
                                <div class="indexsearch-loading">Loading links...</div>
                            </div>
                        </div>
                        <div class="indexsearch-tab-content" id="tab-media">
                            <div class="indexsearch-messages">
                                <div class="indexsearch-loading">Loading media...</div>
                            </div>
                        </div>
                        <div class="indexsearch-tab-content" id="tab-files">
                            <div class="indexsearch-messages">
                                <div class="indexsearch-loading">Loading files...</div>
                            </div>
                        </div>
                        <div class="indexsearch-tab-content" id="tab-pins">
                            <div class="indexsearch-messages">
                                <div class="indexsearch-loading">Loading pins...</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.setupEventListeners(container);
        this.loadInitialContent();
    }

    formatResultCount(count) {
        return count.toString();
    }

    async loadInitialContent() {
        try {
            // Get Only Me checkbox state
            const onlyMeCheckbox = document.querySelector('#indexscreen-only-me-checkbox');
            const onlyMe = onlyMeCheckbox?.checked ?? true; // Default to true if checkbox not found

            // Make a single request for all tab types with onlyMe parameter
            const response = await this.api.indexSearch('', 'all', { onlyMe });
            
            if (response.ok) {
                const data = await response.json();
                
                // Process each tab's data
                const tabsToProcess = ['messages', 'links', 'media', 'files', 'pins'];
                
                for (const tabType of tabsToProcess) {
                    const tabData = data.tabs[tabType];
                    
                    // Update tab counts
                    const tabButton = document.querySelector(`.indexsearch-tab-button[data-tab="${tabType}"]`);
                    if (tabButton) {
                        tabButton.querySelector('.indexsearch-tab-button-count').textContent = 
                            this.formatResultCount(tabData.total_results || 0);
                    }
                    
                    // Store cursor and results info
                    this.cursors[tabType] = tabData.cursor || null;
                    this.totalResults[tabType] = tabData.total_results || 0;
                    this.loadedResults[tabType] = tabData.messages?.flat().length || 0;
                    
                    // Update content
                    const tabContent = document.querySelector(`#tab-${tabType} .indexsearch-messages`);
                    if (tabContent) {
                        if (tabData.total_results > 0) {
                            tabContent.innerHTML = this.formatMessages(tabData.messages, tabType);
                            if (tabData.total_results > this.loadedResults[tabType]) {
                                tabContent.insertAdjacentHTML('afterend', `
                                    <div class="indexsearch-loading-more">
                                        Showing ${this.loadedResults[tabType]} of ${this.formatResultCount(tabData.total_results)} results
                                    </div>
                                `);
                            }
                        } else {
                            tabContent.innerHTML = `<div class="indexsearch-no-results">No ${tabType} found</div>`;
                        }
                    }
                }
                
                // Enable selection controls and load all button if we have any results
                const selectLoadedBtn = document.querySelector('#indexscreen-select-loaded');
                const loadAllBtn = document.querySelector('#indexscreen-load-all');
                const hasAnyResults = tabsToProcess.some(tabType => this.totalResults[tabType] > 0);
                
                if (selectLoadedBtn) {
                    selectLoadedBtn.disabled = !hasAnyResults;
                }
                if (loadAllBtn) {
                    loadAllBtn.disabled = !hasAnyResults;
                }
            }
        } catch (error) {
            Console.error('Error loading initial content:', error);
            // Update all tabs to show error state
            const tabsToProcess = ['messages', 'links', 'media', 'files', 'pins'];
            for (const tabType of tabsToProcess) {
                const tabContent = document.querySelector(`#tab-${tabType} .indexsearch-messages`);
                if (tabContent) {
                    tabContent.innerHTML = `
                        <div class="indexsearch-error">Error loading ${tabType}</div>
                    `;
                }
            }
        }
    }

    setupEventListeners(container) {
        const searchBtn = container.querySelector('#indexscreen-search-btn');
        const searchInput = container.querySelector('#indexscreen-search-input');
        const resultsContainer = container.querySelector('#indexscreen-results');

        // Add search event listeners
        searchBtn.addEventListener('click', () => this.performSearch());
        
        // Track previous input state
        let hadContent = searchInput.value.trim() !== '';
        
        // Update input listener to handle changes
        searchInput.addEventListener('input', () => {
            const isEmpty = searchInput.value.trim() === '';
            // Only trigger search when going from content to empty
            if (isEmpty && hadContent) {
                this.performSearch();
            }
            hadContent = !isEmpty;
        });
        
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });

        // Use event delegation for tab clicks
        resultsContainer.addEventListener('click', (e) => {
            const tabButton = e.target.closest('.indexsearch-tab-button');
            if (!tabButton) return;

            const tabButtons = container.querySelectorAll('.indexsearch-tab-button');
            tabButtons.forEach(btn => btn.classList.remove('active'));
            container.querySelectorAll('.indexsearch-tab-content')
                .forEach(content => content.classList.remove('active'));

            tabButton.classList.add('active');
            const tabContent = container.querySelector(`#tab-${tabButton.dataset.tab}`);
            if (tabContent) {
                tabContent.classList.add('active');
            }

            // Update Load All button state for the new tab
            this.updateLoadAllButtonState();
        });

        // Update scroll event listener
        resultsContainer.addEventListener('scroll', () => {
            if (this.isLoading || this.loadAllInProgress) return;

            const { scrollTop, scrollHeight, clientHeight } = resultsContainer;
            if (scrollHeight - scrollTop - clientHeight < 3500) {
                this.loadMore();
            }
        });

        // Update jump button click handler
        container.addEventListener('click', (e) => {
            if (e.target.classList.contains('indexsearch-jump-btn')) {
                const channelId = e.target.dataset.channelId;
                const messageId = e.target.dataset.messageId;
                if (channelId && messageId) {
                    this.handleMessageJump(channelId, messageId);
                }
            }
        });

        // Add selection control listeners
        const selectLoadedBtn = container.querySelector('#indexscreen-select-loaded');
        const deleteSelectedBtn = container.querySelector('#indexscreen-delete-selected');

        selectLoadedBtn.addEventListener('click', () => {
            // Check if all visible messages are selected
            const activeTab = document.querySelector('.indexsearch-tab-content.active');
            const ownMessages = activeTab.querySelectorAll('.indexsearch-message.own-message');
            const allSelected = Array.from(ownMessages).every(msg => 
                this.selectedMessages.has(msg.dataset.messageId)
            );

            if (allSelected) {
                // Unselect all
                ownMessages.forEach(message => {
                    this.selectedMessages.delete(message.dataset.messageId);
                });
                selectLoadedBtn.textContent = 'Select All Loaded';
            } else {
                // Select all own messages
                ownMessages.forEach(message => {
                    this.selectedMessages.set(message.dataset.messageId, message.dataset.channelId);
                });
                selectLoadedBtn.textContent = 'Unselect All Loaded';
            }

            this.updateSelectionUI();
        });

        deleteSelectedBtn.addEventListener('click', () => this.deleteSelected());

        // Add tab switch listener to clear selections
        container.querySelector('.indexsearch-tabs').addEventListener('click', (e) => {
            const tabButton = e.target.closest('.indexsearch-tab-button');
            if (tabButton) {
                this.selectedMessages.clear();
                this.updateSelectionUI();
            }
        });

        // Add checkbox selection listener using event delegation
        container.addEventListener('change', (e) => {
            if (e.target.classList.contains('indexsearch-message-select')) {
                // Add check for deleteInProgress
                if (this.deleteInProgress) {
                    e.preventDefault();
                    return;
                }
                
                const messageId = e.target.dataset.messageId;
                const channelId = e.target.dataset.channelId;
                
                if (e.target.checked) {
                    this.selectedMessages.set(messageId, channelId);
                } else {
                    this.selectedMessages.delete(messageId);
                }
                
                this.updateSelectionUI();
            }
        });

        // Add Load All button listener
        const loadAllBtn = container.querySelector('#indexscreen-load-all');
        loadAllBtn.addEventListener('click', () => this.loadAllResults());

        // Enable/disable Load All button when switching tabs
        container.querySelector('.indexsearch-tabs').addEventListener('click', (e) => {
            const tabButton = e.target.closest('.indexsearch-tab-button');
            if (tabButton) {
                // ... existing selection clear code ...
                this.updateLoadAllButtonState();
            }
        });

        // Update message click handler for selection
        container.addEventListener('click', (e) => {
            const messageElement = e.target.closest('.indexsearch-message');
            // Only handle clicks directly on the message, not on buttons or links within it
            if (messageElement && !e.target.closest('button') && !e.target.closest('a') && !this.deleteInProgress) {
                // Check if it's the user's own message
                if (messageElement.dataset.authorId !== this.userId) {
                    return; // Ignore clicks on messages that aren't yours
                }
                
                const messageId = messageElement.dataset.messageId;
                const channelId = messageElement.dataset.channelId;
                
                if (this.selectedMessages.has(messageId)) {
                    this.selectedMessages.delete(messageId);
                    messageElement.classList.remove('selected');
                } else {
                    this.selectedMessages.set(messageId, channelId);
                    messageElement.classList.add('selected');
                }
                
                this.updateSelectionUI();
            }
        });

        // Add Only Me checkbox listener
        const onlyMeCheckbox = container.querySelector('#indexscreen-only-me-checkbox');
        onlyMeCheckbox.addEventListener('change', () => {
            // Reload all tabs with new Only Me setting
            this.performSearch();
        });
    }

    async loadMore() {
        const activeTab = document.querySelector('.indexsearch-tab-content.active');
        if (!activeTab) return;

        const tabType = activeTab.id.replace('tab-', '');
        const cursor = this.cursors[tabType];
        
        // Check if we're already loading or if we've detected we're done
        if (this.isLoading || !cursor || cursor === 'done') {
            const loadingMore = activeTab.querySelector('.indexsearch-loading-more');
            if (loadingMore) {
                loadingMore.remove();
            }
            return;
        }

        this.isLoading = true;
        
        try {
            const onlyMeCheckbox = document.querySelector('#indexscreen-only-me-checkbox');
            const onlyMe = onlyMeCheckbox?.checked || false;
            const response = await this.api.indexSearch(
                this.currentSearchTerm, 
                tabType, 
                { 
                    cursor: {
                        timestamp: cursor.timestamp,
                        type: "timestamp"
                    },
                    onlyMe: onlyMe
                }
            );

            if (response.ok) {
                const data = await response.json();
                const tabData = data.tabs[tabType];
                
                if (tabData?.messages?.length) {
                    const messages = tabData.messages.flat();
                    
                    // Update cursor and loaded count
                    this.cursors[tabType] = tabData.cursor || 'done';
                    this.loadedResults[tabType] += messages.length;
                    
                    // Append new messages
                    const messagesContainer = activeTab.querySelector('.indexsearch-messages');
                    messagesContainer.insertAdjacentHTML('beforeend', this.formatMessages(messages, tabType));

                    // Update loading indicator
                    const loadingMore = activeTab.querySelector('.indexsearch-loading-more');
                    if (loadingMore) {
                        loadingMore.innerHTML = `Showing ${this.loadedResults[tabType]} of ${this.totalResults[tabType]} results`;
                    }
                } else {
                    // No more results
                    this.cursors[tabType] = 'done';
                    const loadingMore = activeTab.querySelector('.indexsearch-loading-more');
                    if (loadingMore) {
                        loadingMore.remove();
                    }
                }
            }
        } catch (error) {
            Console.error('Error loading more results:', error);
            const loadingMore = activeTab.querySelector('.indexsearch-loading-more');
            if (loadingMore) {
                loadingMore.innerHTML = 'Error loading more results. Scroll to try again.';
            }
        } finally {
            this.isLoading = false;
        }

        this.updateLoadAllButtonState();
    }

    async performSearch() {
        const searchInput = document.querySelector('#indexscreen-search-input');
        const resultsContainer = document.querySelector('#indexscreen-results');
        const searchTerm = searchInput.value.trim();
        const onlyMeCheckbox = document.querySelector('#indexscreen-only-me-checkbox');
        const onlyMe = onlyMeCheckbox?.checked ?? true; // Default to true if checkbox not found

        // Reset state
        this.currentSearchTerm = searchTerm;
        this.currentSearchType = 'all';  // Always use 'all' type
        this.cursors = {};
        this.isLoading = false;
        this.messageCounters = {};
        this.selectedMessages.clear(); // Clear selections when performing new search

        // If search is cleared and Only Me is not checked, return to initial state
        if (!searchTerm && !onlyMe) {
            // Reset to initial tabs view
            resultsContainer.innerHTML = `
                <div class="indexsearch-tabs">
                    <button class="indexsearch-tab-button active" data-tab="messages">
                        Messages
                        <span class="indexsearch-tab-button-count">0</span>
                    </button>
                    <button class="indexsearch-tab-button" data-tab="links">
                        Links
                        <span class="indexsearch-tab-button-count">0</span>
                    </button>
                    <button class="indexsearch-tab-button" data-tab="media">
                        Media
                        <span class="indexsearch-tab-button-count">0</span>
                    </button>
                    <button class="indexsearch-tab-button" data-tab="files">
                        Files
                        <span class="indexsearch-tab-button-count">0</span>
                    </button>
                    <button class="indexsearch-tab-button" data-tab="pins">
                        Pins
                        <span class="indexsearch-tab-button-count">0</span>
                    </button>
                </div>
                <div class="indexsearch-results-container">
                    <div class="indexsearch-tab-content active" id="tab-messages">
                        <div class="indexsearch-messages">
                            <div class="indexsearch-loading">Loading messages...</div>
                        </div>
                    </div>
                    <div class="indexsearch-tab-content" id="tab-links">
                        <div class="indexsearch-messages">
                            <div class="indexsearch-loading">Loading links...</div>
                        </div>
                    </div>
                    <div class="indexsearch-tab-content" id="tab-media">
                        <div class="indexsearch-messages">
                            <div class="indexsearch-loading">Loading media...</div>
                        </div>
                    </div>
                    <div class="indexsearch-tab-content" id="tab-files">
                        <div class="indexsearch-messages">
                            <div class="indexsearch-loading">Loading files...</div>
                        </div>
                    </div>
                    <div class="indexsearch-tab-content" id="tab-pins">
                        <div class="indexsearch-messages">
                            <div class="indexsearch-loading">Loading pins...</div>
                        </div>
                    </div>
                </div>
            `;
            
            // Re-setup event listeners and load initial content
            this.setupEventListeners(document);
            this.loadInitialContent();
            return;
        }

        resultsContainer.innerHTML = `
            <div class="indexscreen-loading">
                Searching ${onlyMe ? 'your' : 'all'} messages${searchTerm ? ` containing "${searchTerm}"` : ''}...
            </div>
        `;

        try {
            const response = await this.api.indexSearch(searchTerm, 'all', {
                cursor: null,
                onlyMe: onlyMe
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // Reset tracking objects
                this.cursors = {};
                this.totalResults = {};
                this.loadedResults = {};
                
                // Create tabs HTML
                let tabsHtml = '<div class="indexsearch-tabs">';
                let contentHtml = '<div class="indexsearch-results-container">';
                let firstTab = true;

                // Process tabs in fixed order
                for (const tabName of IndexSearchScreen.TAB_ORDER) {
                    const tabData = data.tabs[tabName] || { total_results: 0, messages: [] };
                    const displayName = tabName.charAt(0).toUpperCase() + tabName.slice(1);
                    const isActive = firstTab;
                    
                    // Store cursor and results info for this tab
                    this.cursors[tabName] = tabData.cursor || null;
                    this.totalResults[tabName] = tabData.total_results || 0;
                    this.loadedResults[tabName] = tabData.messages?.flat().length || 0;
                    
                    // Add tab button
                    tabsHtml += `
                        <button class="indexsearch-tab-button ${isActive ? 'active' : ''}" 
                                data-tab="${tabName}">
                            ${displayName}
                            <span class="indexsearch-tab-button-count">
                                ${this.formatResultCount(tabData.total_results)}
                            </span>
                        </button>
                    `;

                    // Add tab content
                    contentHtml += `
                        <div class="indexsearch-tab-content ${isActive ? 'active' : ''}" 
                             id="tab-${tabName}">
                            <div class="indexsearch-messages">
                                ${(!searchTerm && !onlyMe && tabName === 'messages')
                                    ? '<div class="indexsearch-no-results">Enter a search term to find messages</div>'
                                    : tabData.total_results > 0 
                                        ? this.formatMessages(tabData.messages, tabName)
                                        : `<div class="indexsearch-no-results">No ${displayName} found</div>`}
                            </div>
                            ${tabData.total_results > this.loadedResults[tabName] 
                                ? `<div class="indexsearch-loading-more">
                                    Showing ${this.loadedResults[tabName]} of ${this.formatResultCount(tabData.total_results)} results
                                   </div>` 
                                : ''}
                        </div>
                    `;

                    firstTab = false;
                }

                tabsHtml += '</div>';
                contentHtml += '</div>';

                // Set the HTML and add event listeners
                resultsContainer.innerHTML = tabsHtml + contentHtml;

                // Add click handlers for tabs
                const tabButtons = resultsContainer.querySelectorAll('.indexsearch-tab-button');
                tabButtons.forEach(button => {
                    button.addEventListener('click', () => {
                        // Remove active class from all tabs
                        tabButtons.forEach(btn => btn.classList.remove('active'));
                        resultsContainer.querySelectorAll('.indexsearch-tab-content')
                            .forEach(content => content.classList.remove('active'));

                        // Add active class to clicked tab
                        button.classList.add('active');
                        const tabContent = resultsContainer.querySelector(`#tab-${button.dataset.tab}`);
                        if (tabContent) {
                            tabContent.classList.add('active');
                        }
                    });
                });

                // Update Load All button state
                this.updateLoadAllButtonState();

            } else {
                resultsContainer.innerHTML = `
                    <div class="indexscreen-error">
                        Failed to search: ${response.status} ${response.statusText}
                    </div>
                `;
            }
        } catch (error) {
            resultsContainer.innerHTML = `
                <div class="indexscreen-error">
                    Error performing search: ${error.message}
                </div>
            `;
            Console.error('Search error:', error);
        }
    }

    formatMessages(messages, tabType) {
        if (!messages || messages.length === 0) {
            const onlyMeCheckbox = document.querySelector('#indexscreen-only-me-checkbox');
            const onlyMe = onlyMeCheckbox?.checked ?? true;
            if (tabType === 'messages' && !onlyMe) {
                return '<div class="indexsearch-no-results">Enter a search term to find messages</div>';
            }
            return '<div class="indexsearch-no-results">No results found</div>';
        }
        
        const flatMessages = messages.flat();
        if (!this.messageCounters[tabType]) {
            this.messageCounters[tabType] = 0;
        }
        
        return flatMessages.map((msg, index) => {
            this.messageCounters[tabType]++;
            const isOwnMessage = msg.author.id === this.userId;
            
            return `
                <div class="indexsearch-message ${isOwnMessage ? 'own-message' : ''}" 
                     data-message-id="${msg.id}" 
                     data-channel-id="${msg.channel_id}"
                     data-author-id="${msg.author.id}">
                    <div class="indexsearch-message-header">
                        <span class="indexsearch-message-number">#${this.messageCounters[tabType]}</span>
                        <img 
                            src="https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.webp" 
                            class="indexsearch-avatar" 
                            onerror="this.src='path/to/default/avatar.png'"
                        >
                        <span class="indexsearch-username">
                            ${msg.author.global_name || msg.author.username}
                        </span>
                        <span class="indexsearch-timestamp">
                            ${new Date(msg.timestamp).toLocaleString()}
                        </span>
                        <button class="indexsearch-jump-btn" data-channel-id="${msg.channel_id}" data-message-id="${msg.id}">
                            Jump
                        </button>
                    </div>
                    <div class="indexsearch-content">${msg.content}</div>
                    ${msg.attachments.length ? `
                        <div class="indexsearch-attachments">
                            ${msg.attachments.map(att => `
                                <div class="indexsearch-attachment">
                                    ${att.content_type?.startsWith('image/') 
                                        ? `<img src="${att.url}" alt="${att.filename}" style="max-width: 200px;">` 
                                        : att.filename}
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    updateSelectionUI() {
        const count = this.selectedMessages.size;
        const countDisplay = document.querySelector('.indexscreen-selected-count');
        const selectLoadedBtn = document.querySelector('#indexscreen-select-loaded');
        const deleteSelectedBtn = document.querySelector('#indexscreen-delete-selected');

        if (countDisplay) {
            countDisplay.textContent = `${count} message${count !== 1 ? 's' : ''} selected`;
        }

        if (selectLoadedBtn) {
            selectLoadedBtn.disabled = !document.querySelector('.indexsearch-message');
            // Update button text based on selection state
            const activeTab = document.querySelector('.indexsearch-tab-content.active');
            if (activeTab) {
                const messages = activeTab.querySelectorAll('.indexsearch-message');
                const allSelected = Array.from(messages).every(msg => 
                    this.selectedMessages.has(msg.dataset.messageId)
                );
                selectLoadedBtn.textContent = allSelected ? 'Unselect All Loaded' : 'Select All Loaded';
            }
        }

        if (deleteSelectedBtn) {
            deleteSelectedBtn.disabled = count === 0;
        }

        // Update all checkboxes to match selection state
        document.querySelectorAll('.indexsearch-message-select').forEach(checkbox => {
            checkbox.checked = this.selectedMessages.has(checkbox.dataset.messageId);
        });

        // Update visual selection state for all messages
        document.querySelectorAll('.indexsearch-message').forEach(message => {
            const messageId = message.dataset.messageId;
            if (this.selectedMessages.has(messageId)) {
                message.classList.add('selected');
            } else {
                message.classList.remove('selected');
            }
        });
    }

    selectAllLoaded() {
        const activeTab = document.querySelector('.indexsearch-tab-content.active');
        if (!activeTab) return;

        const messages = activeTab.querySelectorAll('.indexsearch-message.own-message');
        messages.forEach(message => {
            const messageId = message.dataset.messageId;
            const channelId = message.dataset.channelId;
            this.selectedMessages.set(messageId, channelId);
        });

        this.updateSelectionUI();
    }

    async deleteSelected() {
        if (this.deleteInProgress) {
            // If deletion is in progress, set the stop flag and return
            this.stopDeleteRequested = true;
            return;
        }

        this.deleteInProgress = true;
        this.stopDeleteRequested = false;
        
        // Update button state
        const deleteSelectedBtn = document.querySelector('#indexscreen-delete-selected');
        const selectLoadedBtn = document.querySelector('#indexscreen-select-loaded');
        
        if (deleteSelectedBtn) {
            deleteSelectedBtn.textContent = 'Stop Deletion';
        }
        if (selectLoadedBtn) selectLoadedBtn.disabled = true;

        try {
            const result = await this.api.deleteSelectedMessages(
                Array.from(this.selectedMessages.entries()),
                (current, total) => {
                    if (this.stopDeleteRequested) {
                        throw new Error('DELETION_STOPPED');
                    }
                    Console.log(`Deleting messages... ${current}/${total}`);
                }
            );

            if (this.stopDeleteRequested) {
                Console.warn('Deletion operation stopped by user');
            } else {
                Console.success(`Successfully deleted ${result.deletedCount} out of ${result.total} messages`);
            }
            
            // Clear selections after delete
            this.selectedMessages.clear();
            this.updateSelectionUI();

            // Refresh the current view
            this.performSearch();
        } catch (error) {
            if (error.message === 'DELETION_STOPPED') {
                Console.warn('Deletion operation stopped by user');
            } else {
                Console.error('Error deleting messages:', error);
            }
        } finally {
            this.deleteInProgress = false;
            this.stopDeleteRequested = false;
            
            // Reset button states
            if (deleteSelectedBtn) {
                deleteSelectedBtn.textContent = 'Delete Selected';
                deleteSelectedBtn.disabled = this.selectedMessages.size === 0;
            }
            if (selectLoadedBtn) selectLoadedBtn.disabled = false;
        }
    }

    async loadAllResults() {
        const loadAllBtn = document.querySelector('#indexscreen-load-all');
        const activeTab = document.querySelector('.indexsearch-tab-content.active');
        if (!activeTab) return;

        // If already in progress, stop the operation
        if (this.loadAllInProgress) {
            this.loadAllInProgress = false;
            loadAllBtn.textContent = 'Load All';
            loadAllBtn.classList.remove('indexscreen-button-danger');
            Console.log('Load all operation stopped by user');
            return;
        }

        const tabType = activeTab.id.replace('tab-', '');
        this.loadAllInProgress = true;
        loadAllBtn.textContent = 'Stop Loading';
        loadAllBtn.classList.add('indexscreen-button-danger');

        Console.log(`Starting load all for ${tabType}. Total results: ${this.totalResults[tabType]}, Currently loaded: ${this.loadedResults[tabType]}`);

        while (this.cursors[tabType] && this.cursors[tabType] !== 'done' && this.loadAllInProgress) {
            Console.log(`Loading more ${tabType}... (${this.loadedResults[tabType]}/${this.totalResults[tabType]})`);
            await this.loadMore();
            // Wait 1.5 seconds before next request
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

        this.loadAllInProgress = false;
        loadAllBtn.classList.remove('indexscreen-button-danger');
        
        // Only show "All Loaded" if we actually finished loading everything
        if (this.cursors[tabType] === 'done') {
            loadAllBtn.textContent = 'All Loaded';
            Console.log(`Finished loading ${tabType}. Final count: ${this.loadedResults[tabType]}/${this.totalResults[tabType]}`);
        } else {
            loadAllBtn.textContent = 'Load All';
            Console.log(`Stopped loading ${tabType}. Current count: ${this.loadedResults[tabType]}/${this.totalResults[tabType]}`);
        }
    }

    updateLoadAllButtonState() {
        const activeTab = document.querySelector('.indexsearch-tab-content.active');
        const loadAllBtn = document.querySelector('#indexscreen-load-all');
        
        if (!activeTab || !loadAllBtn) return;
        
        const tabType = activeTab.id.replace('tab-', '');
        const hasMoreToLoad = this.loadedResults[tabType] < this.totalResults[tabType];
        
        // Don't update button text if loading is in progress
        if (this.loadAllInProgress) {
            return;
        }
        
        loadAllBtn.disabled = !hasMoreToLoad;
        
        // Only update button text if we're not currently loading
        if (hasMoreToLoad) {
            loadAllBtn.textContent = 'Load All';
            loadAllBtn.classList.remove('indexscreen-button-danger');
        } else {
            loadAllBtn.textContent = 'All Loaded';
        }
    }
}

module.exports = IndexSearchScreen; 