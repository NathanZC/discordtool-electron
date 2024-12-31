const Console = require('../components/Console');

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
        content = null,
        authorId = null,
        channelId = null
    }) {
        try {
            // Build search parameters
            const params = new URLSearchParams();
            
            // Handle authorId as either single ID or array of IDs
            if (authorId) {
                if (Array.isArray(authorId)) {
                    // Discord's search API supports multiple author_id parameters
                    authorId.forEach(id => params.append('author_id', id));
                } else {
                    params.append('author_id', authorId);
                }
            } else if (!isGuild) {
                // For DMs, author_id is required
                if (!this.userId) {
                    throw new Error('User ID is required for searching DM messages');
                }
                params.append('author_id', this.userId);
            }

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

            // Add channel_id to search parameters if provided
            if (channelId && isGuild) {
                params.append('channel_id', channelId);
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
        channelOrGuildId, 
        channelName, 
        authorId = null, 
        beforeDate = null, 
        afterDate = null, 
        contentSearch = null,
        specificChannelId = null,
        deleteDelay = () => 1000,
        onProgress = null,
        isRunning = () => true,
        isGuild = false
    }) {
        console.log(`deleteChannelMessages started for ${isGuild ? 'server' : 'channel'}: ${channelName}`);
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
                    channelOrGuildId,
                    offset,
                    isGuild,
                    beforeDate,
                    afterDate,
                    content: contentSearch,
                    authorId: authorId,
                    channelId: specificChannelId
                });

                console.log("Search result:", searchResult ? "found messages" : "no messages found");

                if (stuckCount > 5) {
                    Console.warn(`Seems like we are stuck, restarting deletion for the current ${isGuild ? 'server' : 'DM'}`);
                    break;
                }

                if (!searchResult) {
                    if (!isRunning()) return stopDeletion();
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    Console.warn(`No messages found, attempt: ${stuckCount}`);
                    stuckCount++;
                    continue;
                }

                const { messages, totalResults } = searchResult;
                if (page === 1) {
                    total = totalResults;
                    Console.log(`Found ${total} messages to process`);
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
                            Console.log("Skipping message because not deletable");
                            seen.add(message.id);
                            offset++;
                        }
                    }
                }

                if (toDelete.length === 0 && offset === lastOffset) {
                    if (total > 0 && seen.size < total) {
                        Console.warn("No new messages found, waiting for Discord to index");
                        if (!isRunning()) return stopDeletion();
                        await new Promise(resolve => setTimeout(resolve, deleteDelay() * 3 + 10000));
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
                            Console.delete(`${channelName}: Deleted message: ${message.content}`);
                            if (onProgress) {
                                onProgress(deleteMessagesCount, total);
                            }
                        } else {
                            retryCount++;
                            if (retryCount < maxRetries && isRunning()) {
                                const currentDelay = typeof deleteDelay === 'function' ? deleteDelay() : deleteDelay;
                                const delayTime = currentDelay * (Math.pow(2, retryCount)) + 1000;
                                Console.warn(`Retry ${retryCount}/${maxRetries} in ${delayTime/1000}s...`);
                                await new Promise(resolve => setTimeout(resolve, delayTime));
                            } else {
                                Console.warn('Max retries reached. Skipping message.');
                                seen.add(message.id);
                                offset++;
                            }
                        }
                    }

                    if (!isRunning()) return stopDeletion();
                    const currentDelay = typeof deleteDelay === 'function' ? deleteDelay() : deleteDelay;
                    await new Promise(resolve => setTimeout(resolve, currentDelay));
                }

                if (seen.size >= total) {
                    Console.success(`Finished processing dm/server: ${channelName}`);
                    return {
                        success: true,
                        deletedCount: deleteMessagesCount,
                        total
                    };
                }

                page++;
                if (!isRunning()) return stopDeletion();
                Console.log(`Searching next page after ${deleteDelay() * 3 + 25000}ms delay`);
                await new Promise(resolve => setTimeout(resolve, deleteDelay() * 3 + 25000));

            } catch (error) {
                console.error("Error in deletion loop:", error);
                Console.error(`Error processing messages: ${error.message}`);
                if (!isRunning()) return stopDeletion();
                await new Promise(resolve => setTimeout(resolve, deleteDelay() * 2));
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

    async getMessageCountForUser(channelId, authorId = null, isGuild = false, specificChannelId = null) {
        console.log("getMessageCountForUser started");
        const headers = {
            Authorization: this.token
        };
        
        const params = new URLSearchParams();
        if (authorId) {
            params.append('author_id', authorId);
        }
        if (specificChannelId && isGuild) {
            params.append('channel_id', specificChannelId);
        }
        params.append('include_nsfw', 'true');

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
                        Console.warn(`Rate limited. Retrying in ${retryAfter} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                        retryCount++;
                        delay *= 2; // Exponential backoff
                    } else {
                        console.error(`Failed to fetch messages: ${response.status} - ${await response.text()}`);
                        return null;
                    }
                } catch (error) {
                    console.error('Error fetching message count:', error);
                    Console.error('Error fetching message count:', error);
                    retryCount++;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
            
            console.log('Max retries reached. Returning null.');
            return null;
        }

        try {
            let url;
            if (isGuild) {
                // For guild searches, we use the serverId directly
                url = `${this.baseURL}/guilds/${channelId}/messages/search`;
            } else {
                url = `${this.baseURL}/channels/${channelId}/messages/search`;
            }

            return await getMessageCount(url, params);
        } catch (error) {
            console.error('Error in getMessageCountForUser:', error);
            return null;
        }
    }

    async getAllAccessibleServers() {
        try {
            const response = await this.makeRequest('/users/@me/guilds');
            if (!response.ok) {
                throw new Error(`Failed to fetch servers: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Sort servers by name
            return data.sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            console.error('Failed to fetch servers:', error);
            throw error;
        }
    }

    async leaveServer(serverId) {
        try {
            const response = await this.makeRequest(
                `/users/@me/guilds/${serverId}`,
                {
                    method: 'DELETE'
                }
            );

            if (response.status === 204) {
                return true;
            }

            throw new Error(`Failed to leave server: ${response.status}`);
        } catch (error) {
            console.error('Error leaving server:', error);
            throw error;
        }
    }

}

module.exports = DiscordAPI; 