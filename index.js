require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// Geçici hafıza: bot kapanırsa sıfırlanır.
// Sonra bunu SQLite'a taşıyacağız.
const warPolls = new Map();

function createWarEmbed(poll) {
  const attendCount = poll.votes.attend.size;
  const notAttendCount = poll.votes.not_attend.size;
  const maybeCount = poll.votes.maybe.size;
  const totalCount = attendCount + notAttendCount + maybeCount;

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("⚔️ SAVAŞ KATILIM DURUMU")
    .setDescription(
      `**${poll.title}**\n\n` +
      `Savaşa katılıp katılamayacağınızı lütfen belirtin.\n` +
      `Please indicate whether you can attend the war or not.`
    )
    .addFields(
      {
        name: "Soru",
        value:
          "SAVAŞ KATILIM DURUMU (100 LVL İÇİN GEÇERLİDİR)\n" +
          "WAR PARTICIPATION STATUS (VALID FOR 100 LVL)",
        inline: false
      },
      {
        name: "Seçenekler",
        value:
          "🇦 KATILACAĞIM - I WILL ATTEND\n" +
          "🇧 KATILAMAYACAĞIM - I WILL NOT ATTEND\n" +
          "🇨 BELKİ - MAYBE",
        inline: false
      },
      {
        name: "Sonuçlar",
        value:
          `🇦 **${attendCount}**   🇧 **${notAttendCount}**   🇨 **${maybeCount}**\n` +
          `Toplam oy: **${totalCount}**`,
        inline: false
      },
      {
        name: "Ayarlar",
        value:
          "⏱️ Bitiş süresi: manuel kapatma\n" +
          "⚖️ 1 seçeneğe izin verildi\n" +
          `🆔 Anket Kimliği: \`${poll.id}\``,
        inline: false
      }
    )
    .setFooter({ text: "SUVARI War Bot" })
    .setTimestamp();
}

function createWarButtons(pollId) {
  const poll = warPolls.get(pollId);

  const attendCount = poll ? poll.votes.attend.size : 0;
  const notAttendCount = poll ? poll.votes.not_attend.size : 0;
  const maybeCount = poll ? poll.votes.maybe.size : 0;

  const totalParticipants =
    attendCount + notAttendCount + maybeCount;

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`war_vote:${pollId}:attend`)
        .setLabel(`A ${attendCount}`)
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`war_vote:${pollId}:not_attend`)
        .setLabel(`B ${notAttendCount}`)
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`war_vote:${pollId}:maybe`)
        .setLabel(`C ${maybeCount}`)
        .setStyle(ButtonStyle.Primary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`war_manage:${pollId}`)
        .setLabel("Oylarınızı yönetin")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`war_participants:${pollId}`)
        .setLabel(`Katılımcılar (${totalParticipants})`)
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}
function removeUserFromAllVotes(poll, userId) {
  poll.votes.attend.delete(userId);
  poll.votes.not_attend.delete(userId);
  poll.votes.maybe.delete(userId);
}

function getVoteLabel(voteType) {
  if (voteType === "attend") return "🇦 KATILACAĞIM - I WILL ATTEND";
  if (voteType === "not_attend") return "🇧 KATILAMAYACAĞIM - I WILL NOT ATTEND";
  if (voteType === "maybe") return "🇨 BELKİ - MAYBE";
  return "Bilinmiyor";
}

function buildParticipantsText(poll, voteType) {
  const userIds = [...poll.votes[voteType]];

  if (userIds.length === 0) {
    return "Bu seçenek için henüz oy veren yok.";
  }

  return userIds
    .map((userId, index) => {
      const votedAt = poll.voteTimes.get(userId);
      const timeText = votedAt
        ? `<t:${Math.floor(votedAt / 1000)}:R>`
        : "zaman bilinmiyor";

      return `${index + 1}. <@${userId}> — ${timeText} • Ağırlık: 1`;
    })
    .join("\n");
}

client.once(Events.ClientReady, () => {
  console.log(`✅ ${client.user.tag} aktif!`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "hello") {
      await interaction.reply("✅ SUVARI War Bot aktif!");
      return;
    }

    if (interaction.commandName === "war") {
      const title = interaction.options.getString("baslik", true);
      const pollId = Date.now().toString(36);

      const poll = {
        id: pollId,
        title,
        channelId: interaction.channelId,
        messageId: null,
        createdBy: interaction.user.id,
        createdAt: Date.now(),
        votes: {
          attend: new Set(),
          not_attend: new Set(),
          maybe: new Set()
        },
        voteTimes: new Map()
      };

      const sentMessage = await interaction.reply({
        content: "@everyone",
        embeds: [createWarEmbed(poll)],
        components: createWarButtons(pollId),
        fetchReply: true,
        allowedMentions: { parse: ["everyone"] }
      });

      poll.messageId = sentMessage.id;
      warPolls.set(pollId, poll);
      return;
    }
  }

  if (interaction.isButton()) {
    const [action, pollId, voteType] = interaction.customId.split(":");
    const poll = warPolls.get(pollId);

    if (!poll) {
      await interaction.reply({
        content: "Bu anket bulunamadı veya bot yeniden başlatıldığı için hafızadan silindi.",
        ephemeral: true
      });
      return;
    }

    if (action === "war_vote") {
      removeUserFromAllVotes(poll, interaction.user.id);

      if (!poll.votes[voteType]) {
        await interaction.reply({
          content: "Geçersiz oy seçeneği.",
          ephemeral: true
        });
        return;
      }

      poll.votes[voteType].add(interaction.user.id);
      poll.voteTimes.set(interaction.user.id, Date.now());

      await interaction.update({
        embeds: [createWarEmbed(poll)],
        components: createWarButtons(pollId)
      });

      await interaction.followUp({
        content: `Oyun kaydedildi: **${getVoteLabel(voteType)}**`,
        ephemeral: true
      });

      return;
    }

    if (action === "war_manage") {
      await interaction.reply({
        content:
          "Oyunu değiştirmek için tekrar A, B veya C butonuna basman yeterli.\n\n" +
          "A = Katılacağım\n" +
          "B = Katılamayacağım\n" +
          "C = Belki",
        ephemeral: true
      });
      return;
    }

    if (action === "war_participants") {
      const text =
        `**Katılımcılar — ${poll.title}**\n\n` +
        `**🇦 KATILACAĞIM - I WILL ATTEND**\n${buildParticipantsText(poll, "attend")}\n\n` +
        `**🇧 KATILAMAYACAĞIM - I WILL NOT ATTEND**\n${buildParticipantsText(poll, "not_attend")}\n\n` +
        `**🇨 BELKİ - MAYBE**\n${buildParticipantsText(poll, "maybe")}`;

      await interaction.reply({
        content: text.slice(0, 1900),
        ephemeral: true
      });
      return;
    }
  }
});

client.login(process.env.DISCORD_TOKEN);