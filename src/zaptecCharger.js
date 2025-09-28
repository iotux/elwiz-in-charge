// src/zaptecCharger.js
const BaseCharger = require('./baseCharger');
const axios = require('axios');

class ZaptecCharger extends BaseCharger {
  constructor(chargerId, authManager) {
    super(chargerId, authManager);
    // Set the base URL for the Zaptec API.
    // Adjust this URL according to the official documentation.
    this.baseURL = 'https://api.zaptec.com/api';
    this.http = axios.create({
      baseURL: this.baseURL,
      timeout: 10000, // adjust timeout as needed
    });
  }

  // Helper to return the Authorization header
  _getAuthHeader() {
    return { 'Authorization': `Bearer ${this.authManager.accessToken}` };
  }

  // POST https://api.zaptec.com/api/chargers/{chargerId}/commands/pause
  async pause() {
    const url = `/chargers/${this.chargerId}/commands/pause`;
    try {
      const response = await this.http.post(url, null, {
        headers: this._getAuthHeader(),
      });
      return response;
    } catch (error) {
      // Enhance error handling as needed
      throw error;
    }
  }

  // POST https://api.zaptec.com/api/chargers/{chargerId}/commands/resume
  async resume() {
    const url = `/chargers/${this.chargerId}/commands/resume`;
    try {
      const response = await this.http.post(url, null, {
        headers: this._getAuthHeader(),
      });
      return response;
    } catch (error) {
      throw error;
    }
  }

  // POST https://api.zaptec.com/api/chargers/{chargerId}/commands/start
  async start() {
    const url = `/chargers/${this.chargerId}/commands/start`;
    try {
      const response = await this.http.post(url, null, {
        headers: this._getAuthHeader(),
      });
      return response;
    } catch (error) {
      throw error;
    }
  }

  // POST https://api.zaptec.com/api/chargers/{chargerId}/commands/stop
  async stop() {
    const url = `/chargers/${this.chargerId}/commands/stop`;
    try {
      const response = await this.http.post(url, null, {
        headers: this._getAuthHeader(),
      });
      return response;
    } catch (error) {
      throw error;
    }
  }

  // POST https://api.zaptec.com/api/chargers/{chargerId}/commands/toggle
  async toggle() {
    const url = `/chargers/${this.chargerId}/commands/toggle`;
    try {
      const response = await this.http.post(url, null, {
        headers: this._getAuthHeader(),
      });
      return response;
    } catch (error) {
      throw error;
    }
  }

  // GET https://api.zaptec.com/api/chargers/{chargerId}/state
  async getState() {
    const url = `/chargers/${this.chargerId}/state`;
    try {
      const response = await this.http.get(url, {
        headers: this._getAuthHeader(),
      });
      return response;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = ZaptecCharger;

