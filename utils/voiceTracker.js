const db = require('./dbStore');

module.exports = {
  init(guild, categoryIds) {
    const data = db.get('voiceTime') || {};
    const now = Date.now();

    for (const catId of categoryIds) {
      const category = guild.channels.cache.get(catId);
      if (!category) continue;

      guild.channels.cache
        .filter(ch => ch.parentId === catId && ch.type === 2)
        .forEach(vc => {
          if (!data[vc.id]) {
            data[vc.id] = {
              totalMs: 0,
              activeSince: null,
              memberCount: 0
            };
          }

          if (vc.members.size > 0) {
            data[vc.id].memberCount = vc.members.size;
            if (!data[vc.id].activeSince) {
              data[vc.id].activeSince = now;
            }
          } else {
            // hapus langsung jika kosong
            delete data[vc.id];
          }
        });
    }

    // Hapus channel yang udah gak ada di guild
    for (const chId of Object.keys(data)) {
      const ch = guild.channels.cache.get(chId);
      if (!ch || ch.type !== 2) {
        delete data[chId];
      }
    }

    db.set('voiceTime', data);
  },

  onVoiceStateUpdate(oldState, newState) {
    const now = Date.now();
    const data = db.get('voiceTime') || {};

    const ensure = (chId) => {
      if (!data[chId]) {
        data[chId] = {
          totalMs: 0,
          activeSince: null,
          memberCount: 0
        };
      }
      return data[chId];
    };

    // MEMBER KELUAR / MOVE
    if (oldState.channelId) {
      const chData = ensure(oldState.channelId);
      chData.memberCount = Math.max(0, chData.memberCount - 1);

      if (chData.memberCount === 0) {
        if (chData.activeSince) {
          chData.totalMs += now - chData.activeSince;
        }
        // hapus channel kosong
        delete data[oldState.channelId];
      }
    }

    // MEMBER JOIN / MOVE
    if (newState.channelId) {
      const chData = ensure(newState.channelId);

      if (chData.memberCount === 0) {
        chData.activeSince = now;
      }

      chData.memberCount += 1;
    }

    db.set('voiceTime', data);
  }
};