require("dotenv").config();

const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
  .setName("war")
  .setDescription("Savaş katılım anketi oluştur")
  .toJSON()

  new SlashCommandBuilder()
    .setName("war-close")
    .setDescription("Aktif savaş anketini kapat")
    .toJSON()
];
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("Komutlar yükleniyor...");

    await rest.put(
      Routes.applicationGuildCommands("1511063481552736337", "1511064609874907389"),
      { body: commands }
    );

    console.log("Komutlar yüklendi.");
  } catch (error) {
    console.error(error);
  }
})();