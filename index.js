const { Client, GatewayIntentBits, Partials } = require("discord.js");
const mineflayer = require("mineflayer");
const fs = require("fs");
const path = require("path");

// توكن البوت
const token = "MTM0ODEwODA5NjA3NzE3Mjc1Ng.G-Qr-4.GP3eCMgyyB4kwgiALFDJj3Mqdcbw12VENzgdt4";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// معرفات الأدمن (يمكن إضافة أكثر من ID)
const admins = new Set(["1266406505024983111"]);

// خريطة المستخدم -> بوت واحد أو أكثر (حسب هل هو أدمن)
const userBots = new Map();

// مسار ملف البيانات
const dataFilePath = path.join(__dirname, "data.json");

// تحميل بيانات اللاعبين (النقاط + بيانات البوت)
let playersData = {};
try {
  if (fs.existsSync(dataFilePath)) {
    const rawData = fs.readFileSync(dataFilePath, "utf8");
    playersData = JSON.parse(rawData);
  }
} catch (e) {
  console.error("خطأ في قراءة ملف data.json:", e);
}

// حفظ بيانات اللاعبين إلى الملف
function savePlayersData() {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(playersData, null, 2), "utf8");
  } catch (e) {
    console.error("خطأ في حفظ ملف data.json:", e);
  }
}

// دالة الحصول على نقاط مستخدم
function getUserPoints(userId) {
  if (!playersData[userId]) playersData[userId] = { points: 0, botData: null };
  return playersData[userId].points || 0;
}

// دالة تعيين نقاط مستخدم
function setUserPoints(userId, points) {
  if (!playersData[userId]) playersData[userId] = { points: 0, botData: null };
  playersData[userId].points = points;
  savePlayersData();
}

// دالة تعيين بيانات بوت المستخدم
function setUserBotData(userId, botData) {
  if (!playersData[userId]) playersData[userId] = { points: 0, botData: null };
  playersData[userId].botData = botData;
  savePlayersData();
}

// دالة حذف بيانات بوت المستخدم
function deleteUserBotData(userId) {
  if (playersData[userId]) {
    playersData[userId].botData = null;
    savePlayersData();
  }
}

// دالة لإنشاء وتشغيل بوت مع البيانات المعطاة
function createAndStartBot(userId, botData, message, isAdmin) {
  const bot = mineflayer.createBot({
    host: botData.ip,
    port: parseInt(botData.port),
    username: botData.botName,
    version: botData.version,
  });

  bot.on("login", () => {
    message.channel.send("✅ البوت دخل الى السيرفر بنجاح");

    // خصم نقطة عند تشغيل البوت (للمستخدم العادي فقط)
    if (!isAdmin) {
      const current = getUserPoints(userId);
      setUserPoints(userId, current - 1);
      message.channel.send(`🟡 تم خصم نقطة. نقاطك المتبقية: ${current - 1}`);
    }
  });

  if (botData.shouldMove.toLowerCase() === "نعم") {
    const moveInterval = setInterval(() => {
      const yaw = Math.random() * Math.PI * 2;
      bot.look(yaw, 0, true);
      bot.setControlState("forward", true);
      setTimeout(() => bot.setControlState("forward", false), 2000);
    }, 10000);
    bot.moveInterval = moveInterval;
  }

  if (parseInt(botData.msgInterval) > 0 && botData.messageToSend) {
    const chatInterval = setInterval(() => {
      bot.chat(botData.messageToSend);
    }, parseInt(botData.msgInterval) * 60 * 1000);
    bot.chatInterval = chatInterval;
  }

  bot.on("end", () => {
    message.channel.send(`⚠️ البوت خرج من السيرفر. (المستخدم: <@${userId}>)`);
    try {
      bot.quit("البوت مات");
    } catch {}

    if (isAdmin) {
      const botsArray = userBots.get(userId) || [];
      const index = botsArray.indexOf(bot);
      if (index !== -1) {
        botsArray.splice(index, 1);
        userBots.set(userId, botsArray);
      }
    } else {
      userBots.delete(userId);
    }
  });

  bot.on("error", (err) => {
    message.channel.send(`❌ خطأ: ${err.message}`);
  });

  if (isAdmin) {
    if (!userBots.has(userId)) userBots.set(userId, []);
    userBots.get(userId).push(bot);
  } else {
    userBots.set(userId, bot);
  }
}

