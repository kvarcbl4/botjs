const config = require("./config");
const telegraf = require("telegraf");
const bot = new telegraf(config.token); // bot login
const Stage = require("telegraf/stage");
const request = require("request");
const stage = new Stage();
const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");
const Scene = require("telegraf/scenes/base");
const users = require("./users.json");
const session = require("telegraf/session");
const { send } = require("q");
let keyboard = [
  ["📦 Отправить архив 📦", "🤵‍♂️ Профиль 🤵‍♂️"],
  ["👤 Контакты  👤"],
];
var callbackQiwi = require("node-qiwi-api").callbackApi;
var asyncQiwi = require("node-qiwi-api").asyncApi;

var callbackWallet = new callbackQiwi(config.qiwiToken);
var asyncWallet = new asyncQiwi(config.qiwiToken);
let moneyLogger = {};

try{bot.use(session());
bot.use(stage.middleware());
bot.start(startHandler);
bot.command(`setmoney`, async (ctx) => {
  let args = ctx.message.text.split(/ +/);
  if (!args[1] || !args[2]) return ctx.reply(`Не верно введена команда`)
  let user = args[1];
  let sum = args[2];
  ctx.reply(
    `✅ К балансу *пользователя:* [${users[Number(user)].name}](tg://user?id=${
      users[Number(user)].id
    }) добавлено *${sum} RUB*`,
    { parse_mode: "Markdown" }
  );
  users[Number(user)].balance = users[Number(user)].balance + Number(sum);
  bot.telegram.sendMessage(
    Number(user),
    ` ✅ К вашему *балансу* добавлено *${sum} RUB*`,
    { parse_mode: "Markdown" }
  );
  fs.writeFile("./users.json", JSON.stringify(users, null, 2), (err) => {
    if (err) console.log(err);
  });
});
bot.hears("📦 Отправить архив 📦", (ctx) => ctx.scene.enter("sendZip"));
bot.hears(`👤 Контакты  👤`, async (ctx) => {
  ctx.reply(`Админы:\n\n@shelovesmypain`);
});
bot.hears(`🤵‍♂️ Профиль 🤵‍♂️`, async (ctx) => {
  ctx.reply(
    `👤 Профиль *пользователя:* [${ctx.from.first_name}](tg://user?id=${
      ctx.from.id
    })\n\n💸 Баланс: *${users[ctx.from.id].balance}* RUB`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "💲 Вывести", callback_data: "getMoney" }]],
      },
    }
  );
});
bot.launch().then(() => {
  console.log("[BOT] Запущен");
});
const download = (url, path, callback) => {
  request.head(url, (err, res, body) => {
    request(url).pipe(fs.createWriteStream(path)).on("close", callback);
  });
};
const getMoneyByUser = new Scene("getMoneyByUser");
getMoneyByUser.enter((ctx) => {
  ctx.reply(`💎 Введите сумму, которую хотите получить:`, {
    reply_markup: { keyboard: [["🔙 Назад"]], resize_keyboard: true },
  });
});
getMoneyByUser.on("text", async (ctx) => {
  if (ctx.message.text == "🔙 Назад") {
    ctx.scene.leave();
    return ctx.reply(`◀️ Возвращаемся в меню`, {
      reply_markup: { keyboard: keyboard, resize_keyboard: true },
    });
  }
  if (users[ctx.from.id].balance < ctx.message.text)
    return ctx.reply(`У вас недостаточно денег`);
  moneyLogger[ctx.from.id] = { sum: ctx.message.text.toString(), req: "" };
  ctx.scene.enter("enterRequizits");
});
stage.register(getMoneyByUser);
const enterRequizits = new Scene("enterRequizits");
enterRequizits.enter((ctx) => {
  ctx.reply(
    `💎 Сумма: *${
      moneyLogger[ctx.from.id].sum
    } RUB*\n\nВведите реквизиты: *(номер)*, н.п.*+79261234567*`,
    { parse_mode: "Markdown" }
  );
});
enterRequizits.on("text", async (ctx) => {
  if (ctx.message.text == "🔙 Назад") {
    ctx.scene.leave();
    return ctx.reply(`◀️ Возвращаемся в меню`, {
      reply_markup: { keyboard: keyboard, resize_keyboard: true },
    });
  }
  if (!ctx.message.text.startsWith("+") || ctx.message.text.length < 12)
    return ctx.reply(`Не верно указаны реквизиты`);
  moneyLogger[ctx.from.id].req = ctx.message.text;
  ctx.reply(`Ожидайте выплаты!`, { reply_markup: { keyboard: keyboard } });
  ctx.scene.leave()
  users[ctx.from.id].balance =
    users[ctx.from.id].balance - Number(moneyLogger[ctx.from.id].sum);
  fs.writeFile("./users.json", JSON.stringify(users, null, 2), (err) => {
    if (err) console.log(err);
  });
  await callbackWallet.toWallet(
    {
      amount: moneyLogger[ctx.from.id].sum,
      comment: "test",
      account: ctx.message.text,
    },
    (err, data) => {
      if (err) {
        console.log(err);
      }
      console.log(data);
    }
  );
});
stage.register(enterRequizits);
const sendZip = new Scene("sendZip");
sendZip.enter((ctx) => {
  ctx.reply(`👁 Отправьте архив`, {
    reply_markup: { keyboard: [["🔙 Назад"]], resize_keyboard: true },
  });
});
sendZip.on("document", async (ctx) => {
  if (!ctx.message.document.file_name.includes(".zip"))
    return ctx.reply(`Отправьте архив!`);
  if (users[ctx.from.id].status == "wait")
    return ctx.reply(`Вы уже отправляли архив! Подождите`);
  let num = Math.floor(Math.random() * 999999);
  bot.telegram
    .sendDocument(config.chatID, ctx.message.document.file_id.toString(), {
      caption: `Пользователь: [${ctx.from.first_name}](tg://user?id=${ctx.from.id})\nНомер: *${num}*\nID: \`${ctx.from.id}\` `,
      parse_mode: "Markdown",
    })
    .then((msg) => {
      users[ctx.from.id].status = "wait";
      users[ctx.from.id].docID = msg.message_id;
      users[ctx.from.id].num = num;
      users[ctx.from.id].fileID = ctx.message.document.file_id.toString();
      fs.writeFile("./users.json", JSON.stringify(users, null, 2), (err) => {
        if (err) console.log(err);
      });
      bot.telegram
        .sendMessage(
          config.chatID,
          `Пользователь: [${ctx.from.first_name}](tg://user?id=${ctx.from.id})\nНомер: *${num}*\nID: ${ctx.from.id}`,
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [{ text: "✅ Принять архив", callback_data: `acceptArchive` }],
                [
                  {
                    text: "❌ Отклонить архив",
                    callback_data: "refuseArchive",
                  },
                ],
              ],
            },
          }
        )
        .then((msg) => {
          users[ctx.from.id].msg = msg.message_id;
          fs.writeFile(
            "./users.json",
            JSON.stringify(users, null, 2),
            (err) => {
              if (err) console.log(err);
            }
          );
        });
    });
  ctx.reply(`Архив принят! Ожидайте! Номер архива: *#${num}*`, {
    parse_mode: "Markdown",
    reply_markup: { keyboard: keyboard, resize_keyboard: true },
  });
});
sendZip.hears("🔙 Назад", async (ctx) => {
  ctx.reply(`◀️ Возвращаемся в меню`, {
    reply_markup: { keyboard: keyboard, resize_keyboard: true },
  });
});
stage.register(sendZip);
bot.on("callback_query", async (ctx) => {
  if (ctx.update.callback_query.data == "acceptArchive") {
    ctx.deleteMessage();
    for (var i in users) {
      if (
        users[i].msg == ctx.update.callback_query.message.message_id.toString()
      ) {
        bot.telegram.sendMessage(
          users[i].id,
          `✅ Ваш архив *#${users[i].num}* принят! Ожидайте начисления средств!`,
          { parse_mode: "Markdown" }
        );
        users[ctx.from.id].status = "start";
        ctx.reply(
          `✅ Архив *#${users[i].num}* был принят. Не забудьте выдать выплату пользователю\n\n\`/setmoney id sum\`!`,
          { parse_mode: "Markdown" }
        );
        bot.telegram.editMessageCaption(
          config.chatID,
          users[i].docID,
          null,
          `Пользователь: [${users[i].name}](tg://user?id=${users[i].id})\nНомер: ${users[i].num}\nID: ${users[i].id}\n\n✅ Архив принят`,
          { parse_mode: "Markdown", reply_markup: null }
        );
      }
    }
    fs.writeFile("./users.json", JSON.stringify(users, null, 2), (err) => {
      if (err) console.log(err);
    });
  } else if (ctx.update.callback_query.data == "refuseArchive") {
    ctx.deleteMessage();
    for (var i in users) {
      if (
        users[i].msg == ctx.update.callback_query.message.message_id.toString()
      ) {
        bot.telegram.sendMessage(
          users[i].id,
          `❌ Ваш архив *#${users[i].num}* не принят!`,
          { parse_mode: "Markdown" }
        );
        users[ctx.from.id].status = "start";
        ctx.reply(`❌ Архив *#${users[i].num}* не был принят.`, {
          parse_mode: "Markdown",
        });
        bot.telegram.editMessageCaption(
          config.chatID,
          users[i].docID,
          null,
          `Пользователь: [${users[i].name}](tg://user?id=${users[i].id})\nНомер: ${users[i].num}\nID: ${users[i].id}\n\n❌ Архив не принят`,
          { parse_mode: "Markdown", reply_markup: null }
        );
      }
    }
    fs.writeFile("./users.json", JSON.stringify(users, null, 2), (err) => {
      if (err) console.log(err);
    });
  } else if (ctx.update.callback_query.data == "getMoney") {
    ctx.deleteMessage();
    ctx.scene.enter("getMoneyByUser");
  }
});
async function startHandler(ctx) {
  if (!users[ctx.from.id]) {
    users[ctx.from.id] = {
      username: ctx.from.username,
      name: ctx.from.first_name,
      id: ctx.from.id,
      fileID: "",
      docID: 0,
      msg: 0,
      status: "start",
      num: 0,
      balance: 0,
    };
  }
  ctx.reply(`Hello`, {
    reply_markup: { keyboard: keyboard, resize_keyboard: true },
  });
  fs.writeFile("./users.json", JSON.stringify(users, null, 2), (err) => {
    if (err) console.log(err);
  });
}}catch{
  console.log("hello")
}