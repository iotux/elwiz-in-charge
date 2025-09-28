#!/usr/bin/env node

// src/index.js
const path = require("path");
const TaskScheduler = require("easy-tasker");
const UniCache = require("@iotux/uni-cache");

const ConfigManager = require("./configManager");
const MqttHandler = require("./mqttHandler");
const EnergyHandler = require("./energyHandler");
//declare const require: any;

//const { formatISO } = require('date-fns');
const { getDateTime } = require("./utils");
//const { console } = require('console');
const debug = false;

// Load configuration from the YAML file
const configPath = path.join(__dirname, "..", "charger-config.yaml");
const configManager = new ConfigManager(configPath);
const config = configManager.loadConfig("serverConfig");

// Define the path to the credentials file
const credentialFile = path.join(__dirname, "..", "data", "credentials.json");

// Determine charger ID and brand from config
const chargerId = config.chargerId;
const chargerBrand = config.chargerBrand || "easee";
//const authInterval = config.authInterval || 3600;
//const networkType = config.networkType;
//const phaseCount = config.phaseCount;
//const minChargingCurrent = config.minChargingCurrent || 0.001;

const idlePollinterval = 10;
const busyPollInterval = 10;

let pollInterval = idlePollinterval;

const cacheName = "energysave";
const cacheOptions = {
  cacheType: "file",
  syncOnWrite: false, // File update is done through program breaks
  //syncInterval: 30, // Sync every 30 seconds, optional
  syncOnBreak: true, // Sync on program exit
  syncOnExit: true, // Sync on program exit
  savePath: "./data",
  logFunction: console.log,
  debug: debug,
};
const energySave = { realtimeEnergy: 0, hourlyEnergy: 0, lastHourEnergy: 0 };

let previousState = {
  isConnected: null,
  isChargingActive: null,
  isChargingFinished: null,
};

let forceOnState = false;
let forceOffState = false;
let chargeState = false;
let isBelowThreshold = null;

// Helper function to log the current states
function logChargingState() {
  const timeStamp = getDateTime();
  console.log("logChargingState", {
    timeStamp: timeStamp,
    isBelowThreshold: isBelowThreshold,
    forceOnState: forceOnState,
    forceOffState: forceOffState,
    chargeState: chargeState,
  });
}

/*
async function retryAuthentication(authManager, initialDelay = 5000) {
  let delay = initialDelay;
  while (true) {
    try {
      await authManager.authenticate();
      console.log('Authentication succeeded.');
      break; // Exit the loop on success.
    } catch (error) {
      console.error(`Authentication failed: ${error.message}`);
      console.log(`Retrying in ${delay / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      // Optionally, double the delay for each retry (exponential backoff)
      delay *= 2;
    }
  }
}
*/

