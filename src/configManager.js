// src/configManager.js
const fs = require('fs');
const yaml = require('js-yaml');

class ConfigManager {
  constructor(configPath) {
    this.configPath = configPath;
  }

  loadConfig(section) {
    try {
      const fileContents = fs.readFileSync(this.configPath, 'utf8');
      const data = yaml.load(fileContents);
      return data[section];
    } catch (error) {
      console.error(`Error reading config: ${error.message}`);
      return null;
    }
  }
}

module.exports = ConfigManager;

