class EnergyHandler {
  constructor(options = {realtimeEnergy: 0, hourlyEnergy: 0, networkType: 'TN', phaseCount: 1, minChargingCurrent: 0.001, debug: false }) {
    this.realtimeEnergy = options.realtimeEnergy; // Session kWh counter
    this.hourlyEnergy = options.hourlyEnergy; // Holds kWh for the current period
    this.networkType = options.networkType.toUpperCase(); // IT, TN, or TT
    this.phaseCount = options.phaseCount; // 1 or 3 phases
    this.minChargingCurrent = options.minChargingCurrent;
    this.debug = options.debug;
    this.voltage = 0; // Voltage in V
    this.current = 0; // Current in A
    this.power = 0; // Power in kW
    this.lastUpdateTime = null; // Last time energy was updated
    if (this.debug)
      console.log(this)
    if (!['TN', 'TT', 'IT'].includes(this.networkType)) {
      throw new Error(`Invalid network type ${this.networkType}. Must be TN, TT, or IT`);
    }
    if (![1, 2, 3].includes(this.phaseCount)) {
      throw new Error(`Invalid phase count ${this.phaseCount}. Must be 1, 2, or 3`);
    }
  }

  // Set the power (in kW) and update the kWh
  async setEnergy(power) {
    const now = Date.now();
    if (this.lastUpdateTime !== null) {
      const timeDifference = (now - this.lastUpdateTime) / 1000; // Time difference in seconds
      const kWh = this.power * (timeDifference / 3600); // Calculate kWh from power and time
      this.hourlyEnergy += kWh;
      this.realtimeEnergy += kWh; // Accumulate kWh over the hour
    }
    this.power = power;
    this.lastUpdateTime = now;
    return { realtimeEnergy: this.realtimeEnergy, hourlyEnergy: this.hourlyEnergy };
  }
  
  // Update voltage and current, then compute power and kWh
  async setEnergyByCurrent(current, voltage = 230) {
    const now = Date.now();
    let power;
    
    if (this.networkType === "IT" && this.phaseCount === 3) {
      power = 3 * (voltage * current) / 1000; // IT 3-phase, no neutral
    } else if (this.phaseCount === 3) {
      power = Math.sqrt(3) * voltage * current / 1000; // TN/TT 3-phase
    } else {
      power = (voltage * current) / 1000; // Single-phase
    }

    if (this.lastUpdateTime !== null) {
      const timeDifference = (now - this.lastUpdateTime) / 1000; // Time in seconds
      const kWh = power * (timeDifference / 3600); // Convert to kWh
      this.hourlyEnergy += kWh;
      this.realtimeEnergy += kWh;
    }

    this.voltage = voltage;
    this.current = current;
    this.power = power;
    this.lastUpdateTime = now;
    return { realtimeEnergy: this.realtimeEnergy, hourlyEnergy: this.hourlyEnergy };
  }

  async getVoltage() {
    return this.voltage;
  }

  // Set kWh for the current period
  async setHourlyEnergy(kWh) {
    this.hourlyEnergy = kWh;
  }

  // Get kWh for the current period
  async getHourlyEnergy() {
    return this.hourlyEnergy;
  }

  // Set session kWh
  async setSessionEnergy(kWh) {
    this.realtimeEnergy = kWh;
  }

  // Get session kWh
  async getSessionEnergy() {
    return this.realtimeEnergy;
  }

  async getEnergy(){
    return { realtimeEnergy: this.realtimeEnergy, hourlyEnergy: this.hourlyEnergy };
  }

  // Reset the current kWh counter
  async resetCounter() {
    this.hourlyEnergy = 0;
  }

  async getPower() {
    return this.power;
  }

  async calculateCurrent(l1, l2, l3) {
    const currents = [l1, l2, l3];
    // Validate inputs
    if (currents.some(v => typeof v !== 'number' || isNaN(v))) {
      throw new TypeError('All inputs must be numbers');
    }
  
    // Filter out unused phases (current ≈ 0)
    const activeCurrents = currents.filter(current => 
      typeof current === 'number' && 
      !isNaN(current) && 
      current > 0.01 // Threshold for considering a phase active
      //current > 0.0001 // Threshold for considering a phase active
    );
    // Detect phaseCount regardless of config. The car may refuse to use 3-phase
    this.phaseCount = activeCurrents.length === 3 ? 3 : 1;

    //console.log('activeCurrents:', activeCurrents);
    //console.log('magnitudes:', activeCurrents.map(Math.abs))
    //console.log('currents:', l1, l2, l3)
    //console.log('phaseCount:', this.phaseCount)

    // Handle single-phase scenarios
    if (this.phaseCount === 1 || activeCurrents.length === 1) {
      return activeCurrents[0] || 0;
    }
  
    // Convert to absolute values
    const magnitudes = activeCurrents.map(Math.abs);
  
    // Calculate based on network type
    switch(this.networkType) {
      case 'IT':
        if (magnitudes.length === 3) {
          // Full 3-phase IT calculation
          const [i1, i2, i3] = magnitudes;
          const squares = i1**2 + i2**2 + i3**2;
          const products = (i1*i2) + (i2*i3) + (i3*i1);
          //console.log('currentPlain', Math.sqrt(Math.max(squares - products, 0)));
          //return           Math.sqrt(Math.max(squares - products, 0));
          //return           (Math.sqrt(Math.max(squares - products, 0)) * 100) / 100;
          return Math.round(Math.sqrt(Math.max(squares - products, 0)) * 100) / 100;
        }
        // Fall through to vector sum for 2-phase IT
        
      case 'TN':
      case 'TT':
        if (magnitudes.length === 2) {
          // 2-phase calculation (vector sum)
          const [i1, i2] = magnitudes;
          return Math.round(Math.sqrt(i1**2 + i2**2 - i1*i2) * 100) / 100;
        }
        // 3-phase arithmetic sum for TN/TT
        return magnitudes.reduce((sum, current) => sum + current, 0);
        
      default:
        throw new Error('Unsupported network type');
    }
  }
}

module.exports = EnergyHandler;