client.on("ready", () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);

  // تشغيل بوتات محفوظة تلقائياً
  for (const [userId, data] of Object.entries(playersData)) {
    const isAdmin = admins.has(userId);
    if (!isAdmin && data.botData) {
      createAndStartBot(
        userId,
        data.botData,
        {
          channel: {
            send: (msg) => console.log(`رسالة تلقائية (لمستخدم ${userId}): ${msg}`),
          },
        },
        isAdmin
      );
    }
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;
  const isAdmin = admins.has(userId);

  // أمر عرض النقاط
  if (message.content === "!نقاط") {
    const points = getUserPoints(userId);
    return message.channel.send(`📌 نقاطك الحالية: ${points} نقطة`);
  }

  // أمر إعطاء نقاط (للأدمن فقط)
  if (message.content.startsWith("!اعطاء")) {
    if (!isAdmin) return message.channel.send("❌ هذا الأمر للأدمن فقط.");

    const args = message.content.split(" ");
    const mention = message.mentions.users.first();
    const amount = parseInt(args[2]);

    if (!mention || isNaN(amount)) {
      return message.channel.send("⚠️ الصيغة: !اعطاء @شخص عدد");
    }

    const targetId = mention.id;
    const current = getUserPoints(targetId);
    setUserPoints(targetId, current + amount);
    return message.channel.send(`✅ تم إعطاء ${amount} نقطة إلى <@${targetId}>.`);
  }

  // أمر تعديل 1 لإعادة تشغيل الأسئلة وتعديل البوت (يعمل فقط للمستخدم العادي)
  if (message.content === "!تعديل 1") {
    if (!userBots.has(userId)) {
      return message.channel.send("⚠️ لا يوجد بوت لتعديله. استخدم !start أولاً.");
    }

    // حذف البوت الحالي
    const bot = userBots.get(userId);
    if (bot.moveInterval) clearInterval(bot.moveInterval);
    if (bot.chatInterval) clearInterval(bot.chatInterval);
    bot.quit("تم إيقاف البوت للتعديل");
    userBots.delete(userId);

    // حذف بيانات البوت المحفوظة (لأنه سيتم إعادة الحفظ بعد تشغيل جديد)
    deleteUserBotData(userId);

    // إعادة استدعاء منطق !start
    message.content = "!start";
    client.emit("messageCreate", message);
    return;
  }

  // أمر تشغيل بوت محفوظ من data.json
  if (message.content === "!تشغيل 1") {
    const data = playersData[userId];
    if (!data || !data.botData) {
      return message.channel.send("⚠️ لا يوجد بوت محفوظ لديك في البيانات. استخدم !start لتشغيل بوت جديد.");
    }
    if (userBots.has(userId)) {
      return message.channel.send("⚠️ لديك بوت شغال بالفعل. استخدم !وقف أولاً.");
    }

    // شرط وجود نقطة واحدة على الأقل لتشغيل البوت (للمستخدم العادي)
    if (!isAdmin) {
      const points = getUserPoints(userId);
      if (points < 1) {
        return message.channel.send("❌ تحتاج إلى نقطة واحدة لتشغيل البوت.");
      }
    }

    // تشغيل البوت باستخدام البيانات المحفوظة
    createAndStartBot(userId, data.botData, message, isAdmin);

    return;
  }

  // أمر بدء بوت ماينكرافت
  if (message.content === "!start") {
    if (!isAdmin && userBots.has(userId)) {
      return message.channel.send("⚠️ لديك بوت ماينكرافت شغال بالفعل. استخدم !وقف لإيقافه أولاً.");
    }

    // شرط وجود نقطة واحدة على الأقل لتشغيل البوت للمستخدم العادي
    if (!isAdmin) {
      const points = getUserPoints(userId);
      if (points < 1) {
        return message.channel.send("❌ تحتاج إلى نقطة واحدة لتشغيل البوت.");
      }
    }

    const filter = (m) => m.author.id === userId;

    const ask = async (question) => {
      await message.channel.send(question);
      const collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000 });
      if (!collected.size) throw new Error("⛔ انتهى الوقت.");
      return collected.first().content;
    };

    try {
      const ip = await ask("🟢 ما هو IP السيرفر؟");
      const port = await ask("🔵 ما هو البورت؟");
      const version = await ask("🟣 ما هو إصدار ماينكرافت؟ (مثال: 1.20)");
      const botName = await ask("🟡 ما هو اسم البوت؟");
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const mineflayer = require("mineflayer");
const fs = require("fs");
const path = require("path");

// توكن البوت
const token = "MTM0ODEwODA5NjA3NzE3Mjc1Ng.G-Qr-4.GP3eCMgyyB4kwgiALFDJj3Mqdcbw12VENzgdt4";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// معرفات الأدمن (يمكن إضافة أكثر من ID)
const admins = new Set(["1266406505024983111"]);

// خريطة المستخدم -> بوت واحد أو أكثر (حسب هل هو أدمن)
const userBots = new Map();

// مسار ملف البيانات
const dataFilePath = path.join(__dirname, "data.json");

// تحميل بيانات اللاعبين (النقاط + بيانات البوت)
let playersData = {};
try {
  if (fs.existsSync(dataFilePath)) {
    const rawData = fs.readFileSync(dataFilePath, "utf8");
    playersData = JSON.parse(rawData);
  }
} catch (e) {
  console.error("خطأ في قراءة ملف data.json:", e);
}

// حفظ بيانات اللاعبين إلى الملف
function savePlayersData() {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(playersData, null, 2), "utf8");
  } catch (e) {
    console.error("خطأ في حفظ ملف data.json:", e);
  }
}

