const tracker = require('../utils/userVoiceTracker');

module.exports = {
    name: 'voiceStateUpdate',
    once: false,
    async execute(oldState, newState) {
        try {
            tracker.handleVoiceStateUpdate(oldState, newState);
        } catch (err) {
            console.error('[UserVoiceTracker] Error in voiceStateUpdate:', err);
        }
    },
};
