// src/baseAuthManager.js
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const axios = require('axios');

class BaseAuthManager{
  /**
   * @param {object} config - Configuration (may include additional options).
   * @param {string} credentialFilePath - Path to the credentials file.
   * @param {string} baseURL - Base URL for the vendor’s API.
   * @param {object} defaultHeaders - Default HTTP headers for the API.
   */
  constructor(config, credentialFilePath, baseURL, defaultHeaders) {
    this.config = config;
    this.credentialFile = credentialFilePath;
    this.baseURL = baseURL;
    this.defaultHeaders = defaultHeaders;
    this.authInterval = config.authInterval || 3600;
    this.isAuthenticated = false;
    this.accessToken = null;
    this.refreshToken = null;
    this.expireTime = 0;
    
    // Create an axios instance using the given base URL and headers.
    this.http = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: this.defaultHeaders
    });
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async askQuestion(query) {
    return new Promise((resolve) => {
      this.rl.question(query, (answer) => resolve(answer));
    });
  }

  ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
      fs.mkdirSync(dirname, { recursive: true });
    }
    return true;
  }

  loadCredentials() {
    if (fs.existsSync(this.credentialFile)) {
      try {
        return JSON.parse(fs.readFileSync(this.credentialFile, 'utf8'));
      } catch (err) {
        console.error('Error reading credentials file, starting fresh:', err);
        return {};
      }
    }
    return {};
  }

  saveCredentials(credentials) {
    fs.writeFileSync(
      this.credentialFile,
      JSON.stringify(credentials, null, 2),
      { mode: 0o600, encoding: 'utf8' }
    );
  }

  scheduleTokenRefresh(expiresIn = this.authInterval) {
    const refreshTime = Math.max((expiresIn - 10) * 1000, 0); // Ensure non-negative delay
   if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => this.refreshAccessToken(), refreshTime);
  }

  // Generic retry function for authentication
  async retryAuthentication(initialDelay = 5000, backoffFactor = 2) {
    let delay = initialDelay;
    while (true) {
      try {
        await this.authenticate();
        console.log('Authentication succeeded.');
        break; // Exit loop if authentication is successful.
      } catch (error) {
        console.error(`Authentication failed: ${error.message}. Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= backoffFactor;
      }
    }
  }

  // Subclasses must implement these methods
  async authenticate() {
    throw new Error('authenticate() must be implemented in subclass');
  }

  async refreshAccessToken() {
    throw new Error('refreshAccessToken() must be implemented in subclass');
  }
  
  close() {
    this.rl.close();
  }
}

module.exports = BaseAuthManager;

