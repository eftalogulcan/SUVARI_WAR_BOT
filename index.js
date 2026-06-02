require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const MANAGER_ROLE_NAME = "War Manager";
const TURKEY_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

const CLASSES = [
  { label: "Mızrak", value: "mizrak", emoji: "🔱" },
  { label: "Arbalet", value: "arbalet", emoji: "🎯" },
  { label: "Çekiç", value: "cekic", emoji: "🔨" },
  { label: "Uzun Kılıç", value: "uzun_kilic", emoji: "⚔️" },
  { label: "Tank", value: "tank", emoji: "🛡️" },
  { label: "Healer", value: "healer", emoji: "💚" },
  { label: "Çift Bıçak", value: "cift_bicak", emoji: "🗡️" },
  { label: "Yay", value: "yay", emoji: "🏹" },
  { label: "Necromancer", value: "necromancer", emoji: "💀" },
  { label: "Elementalist", value: "elementalist", emoji: "🔥" },
  { label: "Çift Balta", value: "cift_balta", emoji: "🪓" }
];

const warPolls = new Map();
let activePollId = null;
let activeCloseTimeout = null;

function hasWarManagerPermission(interaction) {
  return interaction.member.roles.cache.some(role => role.name === MANAGER_ROLE_NAME);
}

function getNextTurkeyCloseTimeMs() {
  const nowUtc = Date.now();
  const nowTurkey = new Date(nowUtc + TURKEY_UTC_OFFSET_MS);

  const year = nowTurkey.getUTCFullYear();
  const month = nowTurkey.getUTCMonth();
  const day = nowTurkey.getUTCDate();

  let closeUtcMs = Date.UTC(year, month, day, 18, 15, 0); // Türkiye 21:15 = UTC 18:15

  if (nowUtc >= closeUtcMs) {
    closeUtcMs = Date.UTC(year, month, day + 1, 18, 15, 0);
  }

  return closeUtcMs;
}

function getClassInfo(value) {
  return CLASSES.find(c => c.value === value);
}

function getClassText(value) {
  const info = getClassInfo(value);
  if (!info) return "Class seçilmedi";
  return `${info.emoji} ${info.label}`;
}

function getClassDistributionText(poll) {
  const attendUserIds = [...poll.votes.attend];

  if (attendUserIds.length === 0) {
    return "Henüz katılacak oyuncu yok.";
  }

  const counts = {};

  for (const userId of attendUserIds) {
    const classValue = poll.classes.get(userId) || "secim_yok";
    counts[classValue] = (counts[classValue] || 0) + 1;
  }

  const lines = [];

  for (const classItem of CLASSES) {
    if (counts[classItem.value]) {
      lines.push(`${classItem.emoji} ${classItem.label}: **${counts[classItem.value]}**`);
    }
  }

  if (counts.secim_yok) {
    lines.push(`❔ Class seçilmedi: **${counts.secim_yok}**`);
  }

  return lines.join("\n") || "Henüz class seçimi yok.";
}

function createWarEmbed(poll) {
  const attendCount = poll.votes.attend.size;
  const notAttendCount = poll.votes.not_attend.size;
  const maybeCount = poll.votes.maybe.size;
  const totalCount = attendCount + notAttendCount + maybeCount;

  const closeText = poll.closeAt
    ? `Türkiye saatiyle **21:15**\nDiscord zamanı: <t:${Math.floor(poll.closeAt / 1000)}:F> (<t:${Math.floor(poll.closeAt / 1000)}:R>)`
    : "Türkiye saatiyle 21:15";

  return new EmbedBuilder()
    .setColor(poll.closed ? 0x808080 : 0x5865F2)
    .setTitle(poll.closed ? "🔒 SAVAŞ KATILIM DURUMU KAPANDI" : "⚔️ SAVAŞ KATILIM DURUMU")
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
        name: "Class Dağılımı",
        value: getClassDistributionText(poll),
        inline: false
      },
      {
        name: "Ayarlar",
        value:
          `Durum: **${poll.closed ? "Kapalı" : "Açık"}**\n` +
          `⏱️ Otomatik kapanış: ${closeText}\n` +
          "⚖️ 1 seçeneğe izin verildi\n" +
          `🆔 Anket Kimliği: \`${poll.id}\``,
        inline: false
      }
    )
    .setFooter({ text: "SUVARI War Bot" })
    .setTimestamp();
}