// دالة الحصول على نقاط مستخدم
function getUserPoints(userId) {
  if (!playersData[userId]) playersData[userId] = { points: 0, botData: null };
  return playersData[userId].points || 0;
}

// دالة تعيين نقاط مستخدم
function setUserPoints(userId, points) {
  if (!playersData[userId]) playersData[userId] = { points: 0, botData: null };
  playersData[userId].points = points;
  savePlayersData();
}

// دالة تعيين بيانات بوت المستخدم
function setUserBotData(userId, botData) {
  if (!playersData[userId]) playersData[userId] = { points: 0, botData: null };
  playersData[userId].botData = botData;
  savePlayersData();
}

// دالة حذف بيانات بوت المستخدم
function deleteUserBotData(userId) {
  if (playersData[userId]) {
    playersData[userId].botData = null;
    savePlayersData();
  }
}

// دالة لإنشاء وتشغيل بوت مع البيانات المعطاة
function createAndStartBot(userId, botData, message, isAdmin) {
  const bot = mineflayer.createBot({
    host: botData.ip,
    port: parseInt(botData.port),
    username: botData.botName,
    version: botData.version,
  });

  bot.on("login", () => {
    message.channel.send("✅ البوت دخل الى السيرفر بنجاح");

    // خصم نقطة عند تشغيل البوت (للمستخدم العادي فقط)
    if (!isAdmin) {
      const current = getUserPoints(userId);
      setUserPoints(userId, current - 1);
      message.channel.send(`🟡 تم خصم نقطة. نقاطك المتبقية: ${current - 1}`);
    }
  });

  if (botData.shouldMove.toLowerCase() === "نعم") {
    const moveInterval = setInterval(() => {
      const yaw = Math.random() * Math.PI * 2;
      bot.look(yaw, 0, true);
      bot.setControlState("forward", true);
      setTimeout(() => bot.setControlState("forward", false), 2000);
    }, 10000);
    bot.moveInterval = moveInterval;
  }

  if (parseInt(botData.msgInterval) > 0 && botData.messageToSend) {
    const chatInterval = setInterval(() => {
      bot.chat(botData.messageToSend);
    }, parseInt(botData.msgInterval) * 60 * 1000);
    bot.chatInterval = chatInterval;
  }

  bot.on("end", () => {
    message.channel.send(`⚠️ البوت خرج من السيرفر. (المستخدم: <@${userId}>)`);
    try {
      bot.quit("البوت مات");
    } catch {}

    if (isAdmin) {
      const botsArray = userBots.get(userId) || [];
      const index = botsArray.indexOf(bot);
      if (index !== -1) {
        botsArray.splice(index, 1);
        userBots.set(userId, botsArray);
      }
    } else {
      userBots.delete(userId);
    }
  });

  bot.on("error", (err) => {
    message.channel.send(`❌ خطأ: ${err.message}`);
  });

  if (isAdmin) {
    if (!userBots.has(userId)) userBots.set(userId, []);
    userBots.get(userId).push(bot);
  } else {
    userBots.set(userId, bot);
  }
}

