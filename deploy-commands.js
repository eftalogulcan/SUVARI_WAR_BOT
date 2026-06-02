require("dotenv").config();

const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const CLIENT_ID = "1511063481552736337";
const GUILD_ID = "1511064609874907389";

const guildCommands = [
  new SlashCommandBuilder()
    .setName("war")
    .setDescription("Savaş katılım anketi oluştur")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("war-close")
    .setDescription("Aktif savaş anketini kapat")
    .toJSON()
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("Eski global komutlar temizleniyor...");
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: [] }
    );

    console.log("Sunucu komutları yükleniyor...");
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: guildCommands }
    );

    console.log("Komutlar güncellendi.");
  } catch (error) {
    console.error(error);
  }
})();