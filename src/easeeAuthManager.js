// src/easeeAuthManager.js
const BaseAuthManager = require('./baseAuthManager');

class EaseeAuthManager extends BaseAuthManager {
  constructor(config, credentialFilePath) {
    // Easee API settings:
    const baseURL = 'https://api.easee.com/api';
    const defaultHeaders = {
      'accept': 'application/json',
      'content-type': 'application/*+json'
    };
    super(config, credentialFilePath, baseURL, defaultHeaders);
  }

  async authenticate() {
    this.ensureDirectoryExistence(this.credentialFile);
    let credentials = this.loadCredentials();

    if (!credentials.accessToken || !credentials.refreshToken) {
      console.log('No valid credentials found, starting Easee authentication...');
      credentials.userName = await this.askQuestion('Please enter your username: ');
      const confirmUserName = await this.askQuestion('Confirm your username: ');
      if (credentials.userName !== confirmUserName) {
        throw new Error('Usernames do not match');
      }
      credentials.password = await this.askQuestion('Please enter your password: ');
      const confirmPassword = await this.askQuestion('Confirm your password: ');
      if (credentials.password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }
    }

    try {
      const payload = {
        userName: credentials.userName,
        password: credentials.password
      };
      // The curl example shows a header: Authorization: Bearer xxxx.
      // For the initial login (when no valid token is available) you can use a placeholder.
      const response = await this.http.post('/accounts/login', payload, {
        headers: {
          'Authorization': 'Bearer xxxx'
        }
      });
      
      if (!response.data.accessToken) {
        throw new Error('Authentication failed: No access token received');
      }
      
      credentials.accessToken = response.data.accessToken;
      credentials.refreshToken = response.data.refreshToken;
      credentials.expiresIn = response.data.expiresIn;
    } catch (error) {
      throw new Error(`Easee login error: ${error.message}`);
    }
    
    this.saveCredentials(credentials);
    this.isAuthenticated = true;
    this.accessToken = credentials.accessToken;
    this.refreshToken = credentials.refreshToken;
    this.expireTime = Date.now() + (credentials.expiresIn * 1000);
    
    this.scheduleTokenRefresh(this.config.authInterval || credentials.expiresIn);
    this.close();
  }

  scheduleTokenRefresh(expiresIn) {
    console.log('expiresIn:', expiresIn)
    const refreshTime = Math.max((expiresIn - 10) * 1000, 0); // refresh 10 seconds before expiry
    console.log('refreshTime:', refreshTime)
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => this.refreshAccessToken(), refreshTime);
  }

  async refreshAccessToken() {
    try {
      const payload = { refreshToken: this.refreshToken };
      const response = await this.http.post('/accounts/refresh_token', payload, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
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
      
      this.scheduleTokenRefresh(this.config.authInterval || credentials.expiresIn);
    } catch (error) {
      console.error('Error during Easee token refresh:', error.message);
    }
  }
}

module.exports = EaseeAuthManager;