client.on("ready", () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);

  // تشغيل بوتات محفوظة تلقائياً
  for (const [userId, data] of Object.entries(playersData)) {
    const isAdmin = admins.has(userId);
    if (!isAdmin && data.botData) {
      createAndStartBot(
        userId,
        data.botData,
        {
          channel: {
            send: (msg) => console.log(`رسالة تلقائية (لمستخدم ${userId}): ${msg}`),
          },
        },
        isAdmin
      );
    }
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;
  const isAdmin = admins.has(userId);

  // أمر عرض النقاط
  if (message.content === "!نقاط") {
    const points = getUserPoints(userId);
    return message.channel.send(`📌 نقاطك الحالية: ${points} نقطة`);
  }

  // أمر إعطاء نقاط (للأدمن فقط)
  if (message.content.startsWith("!اعطاء")) {
    if (!isAdmin) return message.channel.send("❌ هذا الأمر للأدمن فقط.");

    const args = message.content.split(" ");
    const mention = message.mentions.users.first();
    const amount = parseInt(args[2]);

    if (!mention || isNaN(amount)) {
      return message.channel.send("⚠️ الصيغة: !اعطاء @شخص عدد");
    }

    const targetId = mention.id;
    const current = getUserPoints(targetId);
    setUserPoints(targetId, current + amount);
    return message.channel.send(`✅ تم إعطاء ${amount} نقطة إلى <@${targetId}>.`);
  }

  // أمر تعديل 1 لإعادة تشغيل الأسئلة وتعديل البوت (يعمل فقط للمستخدم العادي)
  if (message.content === "!تعديل 1") {
    if (!userBots.has(userId)) {
      return message.channel.send("⚠️ لا يوجد بوت لتعديله. استخدم !start أولاً.");
    }

    // حذف البوت الحالي
    const bot = userBots.get(userId);
    if (bot.moveInterval) clearInterval(bot.moveInterval);
    if (bot.chatInterval) clearInterval(bot.chatInterval);
    bot.quit("تم إيقاف البوت للتعديل");
    userBots.delete(userId);

    // حذف بيانات البوت المحفوظة (لأنه سيتم إعادة الحفظ بعد تشغيل جديد)
    deleteUserBotData(userId);

    // إعادة استدعاء منطق !start
    message.content = "!start";
    client.emit("messageCreate", message);
    return;
  }

  // أمر تشغيل بوت محفوظ من data.json
  if (message.content === "!تشغيل 1") {
    const data = playersData[userId];
    if (!data || !data.botData) {
      return message.channel.send("⚠️ لا يوجد بوت محفوظ لديك في البيانات. استخدم !start لتشغيل بوت جديد.");
    }
    if (userBots.has(userId)) {
      return message.channel.send("⚠️ لديك بوت شغال بالفعل. استخدم !وقف أولاً.");
    }

    // شرط وجود نقطة واحدة على الأقل لتشغيل البوت (للمستخدم العادي)
    if (!isAdmin) {
      const points = getUserPoints(userId);
      if (points < 1) {
        return message.channel.send("❌ تحتاج إلى نقطة واحدة لتشغيل البوت.");
      }
    }

    // تشغيل البوت باستخدام البيانات المحفوظة
    createAndStartBot(userId, data.botData, message, isAdmin);

    return;
  }

  // أمر بدء بوت ماينكرافت
  if (message.content === "!start") {
    if (!isAdmin && userBots.has(userId)) {
      return message.channel.send("⚠️ لديك بوت ماينكرافت شغال بالفعل. استخدم !وقف لإيقافه أولاً.");
    }

    // شرط وجود نقطة واحدة على الأقل لتشغيل البوت للمستخدم العادي
    if (!isAdmin) {
      const points = getUserPoints(userId);
      if (points < 1) {
        return message.channel.send("❌ تحتاج إلى نقطة واحدة لتشغيل البوت.");
      }
    }

    const filter = (m) => m.author.id === userId;

    const ask = async (question) => {
      await message.channel.send(question);
      const collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000 });
      if (!collected.size) throw new Error("⛔ انتهى الوقت.");
      return collected.first().content;
    };

    try {
      const ip = await ask("🟢 ما هو IP السيرفر؟");
      const port = await ask("🔵 ما هو البورت؟");
      const version = await ask("🟣 ما هو إصدار ماينكرافت؟ (مثال: 1.20)");
      const botName = await ask("🟡 ما هو اسم البوت؟");
      const shouldMove = await ask("⚪ هل تريد أن يتحرك البوت كل 10 ثواني؟ (نعم/لا)");
      const msgInterval = await ask("🟤 كم دقيقة بين كل رسالة يرسلها البوت؟ (0 لإلغاء الإرسال)");
      const messageToSend = msgInterval !== "0" ? await ask("🔴 ما هي الرسالة التي تريد أن يرسلها البوت؟") : null;

      // حفظ بيانات البوت في data.json
      setUserBotData(userId, {
        ip,
        port,
        version,
        botName,
        shouldMove,
        msgInterval,
        messageToSend,
      });

      createAndStartBot(userId, playersData[userId].botData, message, isAdmin);
    } catch (err) {
      message.channel.send("⛔ انتهى الوقت أو حدث خطأ.");
    }
  }

  // أمر وقف بوتات المستخدم نفسه فقط
  if (message.content === "!وقف") {
    if (!userBots.has(userId)) {
      return message.channel.send("⚠️ ليس لديك بوت ماينكرافت شغال حالياً.");
    }

    if (isAdmin) {
      const botsArray = userBots.get(userId);
      for (const bot of botsArray) {
        if (bot.moveInterval) clearInterval(bot.moveInterval);
        if (bot.chatInterval) clearInterval(bot.chatInterval);
        bot.quit("تم إيقاف البوت بأمر المستخدم");
      }
      userBots.delete(userId);
      message.channel.send("✅ تم إيقاف جميع بوتات ماينكرافت الخاصة بك.");
    } else {
      const bot = userBots.get(userId);
      if (bot.moveInterval) clearInterval(bot.moveInterval);
      if (bot.chatInterval) clearInterval(bot.chatInterval);
      bot.quit("تم إيقاف البوت بأمر المستخدم");
      userBots.delete(userId);
      message.channel.send("✅ تم إيقاف بوت ماينكرافت الخاص بك.");
    }
  }

  // أمر توقيف_الكل (للأدمن فقط) لإيقاف كل بوتات كل المستخدمين
  if (message.content === "!توقيف_الكل") {
    if (!isAdmin) {
      return message.channel.send("❌ أنت لست أدمن ولا يمكنك استخدام هذا الأمر.");
    }

    let totalStopped = 0;

    for (const [uid, botsOrBot] of userBots.entries()) {
      if (Array.isArray(botsOrBot)) {
        // حالة الأدمن: مصفوفة بوتات
        for (const bot of botsOrBot) {
          if (bot.moveInterval) clearInterval(bot.moveInterval);
          if (bot.chatInterval) clearInterval(bot.chatInterval);
          bot.quit("تم إيقاف البوت بأمر توقيف_الكل");
          totalStopped++;
        }
      } else {
        // حالة المستخدم العادي: بوت واحد
        if (botsOrBot.moveInterval) clearInterval(botsOrBot.moveInterval);
        if (botsOrBot.chatInterval) clearInterval(botsOrBot.chatInterval);
        botsOrBot.quit("تم إيقاف البوت بأمر توقيف_الكل");
        totalStopped++;
      }
    }

    userBots.clear();

    message.channel.send(`✅ تم إيقاف جميع البوتات (${totalStopped}).`);
  }
});

