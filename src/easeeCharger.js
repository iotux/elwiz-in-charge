// src/easeeCharger.js
const axios = require("axios");
const { formatISO } = require("date-fns");
const { getDateTime } = require("./utils");
const BaseCharger = require("./baseCharger");
//const EnergyHandler = require('./energyHandler');
//const energy = new EnergyHandler();
const debug = false;

class EaseeCharger extends BaseCharger {
  constructor(chargerId, authManager, energyHandler) {
    super(chargerId, authManager);
    this.baseURL = "https://api.easee.com/api";
    this.http = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
    });
    
    // Add response interceptor to handle 401 errors globally
    this.http.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        
        if (error.response && error.response.status === 401 && !originalRequest._retry) {
          console.log('401 error received, attempting to reauthenticate...');
          originalRequest._retry = true;
          
          try {
            await this.authManager.authenticate();
            console.log('Reauthentication successful, retrying API call...');
            
            // Update the auth header with the new token
            originalRequest.headers.Authorization = `Bearer ${this.authManager.accessToken}`;
            
            // Retry the original request
            return this.http(originalRequest);
          } catch (reauthError) {
            console.error('Reauthentication failed:', reauthError.message);
            throw reauthError;
          }
        }
        
        return Promise.reject(error);
      }
    );
    
    this.chargerId = chargerId;
    this.latestNativeState = null;
    this.latestState = null;
    this.forcedOn = false;
    this.forcedOff = false;
    this.isBelowThreshold = null;

    // Store the shared EnergyHandler instance
    this.energy = energyHandler;
  }

  // Helper method to handle API calls with 401 error retry logic
  async _makeAuthenticatedRequest(requestFn) {
    try {
      return await requestFn();
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log('401 error received, attempting to reauthenticate...');
        try {
          await this.authManager.authenticate();
          console.log('Reauthentication successful, retrying API call...');
          // Retry the request after reauthenticating
          return await requestFn();
        } catch (reauthError) {
          console.error('Reauthentication failed:', reauthError.message);
          throw reauthError;
        }
      } else {
        throw error;
      }
    }
  }

  // Helper to return the Authorization header
  _getAuthHeader() {
    return { Authorization: `Bearer ${this.authManager.accessToken}` };
  }

  async _sessionStatus(obj) {
    let isCharging = false;
    let isConnected = false;
    let mode = null;

    switch (obj.opMode) {
      // Second column of comments are from the evcc.io API documentation
      case 0: // isOffline    // ModeOffline       api.StatusF
        mode = "statusF";
        break;
      case 1: // notConnected // ModeDisconnected. api.StatusA
        mode = mode || "statusA";
        break;
      case 2: // wait4Start   // ModeAwaitinStart  api.StatusB
        mode = "statusB";
        isConnected = true;
        isCharging = true;
        break;
      case 3: // isCharging   // ModeCharging      api.StatusC
        mode = mode || "statusC";
        isConnected = true;
        isCharging = true;
        break;
      case 4: // isCompleted  // ModeCompleted     api.StatusB
        mode = "statusB";
        isConnected = true;
        isCharging = false;
        break;
      case 5: // error        // ModeError
        mode = "statusF";
        break;
      case 6: // isReady      // ModeReadyToCharge api.StatusB
        mode = mode || "statusB";
        isConnected = true;
        isCharging = true;
        break;
      default:
        console.error(`Unknown opMode: ${obj.opMode}`);
        isConnected = true;
    }

    //if (obj.opMode === 4) isCharging = false;

    switch (obj.noCurrentCode) {
      case 0: // Charger is OK
      case 1: // Max circuit current too low
      case 2: // Max dynamic circuit current too low
      case 3: // Max dynamic offline fallback circuit current too low
      case 4: // Circuit fuse too low
      case 5: // Waiting in queue
      case 6: // Waiting in fully charged queue, EV Charging complete
      case 25: // Current limited by circuit fuse
      case 26: // Current limited by circuit max current
      case 27: // Current limited by dynamic charger current
      case 28: // Current limited by equalizer
      case 29: // Current limited by circuit load balancing
      case 30: // Current limited by offline settings
      case 77: // Current linited by carger max current
      case 80: // Local adjustment (current ramping up)
      case 81: // Current linited by car
        isCharging = true;
        break;
      //case 5:  // WAiting in queue
      case 50: // No car connected
      case 51: // Max charge current too low
      case 52: // Max dynamic current too low
      case 54: // Pending scheduled charging
      case 76: // Current limited by schedule
      case 79: // Car not charging (finished charging)
      case 82: // Unknown (not documented)
      case 100: // Undefined error
        isCharging = false;
        break;
      default:
        console.error(`Unknown noCurrentCode: ${obj.noCurrentCode}`);
        isCharging = false;
    }

    this.latestState.opMode = obj.opMode;
    this.latestState.noCurrentCode = obj.noCurrentCode;
    this.latestState.chargerMode = mode;
    this.latestState.isConnected = isConnected;
    //this.latestState.isChargingActive = isCharging;
    return [isConnected, isCharging, mode];
  }

  async _determineStateChange(obj) {
    // currentState is a subset of the full state with added data
    // actualCurrent is calculated from the 3-pahse currents
    const currentState = {
      timeStamp: getDateTime(), // Optionally add the timestamp here
      latestPulse: formatISO(obj.latestPulse),
      opMode: obj.chargerOpMode, // Mapped from chargerOpMode
      noCurrentCode: obj.reasonForNoCurrent, // Mapped from reasonForNoCurrent
      totalPower: obj.totalPower,
      sessionEnergy: obj.sessionEnergy,
      energyPerHour: obj.energyPerHour,
      outputCurrent: obj.outputCurrent,
      voltage: obj.voltage,
      actualCurrent: await this.energy.calculateCurrent(
        obj.circuitTotalPhaseConductorCurrentL1,
        obj.circuitTotalPhaseConductorCurrentL2,
        obj.circuitTotalPhaseConductorCurrentL3,
      ),
      // NB! for testing
      //actualCurrent: 0.01,
    };

    // If latestState hasn't been set yet, initialize it and consider it a change.
    if (!this.latestState) {
      this.latestState = currentState;
      return true;
    }

    // Compare each key in the current state to the stored latest state
    const hasChanged = Object.keys(currentState).some(
      (key) => currentState[key] !== this.latestState[key],
    );

    // If any state has changed, update the latest state
    if (hasChanged) {
      this.latestState = currentState;
    }

    await this._sessionStatus(currentState);

    //currentState.realtimeEnergy = await this.energy.setEnergyByCurrent(
    await this.energy.setEnergyByCurrent(
      currentState.actualCurrent,
      currentState.voltage,
    );
    currentState.power = await this.energy.getPower();
    currentState.realtimeEnergy = await this.energy.getSessionEnergy();
    currentState.hourlyEnergy = await this.energy.getHourlyEnergy();
    currentState.isChargingActive = currentState.actualCurrent !== 0;
    currentState.isChargingFinished =
      currentState.opMode === 4 || currentState.opMode === 1;
    //await this._sessionStatus(currentState);
    return hasChanged;
  }

  // GET https://api.easee.com/api/chargers/{chargerId}/state
  async getState() {
    const url = `/chargers/${this.chargerId}/state`;
    
    const requestFn = async () => {
      const response = await this.http.get(url, {
        headers: this._getAuthHeader(),
      });
      // Update full state with a timestamp.
      this.latestNativeState = Object.assign({}, response.data, {
        timeStamp: getDateTime(),
      });
      await this._determineStateChange(this.latestNativeState);
      if (debug) console.log("easeeCharger:", this.latestState);
      return response.data;
    };
    
    return await this._makeAuthenticatedRequest(requestFn);
  }

  async setState(state) {
    // Implement this method to set the charger state
  }

  async getLatestState() {
    if (!this.latestState) {
      // On startup, get the initial state
      await this.getState();
    }
    // Update the state with the latest power and kWh values
    const state = this.latestState;
    state.power = await this.energy.getPower();
    state.realtimeEnergy = await this.energy.getSessionEnergy();
    state.hourlyEnergy = await this.energy.getHourlyEnergy();
    //if (state.opMode === 1) {
    // Handled in charger.js
    //  await this.energy.setSessionEnergy(0)
    //}
    if (debug) console.log("getLatestState", state);
    return state;
  }

  // POST https://api.easee.com/api/chargers/{chargerId}/commands/set_dynamic_charger_current
  async setChargingCurrent(current = 10, duration = 60) {
    const url = `/chargers/${this.chargerId}/commands/set_dynamic_charger_current`;
    const requestData = { amps: current, minutes: duration };
    
    const requestFn = async () => {
      return await this.http.post(url, requestData, {
        headers: this._getAuthHeader(),
      });
    };
    
    return await this._makeAuthenticatedRequest(requestFn);
  }

  async setChargingPower(kW = 2, duration = 60) {
    const current = (kW * 1000) / (await this.energy.getVoltage());
    return await this.setChargingCurrent(current, duration);
  }

  // POST https://api.easee.com/api/chargers/{chargerId}/commands/pause_charging
  async pause() {
    const url = `/chargers/${this.chargerId}/commands/pause_charging`;
    
    const requestFn = async () => {
      return await this.http.post(url, null, {
        headers: this._getAuthHeader(),
      });
    };
    
    return await this._makeAuthenticatedRequest(requestFn);
  }

  // POST https://api.easee.com/api/chargers/{chargerId}/commands/resume_charging
  async resume() {
    const url = `/chargers/${this.chargerId}/commands/resume_charging`;
    
    const requestFn = async () => {
      return await this.http.post(url, null, {
        headers: this._getAuthHeader(),
      });
    };
    
    return await this._makeAuthenticatedRequest(requestFn);
  }

  // POST https://api.easee.com/api/chargers/{chargerId}/commands/start_charging
  async start() {
    const url = `/chargers/${this.chargerId}/commands/start_charging`;
    
    const requestFn = async () => {
      return await this.http.post(url, null, {
        headers: this._getAuthHeader(),
      });
    };
    
    return await this._makeAuthenticatedRequest(requestFn);
  }

  // POST https://api.easee.com/api/chargers/{chargerId}/commands/stop_charging
  async stop() {
    const url = `/chargers/${this.chargerId}/commands/stop_charging`;
    
    const requestFn = async () => {
      return await this.http.post(url, null, {
        headers: this._getAuthHeader(),
      });
    };
    
    return await this._makeAuthenticatedRequest(requestFn);
  }

  // POST https://api.easee.com/api/chargers/{chargerId}/commands/toggle_charging
  async toggle() {
    const url = `/chargers/${this.chargerId}/commands/toggle_charging`;
    
    const requestFn = async () => {
      return await this.http.post(url, null, {
        headers: this._getAuthHeader(),
      });
    };
    
    return await this._makeAuthenticatedRequest(requestFn);
  }
}

module.exports = EaseeCharger;
