const { EmbedBuilder } = require('discord.js');

// Warna default untuk embed
const DEFAULT_COLOR = 0x5865F2; // Discord Blurple

/**
 * Buat embed dengan style yang konsisten
 * @param {Object} options
 * @param {string} [options.title] - Judul embed
 * @param {string} [options.description] - Deskripsi embed
 * @param {number} [options.color] - Warna embed (hex)
 * @param {Array}  [options.fields] - Array of { name, value, inline }
 * @param {string} [options.footer] - Footer text
 * @param {string} [options.thumbnail] - URL thumbnail
 * @param {string} [options.image] - URL image
 * @returns {EmbedBuilder}
 */
function createEmbed(options = {}) {
  const embed = new EmbedBuilder()
    .setColor(options.color || DEFAULT_COLOR)
    .setTimestamp();

  if (options.title) embed.setTitle(options.title);
  if (options.description) embed.setDescription(options.description);
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  if (options.image) embed.setImage(options.image);

  if (options.footer) {
    embed.setFooter({ text: options.footer });
  }

  if (options.fields && Array.isArray(options.fields)) {
    embed.addFields(options.fields);
  }

  return embed;
}

/**
 * Buat embed untuk pesan error
 * @param {string} message - Pesan error
 * @returns {EmbedBuilder}
 */
function createErrorEmbed(message) {
  return createEmbed({
    title: '❌ Error',
    description: message,
    color: 0xED4245, // Red
  });
}

/**
 * Buat embed untuk pesan sukses
 * @param {string} message - Pesan sukses
 * @returns {EmbedBuilder}
 */
function createSuccessEmbed(message) {
  return createEmbed({
    title: '✅ Berhasil',
    description: message,
    color: 0x57F287, // Green
  });
}

module.exports = {
  createEmbed,
  createErrorEmbed,
  createSuccessEmbed,
  DEFAULT_COLOR,
};