(async () => {
  async function cacheInit(name, options, data) {
    // Initialize the cache with the given name and options
    cache = new UniCache(name, options);

    // Check if the cache is empty and initialize it with the provided data
    if (!(await cache.existsObject(name))) {
      if (debug) console.log("Database is empty");
      await cache.save(data);
    }

    // Fetch the data from the cache and log it
    /*
    await cache.fetch().then(function (data) {
      if (debug) console.log('Saved energy data loaded', data);
      return data;
    });
    console.log('datadatadata', data)
    return data;
    */
    return await cache.fetch();
  }

  const nrgData = await cacheInit(cacheName, cacheOptions, energySave);
  const energy = new EnergyHandler({
    realtimeEnergy: nrgData.realtimeEnergy,
    hourlyEnergy: nrgData.hourlyEnergy,
    networkType: config.networkType || "TN",
    phaseCount: config.phaseCount || 3,
    minChargingCurrent: config.minChargingCurrent || 0.001,
    debug: debug,
  });

  // Dynamically require the appropriate authentication and charger modules
  let authManager, charger;
  if (chargerBrand === "easee") {
    const EaseeAuthManager = require("./easeeAuthManager");
    const EaseeCharger = require("./easeeCharger");
    authManager = new EaseeAuthManager(config, credentialFile);
    charger = new EaseeCharger(chargerId, authManager, energy);
  } else if (chargerBrand === "zaptec") {
    const ZaptecAuthManager = require("./zaptecAuthManager");
    const ZaptecCharger = require("./zaptecCharger");
    authManager = new ZaptecAuthManager(config, credentialFile);
    charger = new ZaptecCharger(chargerId, authManager, energy);
  } else {
    throw new Error(`Unsupported charger brand: ${chargerBrand}`);
  }

  // Authenticate with the selected vendor API
  //await authManager.authenticate();
  await authManager.retryAuthentication();

  // Initialize MQTT Handler
  const brokerUrl = config.brokerUrl || "mqtt://localhost:1883";
  const baseTopic = config.baseTopic || "evcharger";
  const subscribeTopics = [
    `${baseTopic}/${config.debugTopic}` || `${baseTopic}/debug`,
    `${baseTopic}/${config.reportTopic}` || `${baseTopic}/report`,
    `${baseTopic}/${config.controlTopic}` || `${baseTopic}/control`,
    `${baseTopic}/${config.overrideTopic}` || `${baseTopic}/override`,
    config.belowThreholdTopic || "elwiz/chart/spotBelowThreshold",
    ...(config.forceOffTopics || []),
  ];

  //const clientId = `evcharger_${chargerId}_${Math.floor(Math.random() * 10000) + 9999}`;
  //const clientId = `${chargerId}_${Math.floor(100000 + Math.random() * 900000)}`;
  const clientId = `${chargerId}_${Math.random().toString(16).substring(2, 8)}`;

  const mqttOptions = {
    clientId: clientId,
    clean: true,
    reconnectPeriod: 5000,
    // Optionally define an "availability" topic and will message:
    avtyTopic: `${baseTopic}/sensor/status`,
    debug: debug,
    will: {
      topic: `${baseTopic}/sensor/status`,
      payload: "offline",
      qos: 1,
      retain: true,
    },
  };

  const mqttHandler = new MqttHandler(brokerUrl, subscribeTopics, mqttOptions);
  mqttHandler.connect();

  // Listen for MQTT messages to control the charger or request data
  mqttHandler.on("message", async (topic, payload) => {
    //console.log(`MQTT message received: ${topic} => ${payload}`);

    // Update global state variables based on the topic.
    // 1. For the belowThreshold topic:
    if (topic === config.belowThresholdTopic) {
      // Assume payload '1' or 'true' means the threshold is reached.
      isBelowThreshold = payload === "1" || payload.toLowerCase() === "true";
      // If no forced override is in place, update the chargeState accordingly.
      if (!forceOffState && !forceOnState) {
        chargeState = isBelowThreshold;
      }
    }

    // 2. For the override topic (e.g., override) that forces on/off charging:
    else if (topic === `${baseTopic}/${config.overrideTopic || "override"}`) {
      if (payload === "on" || payload === "true" || payload === "1") {
        forceOnState = true;
        forceOffState = false;
        chargeState = true;
      } else if (payload === "off" || payload === "false" || payload === "0") {
        forceOnState = false;
        forceOffState = true;
        chargeState = false;
      } else if (
        payload === "clear" ||
        payload === "reset" ||
        payload === null
      ) {
        forceOnState = false;
        forceOffState = false;
        // Restore to the underlying state (e.g. isBelowThreshold)
        chargeState = isBelowThreshold;
      }
    }

    // 3. For any topics listed in forceOffTopics (if defined)
    else if (config.forceOffTopics && config.forceOffTopics.includes(topic)) {
      // For simplicity, assume payload 'true' or '1' indicates the topic is active.
      const topicState =
        payload === "on" || payload === "1" || payload === "false";
      forceOffState = topicState;
      if (forceOffState) {
        chargeState = false;
      } else if (!forceOnState) {
        chargeState = isBelowThreshold;
      }
    }

    // 4. Continue with your other topic processing:
    else if (topic.endsWith("report")) {
      if (payload === "chargerDetails") {
        try {
          // Get the latestNativeState
          const state = await charger.getState();
          mqttHandler.publish(
            `${baseTopic}/debug/chargerDetails`,
            JSON.stringify(state),
            { qos: 1, retain: true },
          );
        } catch (error) {
          //console.error('Error getting charger state:', error.message);
          console.error(
            `${getDateTime()} - Error getting charger state: ${error.message}`,
          );
        }
      }
    } else if (topic.endsWith("control")) {
      // Dispatch control commands (pause, resume, or toggle)
      if (payload === "pause") {
        await charger.pause();
      } else if (payload === "resume") {
        await charger.resume();
      } else if (payload === "toggle") {
        await charger.toggle();
      }
    }
    //logChargingState();
    const state = await charger.getLatestState();
    state.isBelowThreshold = isBelowThreshold;
    state.forceOnState = forceOnState;
    state.forceOffState = forceOffState;
    state.chargeState = chargeState;
    console.log("mqttMessageState:", state);
  });

  // Schedule periodic polling of the charger state and publish via MQTT
  let prevPollInterval = pollInterval;
  const pollTask = new TaskScheduler(
    async () => {
      //console.log(`${getDateTime()} - running pollTask`)
      try {
        // latestNativeState is the full state object from the charger API
        // A timestamp "timeStamp" is added to the state object for logging purposes
        const latestNativeState = await charger.getState();
        // latestState is a simplified state object
        const latestState = await charger.getLatestState();
        pollInterval = latestState.isConnected
          ? busyPollInterval
          : idlePollinterval;
        if (pollInterval !== prevPollInterval)
          pollTask.setNewInterval(pollInterval);
        latestState.lastHourEnergy = await cache.get("lastHourEnergy");
        latestState.isBelowThreshold = isBelowThreshold;
        latestState.forceOnState = forceOnState;
        latestState.forceOffState = forceOffState;
        latestState.chargeState = chargeState;
        mqttHandler.publish(
          `${baseTopic}/sensor/realtimeEnergy`,
          parseFloat(latestState.realtimeEnergy).toFixed(4),
          { qos: 1, retain: true },
        );
        mqttHandler.publish(
          `${baseTopic}/sensor/hourlyEnergy`,
          parseFloat(latestState.hourlyEnergy).toFixed(4),
          { qos: 1, retain: true },
        );
        mqttHandler.publish(
          `${baseTopic}/sensor/state`,
          JSON.stringify(latestState, null, 2),
          { qos: 1, retain: true },
        );
        await cache.set("realtimeEnergy", latestState.realtimeEnergy);
        await cache.set("hourlyEnergy", latestState.hourlyEnergy);
        console.log("pollingState", latestState);
        if (latestState.opMode === 1) {
          // Reset energy counter at the end of session
          await energy.setSessionEnergy(0);
          await cache.set("realtimeEnergy", 0);
          //await cache.sync();
        }
      } catch (error) {
        console.error(
          `${getDateTime()} - Error polling charger state: ${error.message}`,
        );
      }
    },
    { taskId: "chargerStatePoll", logging: false },
  );

  pollTask.intervalSchedule(10, pollInterval, chargerId);

  const hourlyTaskRunner = async function () {
    const latestState = await charger.getLatestState();
    // Publish energy use once per hour
    mqttHandler.publish(
      `${baseTopic}/sensor/realtimeEnergy`,
      parseFloat(latestState.realtimeEnergy).toFixed(4),
      { qos: 1, retain: true },
    );
    mqttHandler.publish(
      `${baseTopic}/sensor/hourlyEnergy`,
      parseFloat(latestState.hourlyEnergy).toFixed(4),
      { qos: 1, retain: true },
    );
    mqttHandler.publish(
      `${baseTopic}/sensor/lastHourEnergy`,
      parseFloat(latestState.hourlyEnergy).toFixed(4),
      { qos: 1, retain: true },
    );
    latestState.lastHourEnergy = latestState.hourlyEnergy;
    await cache.set("lastHourEnergy", latestState.hourlyEnergy);
    console.log(`chargerHourlyTask: ${getDateTime()}`, latestState);
    // Reset houry energy counter once every hour
    await energy.setHourlyEnergy(0);
    await cache.set("hourlyEnergy", 0);
    //cache.sync();
  };

  const hourlyTask = new TaskScheduler(hourlyTaskRunner, {
    taskId: "chargerHourlyTask",
    logging: false,
  });
  // Extended cron syntax
  // Run a few second whole hour to account for HA energy reporting
  hourlyTask.timeAlignedSchedule("58 59 * * * *", chargerId);

  /*
  // Graceful shutdown: disconnect MQTT on SIGINT (e.g., Ctrl+C)
  process.on('SIGINT', async () => {
    console.log('Got SIGINT, shutting down...');
    // This will prevent broker from sending last will messagae
    mqttHandler.disconnect();

    try {
      await cache.sync();  // Ensure sync completes before exiting
      console.log('Cache synced successfully.');
    } catch (error) {
      console.error('Error during sync:', error);
    }

    process.exit(0);  // Only exit after sync is done
  });

  /*
  process.on('SIGTERM', async () => {
    console.log('Got SIGTERM, shutting down...');
    mqttHandler.disconnect();

    try {
      await cache.sync();  // Ensure sync completes before exiting
      console.log('Cache synced successfully.');
    } catch (error) {
      console.error('Error during sync:', error);
    }

    process.exit(0);  // Only exit after sync is done
  });
  */
})();
