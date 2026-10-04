/**
 * Simple logger dengan timestamp dan level warna
 */

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

function getTimestamp() {
  return new Date().toLocaleString('id-ID', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatMessage(level, color, message) {
  const timestamp = getTimestamp();
  return `${colors.gray}[${timestamp}]${colors.reset} ${color}[${level}]${colors.reset} ${message}`;
}

const logger = {
  info(message) {
    console.log(formatMessage('INFO', colors.green, message));
  },

  warn(message) {
    console.warn(formatMessage('WARN', colors.yellow, message));
  },

  error(message) {
    console.error(formatMessage('ERROR', colors.red, message));
  },

  debug(message) {
    if (process.env.NODE_ENV === 'development') {
      console.log(formatMessage('DEBUG', colors.blue, message));
    }
  },
};

module.exports = logger;
