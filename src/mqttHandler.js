// src/mqttHandler.js
const mqtt = require('mqtt');
const EventEmitter = require('events');

class MqttHandler extends EventEmitter {
  /**
   * @param {string} brokerUrl - MQTT broker URL.
   * @param {Array<string>} topics - Topics to subscribe to.
   * @param {object} options - Additional connection options.
   */
  constructor(brokerUrl, topics, options = {}) {
    super();
    this.brokerUrl = brokerUrl;
    this.topics = topics;
    // Set default options. Note: clean=false makes the session persistent.
    this.options = Object.assign({
      keepalive: 60,             // Ping every 60 seconds
      reconnectPeriod: 5000,     // Reconnect after 5 seconds if disconnected
      clean: false,              // Persistent session; change to true if you prefer clean sessions
      connectTimeout: 30 * 1000  // 30-second connection timeout
    }, options);
    this.client = null;
  }

  connect() {
    this.client = mqtt.connect(this.brokerUrl, this.options);

    this.client.on('connect', () => {
      console.log(`Connected to MQTT broker at ${this.brokerUrl}`);
      // Subscribe to all topics once connected.
      this.client.subscribe(this.topics, { qos: 1 }, (err) => {
        if (err) {
          console.error('Subscription error:', err);
        } else {
          //if (this.options.debug)
            console.log('Subscribed to topics:', this.topics.join(', '));
        }
        if (this.options.debug)
          console.log('mqttOptions', this.options)
      });
      // Optionally publish an "online" status.
      if (this.options.avtyTopic) {
        this.publish(this.options.avtyTopic, 'online', { qos: 1, retain: true });
      }
    });

    this.client.on('message', (topic, message) => {
      this.emit('message', topic, message.toString());
    });

    this.client.on('error', (err) => {
      console.error('MQTT connection error:', err);
    });

    this.client.on('reconnect', () => {
      console.log('MQTT reconnecting...');
    });

    this.client.on('close', () => {
      console.log('MQTT connection closed');
    });
  }

  publish(topic, message, options = {}) {
    if (this.client && this.client.connected) {
      this.client.publish(topic, message, options);
    } else {
      console.warn('MQTT publish failed: client not connected');
    }
  }

  disconnect() {
    if (this.client) {
      this.client.end(false, () => {
        console.log('MQTT client disconnected gracefully.');
      });
    }
  }
}

module.exports = MqttHandler;
