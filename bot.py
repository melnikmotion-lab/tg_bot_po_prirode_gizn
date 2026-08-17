import asyncio
import os
import threading
from flask import Flask
from aiogram import Bot, Dispatcher, F
from aiogram.types import (
    Message, ReplyKeyboardMarkup, ReplyKeyboardRemove, KeyboardButton,
    InlineKeyboardMarkup, InlineKeyboardButton, LinkPreviewOptions,
    BotCommand, MenuButtonCommands, CallbackQuery, FSInputFile
)
from aiogram.filters import Command
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError

BOT_TOKEN = os.environ.get("BOT_TOKEN")
if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN environment variable is not set")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

ADMIN_ID = -1003803972470

async def notify_admin(text):
    try:
        await bot.send_message(ADMIN_ID, text)
    except Exception:
        pass

# === КАРТИНКИ / ССЫЛКИ ===

WELCOME_PHOTO_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "welcome.png")
VIDEO_URL = "https://youtu.be/4vB23x-aU0Q"
CHANNEL_USERNAME = "@Prirodo_ved"

WRITE_DIRECTLY_URL = "https://t.me/Prirodo_ved?direct"

# === КЛАВИАТУРЫ ===

start_kb = InlineKeyboardMarkup(
    inline_keyboard=[[InlineKeyboardButton(text="🚀 Начать тест", callback_data="start_test")]]
)

subscribe_kb = InlineKeyboardMarkup(
    inline_keyboard=[[InlineKeyboardButton(text="✅ Подписка есть", callback_data="check_subscription")]]
)

video_kb = InlineKeyboardMarkup(
    inline_keyboard=[[InlineKeyboardButton(text="🎬 Смотреть видео", url=VIDEO_URL)]]
)

apply_kb = InlineKeyboardMarkup(
    inline_keyboard=[[InlineKeyboardButton(text="📩 Оставить заявку", callback_data="apply")]]
)

write_directly_kb = InlineKeyboardMarkup(
    inline_keyboard=[[InlineKeyboardButton(text="✍️ Написать мне самому", url=WRITE_DIRECTLY_URL)]]
)

# === ШКАЛА ОТВЕТОВ ===

SCALE = [
    ("Согласен(а)", 4),
    ("Скорее да", 3),
    ("Нейтрально", 2),
    ("Скорее нет", 1),
    ("Несогласен(а)", 0),
]
SCALE_SCORES = {label: score for label, score in SCALE}

def scale_keyboard():
    keyboard = [[KeyboardButton(text=label)] for label, _ in SCALE]
    return ReplyKeyboardMarkup(keyboard=keyboard, resize_keyboard=True)

# === ВОПРОСЫ (20 утверждений) ===

QUESTIONS = [
    "Первые мысли после того как я открыл глаза: «Боже, как же я не хочу работать»",
    "Я считаю, что работа это страдания, а люди которые счастливы на работе — это вымысел",
    "Я не верю что существует деятельность которая будет мне по-настоящему по душе",
    "Я часто ловлю себя на мысли «неужели это всё, на что я способен»",
    "Вечером я не хочу ложиться спать, потому что чувствую что только начинаю жить",
    "У меня есть ощущение что я трачу свою жизнь впустую",
    "Мне сложно объяснить другим чем я хочу заниматься, я сам не знаю",
    "Иногда мне хочется бросить всё и начать с чистого листа",
    "Простая работа меня угнетает, но я не верю, что справлюсь с большей ответственностью",
    "Моя деятельность приносит мне только деньги, но не внутреннее удовлетворение",
    "Я занимаюсь духовной практикой, но абсолютно не понимаю как реализоваться в социуме",
    "Мне стыдно признаться что я до сих пор не понимаю «кем я хочу стать, когда вырасту»",
    "Я меняю сферы и занятия, но внутри всё равно пусто",
    "Мне страшно, когда меня спрашивают, чем бы я хотел(а) заниматься в будущем",
    "Я устал(а) от ощущения что живу не своей жизнью, но не знаю как это изменить",
    "Я не понимаю как совместить свою духовную практику и свои материальные амбиции",
    "Я помогаю другим найти себя, но сам(а) до сих пор в поиске",
    "Иногда я думаю что люди которые «нашли себя» просто родились с этим знанием",
    "Я знаю что во мне есть потенциал, но не знаю как его раскрыть",
    "Я боюсь что так и проживу жизнь не поняв, зачем я живу",
]

# === ТЕКСТЫ РЕЗУЛЬТАТА ===

