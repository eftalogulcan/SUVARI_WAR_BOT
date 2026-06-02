const commands = [
  new SlashCommandBuilder()
    .setName("war")
    .setDescription("Savaş katılım anketi oluştur")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("war-close")
    .setDescription("Aktif savaş anketini kapat")
    .toJSON()
];