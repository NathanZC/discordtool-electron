class DiscordAPI {
    constructor(token) {
        this.token = token;
        this.baseURL = 'https://discord.com/api/v9';
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
            return response.status === 200;
        } catch (error) {
            console.error('Token verification failed:', error);
            return false;
        }
    }
}

module.exports = { DiscordAPI }; 