def result_text(score: int) -> str:
    if score <= 24:
        return (
            "Судя по ответам, ты уже достаточно хорошо понимаешь себя и находишься на своём месте.\n\n"
            "Если любопытно — у меня есть видео, где я рассказываю о том, как понять себя и чем "
            "заниматься в этой жизни, там раскрыта тема основной и дополнительной природы. "
            "Может, найдёшь там что-то новое для себя.\n\n"
            "В конце бонус: две практики, которые помогут ещё лучше прочувствовать свою природу.\n\n"
            "Хорошего просмотра."
        )
    elif score <= 49:
        return (
            "Судя по ответам, я вижу, что ты уже сделал много усилий, чтобы понять себя и свою природу, "
            "но где-то ещё чувствуешь потерянность или неуверенность.\n\n"
            "Специально для этого я создал видео, где рассказываю, как понять себя и чем заниматься "
            "в этой жизни. Там я рассказываю про основную и дополнительную природу, и почему это влияет "
            "на удовлетворённость и устойчивость в своей деятельности.\n\n"
            "В конце бонус: две практики, которые помогут увидеть, к какой природе у тебя есть склонности.\n\n"
            "Хорошего просмотра!"
        )
    else:
        return (
            "Судя по твоему ответу, я вижу запутанность и растерянность в вопросах своей природы и деятельности.\n\n"
            "Специально для этого я создал видео, где рассказываю, как понять себя и чем заниматься в этой жизни. "
            "Там я рассказываю про основную и дополнительную природу, чем чревато её непонимание, и какие подарки "
            "приходят, когда начинаешь ей следовать.\n\n"
            "В конце бонус: две практики, которые помогут увидеть, к какой природе у тебя есть склонности.\n\n"
            "Хорошего просмотра!"
        )

# === СОСТОЯНИЕ ПОЛЬЗОВАТЕЛЯ ===

user_data = {}

def ensure_user(user_id: int):
    if user_id not in user_data:
        user_data[user_id] = {
            "current_question": 0,
            "score": 0,
            "subscribed": False,
            "has_applied": False,
            "apply_prompt_scheduled": False,
        }
    return user_data[user_id]

async def send_question(message: Message, question_index: int):
    text = f"Вопрос {question_index + 1}/{len(QUESTIONS)}\n\n{QUESTIONS[question_index]}"
    await message.answer(text, reply_markup=scale_keyboard())

# === ШАГ 1: /start ===

@dp.message(Command("start"))
async def start(message: Message):
    ensure_user(message.from_user.id)

    welcome_text = (
        "👋 Привет, я очень рад встрече с тобой!\n\n"
        "Сейчас тебя ждёт тест. Он покажет, насколько ты сейчас живёшь в согласии со своей природой.\n"
        "Отвечай честно, так результат будет точнее."
    )
    try:
        photo = FSInputFile(WELCOME_PHOTO_PATH)
        await message.answer_photo(photo=photo, caption=welcome_text)
    except Exception as e:
        print(f"[welcome photo] failed to send: {e}")
        await message.answer(welcome_text)

    await message.answer(
        "Маленькая просьба, перед тем как пойдём дальше.\n\n"
        "Подпишись на мой <a href=\"https://t.me/Prirodo_ved\">ТГ-канал</a>, в котором я делюсь материалами "
        "по самопознанию и о том, как лучше понимать себя и других "
        "благодаря знанию о психотипах\n\n"
        "Как подпишешься — жми кнопку «Подписка есть» ✅",
        reply_markup=subscribe_kb,
        parse_mode="HTML",
        link_preview=LinkPreviewOptions(url="https://t.me/Prirodo_ved")
    )

# === ШАГ 1б: Проверка подписки ===

@dp.callback_query(F.data == "check_subscription")
async def check_subscription_callback(callback: CallbackQuery):
    user_id = callback.from_user.id
    await callback.answer()
    ensure_user(user_id)

    try:
        member = await bot.get_chat_member(chat_id=CHANNEL_USERNAME, user_id=user_id)
        is_subscribed = member.status in ("member", "administrator", "creator")
    except TelegramForbiddenError:
        is_subscribed = True
    except TelegramBadRequest as e:
        err = str(e).lower()
        is_subscribed = True if ("chat not found" in err or "bot is not a member" in err) else False
        if not is_subscribed:
            print(f"[subscription check] TelegramBadRequest: {e}")
    except Exception as e:
        print(f"[subscription check] Unexpected error: {e}")
        is_subscribed = True

    if not is_subscribed:
        await callback.message.answer(
            "Маленькая просьба, перед тем как пойдём дальше.\n\n"
            "Подпишись на мой <a href=\"https://t.me/Prirodo_ved\">ТГ-канал</a>, в котором я делюсь материалами "
            "по самопознанию и о том, как лучше понимать себя и других "
            "благодаря знанию о психотипах\n\n"
            "Как подпишешься — жми кнопку «Подписка есть» ✅",
            reply_markup=subscribe_kb,
            parse_mode="HTML",
            link_preview=LinkPreviewOptions(url="https://t.me/Prirodo_ved")
        )
        return

    user_data[user_id]["subscribed"] = True
    await callback.message.answer("Жми кнопку ниже, чтобы начать 👇", reply_markup=start_kb)

# === ШАГ 2: Начать тест ===