client.login(token);￼Enter      const shouldMove = await ask("⚪ هل تريد أن يتحرك البوت كل 10 ثواني؟ (نعم/لا)");
      const msgInterval = await ask("🟤 كم دقيقة بين كل رسالة يرسلها البوت؟ (0 لإلغاء الإرسال)");
      const messageToSend = msgInterval !== "0" ? await ask("🔴 ما هي الرسالة التي تريد أن يرسلها البوت؟") : null;

      // حفظ بيانات البوت في data.json
      setUserBotData(userId, {
        ip,
        port,
        version,
        botName,
        shouldMove,
        msgInterval,
        messageToSend,
      });

      createAndStartBot(userId, playersData[userId].botData, message, isAdmin);
    } catch (err) {
      message.channel.send("⛔ انتهى الوقت أو حدث خطأ.");
    }
  }

  // أمر وقف بوتات المستخدم نفسه فقط
  if (message.content === "!وقف") {
    if (!userBots.has(userId)) {
      return message.channel.send("⚠️ ليس لديك بوت ماينكرافت شغال حالياً.");
    }
f (isAdmin) {
      const botsArray = userBots.get(userId);
      for (const bot of botsArray) {
        if (bot.moveInterval) clearInterval(bot.moveInterval);
        if (bot.chatInterval) clearInterval(bot.chatInterval);
        bot.quit("تم إيقاف البوت بأمر المستخدم");
      }
      userBots.delete(userId);
      message.channel.send("✅ تم إيقاف جميع بوتات ماينكرافت الخاصة بك.");
    } else {
      const bot = userBots.get(userId);
      if (bot.moveInterval) clearInterval(bot.moveInterval);
      if (bot.chatInterval) clearInterval(bot.chatInterval);
      bot.quit("تم إيقاف البوت بأمر المستخدم");
      userBots.delete(userId);
      message.channel.send("✅ تم إيقاف بوت ماينكرافت الخاص بك.");
    }
  }

  // أمر توقيف_الكل (للأدمن فقط) لإيقاف كل بوتات كل المستخدمين
  if (message.content === "!توقيف_الكل") {
    if (!isAdmin) {
      return message.channel.send("❌ أنت لست أدمن ولا يمكنك استخدام هذا الأمر.");
    }

