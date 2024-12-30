class DiscordAPI {
    constructor(token, userId = null) {
        this.token = token;
        this.baseURL = 'https://discord.com/api/v9';
        this.userId = userId;
    }

    async makeRequest(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const defaultOptions = {
            headers: {
                Authorization: `${this.token}`
            }
        };

        try {
            const response = await fetch(url, { ...defaultOptions, ...options });
            return response;
        } catch (error) {
            console.error(`Request failed for ${endpoint}:`, error);
            throw error;
        }
    }

    async verifyToken(token) {
        try {
            const response = await this.makeRequest('/users/@me');
            if (response.status === 200) {
                const userData = await response.json();
                return {
                    isValid: true,
                    userId: userData.id
                };
            }
            return {
                isValid: false,
                userId: null
            };
        } catch (error) {
            console.error('Token verification failed:', error);
            return {
                isValid: false,
                userId: null
            };
        }
    }

    async getAllOpenDMs() {
        try {
            const response = await this.makeRequest('/users/@me/channels');
            if (!response.ok) {
                throw new Error(`Failed to fetch DMs: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Sort DMs by last_message_id (most recent first)
            return data.sort((a, b) => {
                const lastA = a.last_message_id ? BigInt(a.last_message_id) : BigInt(-1);
                const lastB = b.last_message_id ? BigInt(b.last_message_id) : BigInt(-1);
                // Convert the comparison to a regular number (-1, 0, or 1)
                return lastB > lastA ? 1 : lastB < lastA ? -1 : 0;
            });
        } catch (error) {
            console.error('Failed to fetch DMs:', error);
            throw error;
        }
    }

    async deleteMessage(channelId, messageId) {
        try {
            const response = await this.makeRequest(
                `/channels/${channelId}/messages/${messageId}`,
                {
                    method: 'DELETE'
                }
            );

            // Discord returns 204 No Content for successful deletions
            if (response.status === 204) {
                return true;
            }

            const errorText = await response.text();
            console.error(`Failed to delete message ${messageId}: ${response.status} - ${errorText}`);
            return false;
        } catch (error) {
            console.error(`Error deleting message ${messageId}:`, error);
            return false;
        }
    }

    async searchMessages({
        channelOrGuildId,
        offset = 0,
        isGuild = false,
        beforeDate = null,
        afterDate = null,
        content = null
    }) {
        try {
            if (!this.userId) {
                throw new Error('User ID is required for searching messages');
            }

            // Build search parameters
            const params = new URLSearchParams();
            
            // Always include the authenticated user's ID
            params.append('author_id', this.userId);
            if (offset) params.append('offset', offset);
            if (beforeDate) params.append('max_id', beforeDate);
            if (afterDate) params.append('min_id', afterDate);
            if (content) params.append('content', content);
            
            // Set endpoint based on whether it's a guild or channel search
            const endpoint = isGuild
                ? `/guilds/${channelOrGuildId}/messages/search`
                : `/channels/${channelOrGuildId}/messages/search`;

            // Add include_nsfw for guild searches
            if (isGuild) {
                params.append('include_nsfw', 'true');
            }

            // Make the request with search parameters
            const response = await this.makeRequest(
                `${endpoint}?${params.toString()}`,
                {
                    method: 'GET'
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Failed to fetch messages: ${response.status} - ${errorText}`);
                return null;
            }

            const data = await response.json();

            // Flatten and sort messages
            const messages = data.messages
                .flat()
                .sort((a, b) => {
                    // Convert to BigInt and return -1, 0, or 1
                    const idA = BigInt(a.id);
                    const idB = BigInt(b.id);
                    // Convert the comparison to a regular number (-1, 0, or 1)
                    return idB > idA ? 1 : idB < idA ? -1 : 0;
                });

            return {
                messages,
                totalResults: parseInt(data.total_results)
            };

        } catch (error) {
            console.error('Error searching messages:', error);
            return null;
        }
    }

    async deleteChannelMessages({
        channelId, 
        channelName, 
        authorId = null, 
        beforeDate = null, 
        afterDate = null, 
        contentSearch = null,
        deleteDelay = 1000,
        onProgress = null,
        onLog = console.log,
        isRunning = () => true
    }) {
        console.log("deleteChannelMessages started");
        const seen = new Set();
        let page = 1;
        let offset = 0;
        let total = 0;
        let deleteMessagesCount = 0;
        let stuckCount = 0;

        const stopDeletion = () => {
            return {
                success: false,
                deletedCount: deleteMessagesCount,
                total,
                stopped: true
            };
        };

        while (true) {
            if (!isRunning()) return stopDeletion();

            try {
                console.log("Searching messages...");
                const searchResult = await this.searchMessages({
                    channelOrGuildId: channelId,
                    authorId,
                    offset,
                    isGuild: false,
                    beforeDate,
                    afterDate,
                    content: contentSearch
                });

                console.log("Search result:", searchResult ? "found messages" : "no messages found");

                if (stuckCount > 5) {
                    onLog("Seems like we are stuck, restarting deletion for the current DM");
                    break;
                }

                if (!searchResult) {
                    if (!isRunning()) return stopDeletion();
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    onLog(`No messages found, attempt: ${stuckCount}`);
                    stuckCount++;
                    continue;
                }

                const { messages, totalResults } = searchResult;
                if (page === 1) {
                    total = totalResults;
                    onLog(`Found ${total} messages to process`);
                }

                const toDelete = [];
                const lastOffset = offset;

                for (const message of messages) {
                    if (!seen.has(message.id)) {
                        if (message.type === 0 || (message.type >= 6 && message.type <= 21)) {
                            toDelete.push({
                                id: message.id,
                                content: message.content,
                                channelId: message.channel_id
                            });
                        } else {
                            onLog("Skipping message because not deletable");
                            seen.add(message.id);
                            offset++;
                        }
                    }
                }

                if (toDelete.length === 0 && offset === lastOffset) {
                    if (total > 0 && seen.size < total) {
                        onLog("No new messages found, waiting for Discord to index");
                        if (!isRunning()) return stopDeletion();
                        await new Promise(resolve => setTimeout(resolve, deleteDelay * 3 + 10000));
                        stuckCount++;
                        continue;
                    }
                }

                for (const message of toDelete) {
                    if (!isRunning()) return stopDeletion();

                    let retryCount = 0;
                    const maxRetries = 5;
                    let deleted = false;

                    while (retryCount < maxRetries && !deleted && isRunning()) {
                        deleted = await this.deleteMessage(message.channelId, message.id);
                        
                        if (deleted) {
                            deleteMessagesCount++;
                            seen.add(message.id);
                            onLog(`${channelName}: Deleted message: ${message.content}`);
                            if (onProgress) {
                                onProgress(deleteMessagesCount, total);
                            }
                        } else {
                            retryCount++;
                            if (retryCount < maxRetries && isRunning()) {
                                const delayTime = deleteDelay * (Math.pow(2, retryCount)) + 1000;
                                onLog(`Retry ${retryCount}/${maxRetries} in ${delayTime/1000}s...`);
                                await new Promise(resolve => setTimeout(resolve, delayTime));
                            } else {
                                onLog('Max retries reached. Skipping message.');
                                seen.add(message.id);
                                offset++;
                            }
                        }
                    }

                    if (!isRunning()) return stopDeletion();
                    await new Promise(resolve => setTimeout(resolve, deleteDelay));
                }

                if (seen.size >= total) {
                    onLog(`Finished processing DM channel: ${channelName}`);
                    return {
                        success: true,
                        deletedCount: deleteMessagesCount,
                        total
                    };
                }

                page++;
                if (!isRunning()) return stopDeletion();
                onLog(`Searching next page after ${deleteDelay * 3 + 25000}ms delay`);
                await new Promise(resolve => setTimeout(resolve, deleteDelay * 3 + 25000));

            } catch (error) {
                console.error("Error in deletion loop:", error);
                onLog(`Error processing messages: ${error.message}`);
                if (!isRunning()) return stopDeletion();
                await new Promise(resolve => setTimeout(resolve, deleteDelay * 2));
            }
        }

        return stopDeletion();
    }

    async closeDM(channelId) {
        try {
            const response = await this.makeRequest(
                `/channels/${channelId}`,
                {
                    method: 'DELETE'
                }
            );

            if (response.status === 200) {
                return true;
            }

            throw new Error(`Failed to close DM: ${response.status}`);
        } catch (error) {
            console.error('Error closing DM:', error);
            throw error;
        }
    }

    async getMessageCountForUser(channelId, authorId = null) {
        const headers = {
            Authorization: this.token
        };
        
        const params = new URLSearchParams();
        if (authorId) {
            params.append('author_id', authorId);
        }

        async function getMessageCount(url, params, delay = 1000, maxRetries = 5) {
            let retryCount = 0;
            
            while (retryCount < maxRetries) {
                try {
                    const response = await fetch(`${url}?${params.toString()}`, { headers });
                    
                    if (response.ok) {
                        const data = await response.json();
                        return data.total_results || 0;
                    } else if (response.status === 429) {
                        const retryAfter = parseInt(response.headers.get('Retry-After') || delay/1000) + 1;
                        console.log(`Rate limited. Retrying in ${retryAfter} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                        retryCount++;
                        delay *= 2; // Exponential backoff
                    } else {
                        console.error(`Failed to fetch messages: ${response.status} - ${await response.text()}`);
                        return null;
                    }
                } catch (error) {
                    console.error('Error fetching message count:', error);
                    retryCount++;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
            
            console.log('Max retries reached. Returning null.');
            return null;
        }

        try {
            // Check channel type
            const channelResponse = await this.makeRequest(`/channels/${channelId}`);
            if (!channelResponse.ok) {
                throw new Error(`Failed to get channel info: ${channelResponse.status}`);
            }

            const channelData = await channelResponse.json();
            let url;

            if (channelData.type === 0) { // Guild channel
                const serverId = channelData.guild_id;
                url = `${this.baseURL}/guilds/${serverId}/messages/search`;
                params.append('channel_id', channelId);
            } else { // DM channel
                url = `${this.baseURL}/channels/${channelId}/messages/search`;
            }

            return await getMessageCount(url, params);
        } catch (error) {
            console.error('Error in getMessageCountForUser:', error);
            return null;
        }
    }

}

module.exports = DiscordAPI; 