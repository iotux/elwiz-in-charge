// src/zaptecAuthManager.js
const BaseAuthManager = require('./baseAuthManager');

class ZaptecAuthManager extends BaseAuthManager {
  constructor(config, credentialFilePath) {
    // Zaptec API settings (adjust the base URL and headers as needed):
    const baseURL = 'https://api.zaptec.com/api';
    const defaultHeaders = {
      'accept': 'application/json',
      'content-type': 'application/json'
    };
    super(config, credentialFilePath, baseURL, defaultHeaders);
  }

  async authenticate() {
    this.ensureDirectoryExistence(this.credentialFile);
    let credentials = this.loadCredentials();

    if (!credentials.accessToken || !credentials.refreshToken) {
      console.log('No valid credentials found, starting Zaptec authentication...');
      credentials.userName = await this.askQuestion('Please enter your Zaptec username: ');
      const confirmUserName = await this.askQuestion('Confirm your username: ');
      if (credentials.userName !== confirmUserName) {
        throw new Error('Usernames do not match');
      }
      credentials.password = await this.askQuestion('Please enter your Zaptec password: ');
      const confirmPassword = await this.askQuestion('Confirm your password: ');
      if (credentials.password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }
    }

    try {
      // Note: Adjust the payload property names if necessary.
      const payload = {
        username: credentials.userName,
        password: credentials.password
      };
      // For example, assume Zaptec’s login endpoint is /auth/login.
      const response = await this.http.post('/auth/login', payload);
      
      if (!response.data.accessToken) {
        throw new Error('Zaptec authentication failed: No access token received');
      }
      
      credentials.accessToken = response.data.accessToken;
      credentials.refreshToken = response.data.refreshToken;
      credentials.expiresIn = response.data.expiresIn;
    } catch (error) {
      throw new Error(`Zaptec login error: ${error.message}`);
    }
    
    this.saveCredentials(credentials);
    this.isAuthenticated = true;
    this.accessToken = credentials.accessToken;
    this.refreshToken = credentials.refreshToken;
    this.expireTime = Date.now() + (credentials.expiresIn * 1000);
    
    this.scheduleTokenRefresh(this.refreshToken, credentials.expiresIn);
    this.close();
  }

  async refreshAccessToken() {
    try {
      const payload = { refreshToken: this.refreshToken };
      // For example, assume the refresh endpoint is /auth/refresh_token.
      const response = await this.http.post('/auth/refresh_token', payload, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}` // if Zaptec requires this header
        }
      });
      let credentials = this.loadCredentials();
      credentials.accessToken = response.data.accessToken;
      credentials.refreshToken = response.data.refreshToken;
      credentials.expiresIn = response.data.expiresIn;
      
      this.saveCredentials(credentials);
      this.accessToken = credentials.accessToken;
      this.refreshToken = credentials.refreshToken;
      this.expireTime = Date.now() + (credentials.expiresIn * 1000);
      
      this.scheduleTokenRefresh(this.refreshToken, credentials.expiresIn);
    } catch (error) {
      console.error('Error during Zaptec token refresh:', error.message);
    }
  }
}

module.exports = ZaptecAuthManager;

