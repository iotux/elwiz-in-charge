// src/baseCharger.js

const msgString = 'method must be implemented by subclass';
class BaseCharger {
  constructor(chargerId, authManager) {
    this.chargerId = chargerId;
    this.authManager = authManager;
  }

  async pause() { throw new Error(`pause() ${msgString}`); }
  async resume() { throw new Error(`resume() ${msgString}`); }
  async start() { throw new Error(`start() ${msgString}`); }
  async stop() { throw new Error(`stop() ${msgString}`); }
  async toggle() { throw new Error(`toggle() ${msgString}`); }
  async getState() { throw new Error(`getState() ${msgString}`); }
  async setState() { throw new Error(`setState() ${msgString}`); }
  async getLatestState() { throw new Error(`getState() ${msgString}`); }
  async setChargingCurrent() { throw new Error(`setChargingCurrent() ${msgString}`); }
  async setChargingPower() { throw new Error(`setChargingPower() ${msgString}`); }
  //async _determineStateChange() { throw new Error(`getState() ${msgString}`); }
}

module.exports = BaseCharger;