function createWarButtons(pollId, disabled = false) {
  const poll = warPolls.get(pollId);

  const attendCount = poll ? poll.votes.attend.size : 0;
  const notAttendCount = poll ? poll.votes.not_attend.size : 0;
  const maybeCount = poll ? poll.votes.maybe.size : 0;

  const totalParticipants = attendCount + notAttendCount + maybeCount;

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`war_vote:${pollId}:attend`)
        .setLabel(`A ${attendCount}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),

      new ButtonBuilder()
        .setCustomId(`war_vote:${pollId}:not_attend`)
        .setLabel(`B ${notAttendCount}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),

      new ButtonBuilder()
        .setCustomId(`war_vote:${pollId}:maybe`)
        .setLabel(`C ${maybeCount}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`war_manage:${pollId}`)
        .setLabel("Oylarınızı yönetin")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),

      new ButtonBuilder()
        .setCustomId(`war_participants:${pollId}`)
        .setLabel(`Katılımcılar (${totalParticipants})`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(false)
    )
  ];
}

function createClassSelectMenu(pollId) {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`war_class:${pollId}`)
        .setPlaceholder("Class seç")
        .addOptions(
          CLASSES.map(classItem => ({
            label: classItem.label,
            value: classItem.value,
            emoji: classItem.emoji
          }))
        )
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

      const classText =
        voteType === "attend"
          ? ` • ${getClassText(poll.classes.get(userId))}`
          : "";

      return `${index + 1}. <@${userId}>${classText} — ${timeText}`;
    })
    .join("\n");
}

async function closePoll(poll, reason = "manual") {
  if (!poll || poll.closed) return;

  poll.closed = true;

  try {
    const channel = await client.channels.fetch(poll.channelId);
    const message = await channel.messages.fetch(poll.messageId);

    await message.edit({
      embeds: [createWarEmbed(poll)],
      components: createWarButtons(poll.id, true)
    });

    if (activePollId === poll.id) {
      activePollId = null;
    }

    if (activeCloseTimeout) {
      clearTimeout(activeCloseTimeout);
      activeCloseTimeout = null;
    }

    if (reason === "auto") {
      await channel.send("🔒 Savaş katılım anketi Türkiye saatiyle **21:15** olduğu için otomatik kapatıldı.");
    }
  } catch (error) {
    console.error("Anket kapatılamadı:", error);
  }
}

function scheduleAutoClose(poll) {
  if (activeCloseTimeout) {
    clearTimeout(activeCloseTimeout);
    activeCloseTimeout = null;
  }

  const delay = poll.closeAt - Date.now();

  if (delay <= 0) {
    closePoll(poll, "auto");
    return;
  }

  activeCloseTimeout = setTimeout(() => {
    closePoll(poll, "auto");
  }, delay);

  console.log(`⏱️ Anket otomatik kapanış zamanı: ${new Date(poll.closeAt).toISOString()} UTC`);
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
      if (!hasWarManagerPermission(interaction)) {
        await interaction.reply({
          content: "❌ Bu komutu kullanmak için War Manager rolüne sahip olmalısın.",
          ephemeral: true
        });
        return;
      }

      if (activePollId && warPolls.has(activePollId)) {
        await interaction.reply({
          content: "⚠️ Zaten aktif bir savaş anketi var. Bu anket Türkiye saatiyle 21:15'te otomatik kapanacak.",
          ephemeral: true
        });
        return;
      }

      const title = "Günlük Savaş Katılım Durumu";
      const pollId = Date.now().toString(36);
      const closeAt = getNextTurkeyCloseTimeMs();

      const poll = {
        id: pollId,
        title,
        channelId: interaction.channelId,
        messageId: null,
        createdBy: interaction.user.id,
        createdAt: Date.now(),
        closeAt,
        closed: false,
        votes: {
          attend: new Set(),
          not_attend: new Set(),
          maybe: new Set()
        },
        voteTimes: new Map(),
        classes: new Map()
      };

      warPolls.set(pollId, poll);
      activePollId = pollId;

      const sentMessage = await interaction.reply({
        content: "@everyone",
        embeds: [createWarEmbed(poll)],
        components: createWarButtons(pollId),
        fetchReply: true,
        allowedMentions: { parse: ["everyone"] }
      });

      poll.messageId = sentMessage.id;
      scheduleAutoClose(poll);
      return;
    }

    if (interaction.commandName === "war-close") {
      if (!hasWarManagerPermission(interaction)) {
        await interaction.reply({
          content: "❌ Bu komutu kullanmak için War Manager rolüne sahip olmalısın.",
          ephemeral: true
        });
        return;
      }

      if (!activePollId || !warPolls.has(activePollId)) {
        await interaction.reply({
          content: "⚠️ Aktif bir savaş anketi yok.",
          ephemeral: true
        });
        return;
      }

      const poll = warPolls.get(activePollId);
      await closePoll(poll, "manual");

      await interaction.reply({
        content: "✅ Savaş anketi kapatıldı. Oy verme butonları kilitlendi.",
        ephemeral: true
      });

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

    if (poll.closed && action !== "war_participants") {
      await interaction.reply({
        content: "🔒 Bu savaş anketi kapatılmış. Artık oy değiştirilemez.",
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

      if (voteType !== "attend") {
        poll.classes.delete(interaction.user.id);
      }

      await interaction.update({
        embeds: [createWarEmbed(poll)],
        components: createWarButtons(pollId)
      });

      if (voteType === "attend") {
        await interaction.followUp({
          content:
            `Oyun kaydedildi: **${getVoteLabel(voteType)}**\n\n` +
            "Şimdi classını seç:",
          components: createClassSelectMenu(pollId),
          ephemeral: true
        });
      } else {
        await interaction.followUp({
          content: `Oyun kaydedildi: **${getVoteLabel(voteType)}**`,
          ephemeral: true
        });
      }

      return;
    }

    if (action === "war_manage") {
      await interaction.reply({
        content:
          "Oyunu değiştirmek için tekrar A, B veya C butonuna basman yeterli.\n\n" +
          "A = Katılacağım\n" +
          "B = Katılamayacağım\n" +
          "C = Belki\n\n" +
          "A seçersen class seçimi de açılır.",
        ephemeral: true
      });
      return;
    }

    if (action === "war_participants") {
  if (!hasWarManagerPermission(interaction)) {
    await interaction.reply({
      content: "❌ Katılımcı listesini sadece War Manager görebilir.",
      ephemeral: true
    });
    return;
  }

  const text =
    `**Katılımcılar — ${poll.title}**\n\n` +
    `**Class Dağılımı**\n${getClassDistributionText(poll)}\n\n` +
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

  if (interaction.isStringSelectMenu()) {
    const [action, pollId] = interaction.customId.split(":");
    const poll = warPolls.get(pollId);

    if (!poll) {
      await interaction.reply({
        content: "Bu anket bulunamadı veya bot yeniden başlatıldığı için hafızadan silindi.",
        ephemeral: true
      });
      return;
    }

    if (poll.closed) {
      await interaction.reply({
        content: "🔒 Bu savaş anketi kapatılmış. Artık class seçimi değiştirilemez.",
        ephemeral: true
      });
      return;
    }

    if (action === "war_class") {
      if (!poll.votes.attend.has(interaction.user.id)) {
        await interaction.reply({
          content: "Class seçebilmek için önce A - Katılacağım seçeneğine oy vermelisin.",
          ephemeral: true
        });
        return;
      }

      const selectedClass = interaction.values[0];
      poll.classes.set(interaction.user.id, selectedClass);

      try {
        const channel = await client.channels.fetch(poll.channelId);
        const message = await channel.messages.fetch(poll.messageId);

        await message.edit({
          embeds: [createWarEmbed(poll)],
          components: createWarButtons(pollId)
        });
      } catch (error) {
        console.error("Anket mesajı güncellenemedi:", error);
      }

      await interaction.update({
        content: `Class seçimin kaydedildi: **${getClassText(selectedClass)}**`,
        components: []
      });

      return;
    }
  }
});

client.login(process.env.DISCORD_TOKEN);