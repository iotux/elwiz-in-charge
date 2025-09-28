# elwiz-in-charge

An intelligent EV charging controller that integrates with ElWiz to optimize charging based on power prices and user preferences.

## Overview

**elwiz-in-charge** is designed to control EV charging systems (currently supporting Easee chargers) based on MQTT messages from the ElWiz system. It allows for intelligent charging that can take advantage of low electricity prices while respecting user requirements and preferences.

## Features

- **Smart Charging Control**: Automatically controls EV charging based on power prices from the Nord Pool electricity market and provided through ElWiz
- **MQTT Integration**: Seamlessly integrates with MQTT-based home automation systems
- **Multiple Charger Support**: Currently supports Easee chargers with architecture ready for other brands
- **Real-time State Monitoring**: Continuously monitors charger state and publishes data via MQTT
- **401 Error Handling**: Automatically handles authentication token refresh
- **Manual Override**: Allows manual control via MQTT topics

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- An EV charger (currently supports Easee)
- An MQTT broker
- ElWiz system running (for power price signals)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/iotux/elwiz-in-charge.git
cd elwiz-in-charge
```

2. Install dependencies:
```bash
npm install
```

3. Configure your settings (see Configuration section below)

4. Run the application:
```bash
src/charger.js
```

## Configuration

Copy `charger-config-sample.yaml` to `charger-config.yaml` and modify `charger-config.yaml` file according to your preferences.
Here's an example configuration:

```yaml
---
# Easee configuration file
serverConfig:
  # Reauthentication interval (in seconds)
  # For Easee chargers, the default API token expires after 60 minutes (3600 seconds)
  # Setting it to a smaller value may prevent disconnections caused by network issues
  authInterval: 1800

  debug: true
  serverPort: 3003

  # Charger brand
  chargerBrand: easee
  # Your charger ID is found in the Easee app
  # It is required for API calls
  chargerId: YOUR_CHARGER_ID
  siteId: YOUR_SITE_ID
  userId: YOUR_USER_ID

  # networkType can be TN, TT or IT. TN is default
  networkType: TN
  # phaseCount can be 1, 2 or 3
  # Default is 3. If unsure, keep the default. The program will adjust
  phaseCount: 3
  # minChargingCurrent is the charger's self consumption
  # Used to prevent false signals from charger. Default is 0.001 Ampere.
  # Increase if program is reporting charging when charging is finished
  minChargingCurrent: 0.01

  # MQTT configuration
  # Quotes around brokerUrl are required
  brokerUrl: "mqtt://localhost:1883"
  userName:
  password:
  baseTopic: evcharger

  # debugTopic is appended to "baseTopic/"
  debugTopic: debug

  # reportTopic is appended to "baseTopic/"
  reportTopic: report

  # controlTopic runs API calls
  # It is appended to "baseTopic/"
  controlTopic: control

  # Default is to interact with elwiz-chart
  # green/red zones, which are set according to
  # the spot prices being below/above threshold
  # It can be changed to whatever you see fit
  belowThresholdTopic: elwiz/chart/spotBelowThreshold

  # Has priority over belowThresholdTopic and forceOffTopics
  # It is appended to "baseTopic/"
  overrideTopic: override

  # An array of topics, each forces charging to pause
  # forceOffTopics runs pause() on "1", resume() on "0"
  forceOffTopics:
    - some/other/topic
    - force/off/topic

  # Home Assistant topics
  haAnnounceTopic: homeassistant

clientConfig:
  # For future enhancements
```

## Usage

### Initial Setup

1. Configure your charger ID in `charger-config.yaml`
2. Make sure your MQTT broker settings are correct
3. Run the application for the first time - it will ask for your Easee credentials
4. Enter your username and password when prompted

### MQTT Topics

The system uses the following MQTT topics:

- `evcharger/sensor/state` - Charger state information
- `evcharger/report` - Request charger details (send "chargerDetails")
- `evcharger/control` - Control commands (pause, resume, toggle, start, stop)
- `evcharger/priority` - Override control (on, off, clear)
- `elwiz/chart/spotBelowThreshold` - Power price threshold signal

### Authentication

The first time you run the application, it will prompt you for your Easee credentials. These will be stored in the `data/credentials.json` file with appropriate permissions.

## API Error Handling

The system includes robust error handling for 401 authentication errors. When the API returns a 401 status code, the system will:

1. Automatically reauthenticate with the API
2. Retry the failed request with the new authentication token
3. Continue normal operation

This prevents the system from getting stuck in an unauthenticated state during long-running operations.

## Supported Charger Actions

- **Pause Charging**: `pause` command via MQTT control topic
- **Resume Charging**: `resume` command via MQTT control topic
- **Start Charging**: `start` command via MQTT control topic
- **Stop Charging**: `stop` command via MQTT control topic
- **Toggle Charging**: `toggle` command via MQTT control topic
- **Set Charging Current**: Programmatically set charging current
- **Set Charging Power**: Programmatically set charging power

## Integration with ElWiz

elwiz-in-charge is designed to work with the ElWiz ecosystem. It listens for power price signals and adjusts charging accordingly:

- When power prices are below threshold, charging is allowed
- When power prices are above threshold, charging is paused
- Manual override is possible via MQTT topics

## Troubleshooting

### Authentication Issues
- If you get repeated authentication errors, try removing the `data/credentials.json` file to force a new login
- Check that your credentials are correct

### MQTT Connection Issues
- Verify your MQTT broker is running and accessible
- Check that your broker URL is correctly formatted

### Charger Not Responding
- Verify your charger ID is correct
- Ensure good network connectivity between your system and the charger API

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## License

MIT

## Support

If you encounter issues with the software, please open an issue in the GitHub repository.