async def _do_start_test(message: Message, user_id: int):
    data = ensure_user(user_id)
    if not data.get("subscribed"):
        await message.answer(
            "Маленькая просьба, перед тем как пойдём дальше.\n\n"
            "Подпишись на мой <a href=\"https://t.me/Prirodo_ved\">ТГ-канал</a>, в котором я делюсь материалами "
            "по самопознанию и о том, как лучше понимать себя и других "
            "благодаря знанию о психотипах\n\n"
            "Как подпишешься — жми кнопку «Подписка есть» ✅",
            reply_markup=subscribe_kb,
            parse_mode="HTML",
            link_preview=LinkPreviewOptions(url="https://t.me/Prirodo_ved")
        )
        return

    data["current_question"] = 0
    data["score"] = 0
    await send_question(message, 0)

@dp.callback_query(F.data == "start_test")
async def start_test_callback(callback: CallbackQuery):
    await callback.answer()
    await _do_start_test(callback.message, callback.from_user.id)

# === ШАГ 3: Ответы на вопросы ===

@dp.message(F.text.in_(SCALE_SCORES.keys()))
async def handle_answer(message: Message):
    user_id = message.from_user.id
    if user_id not in user_data:
        await message.answer("Нажми /start, чтобы начать 🙂")
        return

    data = user_data[user_id]
    data["score"] += SCALE_SCORES[message.text]
    data["current_question"] += 1
    current = data["current_question"]

    if current < len(QUESTIONS):
        await send_question(message, current)
    else:
        await show_result(message, user_id, message.from_user)

# === ШАГ 4: Результат ===

async def show_result(message: Message, user_id: int, user):
    data = user_data[user_id]
    score = data["score"]

    await message.answer(
        f"Твой результат: {score} из 80 баллов",
        reply_markup=ReplyKeyboardRemove()
    )
    await message.answer(result_text(score))

    await notify_admin(
        f"📊 Новый результат теста\n"
        f"Имя: {user.full_name}\n"
        f"Username: @{user.username}\n"
        f"ID: {user_id}\n"
        f"Балл: {score} из 80"
    )

    await send_video_block(message, user_id)
    await schedule_apply_prompt(user_id, message.chat.id)

# === ШАГ 5: Видео (ссылка + кнопка, одним сообщением) ===

async def send_video_block(message: Message, user_id: int):
    await message.answer(
        f"Вот видео, где я подробно всё разбираю 👇\n\n{VIDEO_URL}",
        reply_markup=video_kb
    )

# === ШАГ 6: Заявка приходит отдельным сообщением через 10 минут ===

APPLY_DELAY_SECONDS = 10 * 60  # 10 минут

async def schedule_apply_prompt(user_id: int, chat_id: int):
    data = ensure_user(user_id)
    if data.get("apply_prompt_scheduled"):
        return
    data["apply_prompt_scheduled"] = True
    asyncio.create_task(_send_delayed_apply_prompt(user_id, chat_id))

async def _send_delayed_apply_prompt(user_id: int, chat_id: int):
    await asyncio.sleep(APPLY_DELAY_SECONDS)
    data = user_data.get(user_id)
    if data and data.get("has_applied"):
        return
    try:
        await bot.send_message(
            chat_id,
            "Оставить заявку на личную работу можешь по кнопке ниже",
            reply_markup=apply_kb
        )
    except Exception as e:
        print(f"[delayed apply prompt] failed to send: {e}")

# === Кнопка "Оставить заявку" ===

@dp.callback_query(F.data == "apply")
async def apply_callback(callback: CallbackQuery):
    user_id = callback.from_user.id
    user = callback.from_user
    await callback.answer()
    data = ensure_user(user_id)

    if not data.get("has_applied"):
        data["has_applied"] = True
        await notify_admin(
            f"📩 Новая заявка!\n"
            f"Имя: {user.full_name}\n"
            f"Username: @{user.username}\n"
            f"ID: {user_id}\n"
            f"Балл: {data.get('score', '—')} из 80"
        )
        await callback.message.answer(
            "Принял! Скоро я тебе напишу 🙂\n\n"
            "Если не хочешь ждать, то напиши мне первым!",
            reply_markup=write_directly_kb
        )
    else:
        await callback.message.answer("Заявка уже принята, я скоро напишу 🙂")

# === WEB SERVER (keep-alive) ===

flask_app = Flask(__name__)

@flask_app.route("/")
def index():
    return "Bot is running!", 200

def run_flask():
    port = int(os.environ.get("BOT_PORT", 5000))
    flask_app.run(host="0.0.0.0", port=port)

# === ЗАПУСК ===

async def main():
    await bot.delete_webhook(drop_pending_updates=True)

    await bot.set_my_commands([
        BotCommand(command="start", description="Начать тест 🚀")
    ])
    await bot.set_chat_menu_button(menu_button=MenuButtonCommands())

    threading.Thread(target=run_flask, daemon=True).start()
    await dp.start_polling(bot, drop_pending_updates=True)

if __name__ == "__main__":
    asyncio.run(main())
