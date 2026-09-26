import asyncio
import json
import os
import sys
import time

from telethon import TelegramClient, utils
from telethon.errors import FloodWaitError
from telethon.sessions import StringSession
from telethon.tl.types import Channel, Chat, MessageEmpty, MessageService
from telethon.tl.functions.channels import GetFullChannelRequest
from telethon.tl.functions.messages import GetFullChatRequest

from storage import Store, write_index
from profiles import sync_profiles
from avatars import sync_avatars
from media import sync_media

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(BASE_DIR), "data")
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
FLUSH_EVERY = 1000


def env(name):
    value = (os.environ.get(name) or "").strip()
    if not value:
        sys.exit("缺少环境变量：" + name)
    return value


def name_of(entity):
    if entity is None:
        return None
    first = getattr(entity, "first_name", None) or ""
    last = getattr(entity, "last_name", None) or ""
    full = (first + " " + last).strip()
    if full:
        return full
    title = getattr(entity, "title", None)
    if title:
        return title
    return getattr(entity, "username", None)


def title_of(entity):
    return getattr(entity, "title", None) or name_of(entity)


def forward_name(msg):
    fwd = msg.forward
    if fwd is None:
        return None
    from_name = getattr(fwd, "from_name", None)
    if from_name:
        return from_name
    return name_of(getattr(fwd, "sender", None)) or name_of(getattr(fwd, "chat", None))


def text_of(value):
    if value is None:
        return None
    return getattr(value, "text", value)


def file_of(msg):
    if msg.media is None:
        return None
    try:
        return msg.file
    except Exception:
        return None


def poll_info(msg):
    poll = msg.poll
    if poll is None:
        return None
    media = msg.media
    results = getattr(media, "results", None)
    votes = {}
    if results is not None and results.results:
        for r in results.results:
            votes[r.option] = r.voters
    options = []
    for ans in poll.answers or []:
        options.append({"t": text_of(getattr(ans, "text", None)), "v": votes.get(ans.option, 0)})
    if not options:
        return None
    return {
        "q": text_of(getattr(poll, "question", None)),
        "o": options,
        "c": bool(getattr(poll, "closed", False)),
        "mc": bool(getattr(poll, "multiple_choice", False)),
    }


def geo_info(msg):
    geo = msg.geo
    if geo is None:
        return None
    lat = getattr(geo, "lat", None)
    lon = getattr(geo, "long", None)
    if lat is None or lon is None:
        return None
    return {"lat": lat, "lon": lon}


def contact_info(msg):
    contact = msg.contact
    if contact is None:
        return None
    first = getattr(contact, "first_name", None) or ""
    last = getattr(contact, "last_name", None) or ""
    full = (first + " " + last).strip()
    phone = getattr(contact, "phone_number", None) or None
    if not full and not phone:
        return None
    out = {}
    if full:
        out["n"] = full
    if phone:
        out["p"] = phone
    return out


def webpage_info(msg):
    wp = msg.web_preview
    if wp is None:
        return None
    url = getattr(wp, "url", None)
    title = getattr(wp, "title", None)
    desc = getattr(wp, "description", None)
    if desc and len(desc) > 200:
        desc = desc[:200]
    if not url and not title and not desc:
        return None
    out = {}
    if url:
        out["url"] = url
    if title:
        out["title"] = title
    if desc:
        out["desc"] = desc
    return out


def reactions_info(msg):
    reactions = msg.reactions
    if reactions is None:
        return None
    results = getattr(reactions, "results", None)
    if not results:
        return None
    out = []
    for r in results:
        reaction = getattr(r, "reaction", None)
        emoticon = getattr(reaction, "emoticon", None)
        count = getattr(r, "count", None)
        if emoticon is None or count is None:
            continue
        out.append({"e": emoticon, "c": count})
    if not out:
        return None
    out.sort(key=lambda x: x["c"], reverse=True)
    return out


def media_type(msg):
    if msg.media is None:
        return None
    if msg.web_preview:
        return "webpage"
    if msg.sticker:
        return "sticker"
    if msg.voice:
        return "voice"
    if msg.video:
        return "video"
    if msg.photo:
        return "photo"
    if msg.document:
        return "document"
    if msg.poll:
        return "poll"
    if msg.geo:
        return "geo"
    if msg.contact:
        return "contact"
    return "other"


def convert(msg):
    mtype = media_type(msg)
    rec = {"i": msg.id, "d": int(msg.date.timestamp())}
    pairs = [
        ("u", msg.sender_id),
        ("n", name_of(msg.sender)),
        ("t", msg.message),
        ("r", msg.reply_to_msg_id),
        ("f", forward_name(msg)),
        ("m", mtype),
        ("e", int(msg.edit_date.timestamp()) if msg.edit_date else None),
        ("g", str(msg.grouped_id) if msg.grouped_id is not None else None),
        ("rx", reactions_info(msg)),
    ]

    f = file_of(msg)
    if f is not None:
        if mtype in ("photo", "video"):
            w = getattr(f, "width", None)
            h = getattr(f, "height", None)
            if w and h:
                pairs.append(("mw", w))
                pairs.append(("mh", h))
        if msg.voice is not None or msg.video is not None or msg.video_note is not None:
            pairs.append(("dur", getattr(f, "duration", None)))
        if mtype == "document":
            pairs.append(("doc", getattr(f, "name", None)))
        pairs.append(("sz", getattr(f, "size", None)))

    if mtype == "poll":
        pairs.append(("pl", poll_info(msg)))
    if mtype == "geo":
        pairs.append(("geo", geo_info(msg)))
    if mtype == "contact":
        pairs.append(("ct", contact_info(msg)))
    if mtype == "webpage":
        pairs.append(("wp", webpage_info(msg)))

    for key, value in pairs:
        if value:
            rec[key] = value
    return rec


async def pull(client, entity, store, deadline, base, username):
    async for msg in client.iter_messages(
        entity, reverse=True, min_id=store.last_id, limit=None
    ):
        if time.monotonic() >= deadline:
            return
        if isinstance(msg, (MessageService, MessageEmpty)):
            continue
        if store.add(convert(msg)) and (store.count - base) % FLUSH_EVERY == 0:
            store.flush()
            print(
                "[%s] 已新增 %d 条，last_id=%d" % (username, store.count - base, store.last_id),
                flush=True,
            )


async def fetch_chat(client, store, username, deadline):
    base = store.count
    entity = None
    try:
        while True:
            try:
                if entity is None:
                    entity = await client.get_entity(username)
                    store.set_info(entity.id, title_of(entity))
                    try:
                        if isinstance(entity, Channel):
                            full = await client(GetFullChannelRequest(entity))
                        elif isinstance(entity, Chat):
                            full = await client(GetFullChatRequest(entity.id))
                        else:
                            full = None
                        pinned_id = getattr(full.full_chat, "pinned_msg_id", None) if full else None
                        if pinned_id:
                            store.set_pinned(pinned_id)
                    except Exception:
                        pass
                await pull(client, entity, store, deadline, base, username)
                store.flush()
                await sync_profiles(client, entity, store, deadline)
                await sync_avatars(client, entity, store, deadline)
                await sync_media(client, entity, store, deadline)
                return
            except FloodWaitError as e:
                wait = e.seconds + 1
                store.flush()
                print("[%s] FloodWait %d 秒" % (username, wait), flush=True)
                if wait >= deadline - time.monotonic():
                    return
                await asyncio.sleep(wait)
    finally:
        store.flush()


async def run():
    deadline = time.monotonic() + float(os.environ.get("MAX_MINUTES") or 300) * 60
    api_id = int(env("TG_API_ID"))
    api_hash = env("TG_API_HASH")
    session = env("TG_SESSION")

    with open(CONFIG_PATH, "r", encoding="utf-8") as fh:
        config = json.load(fh)
    chats = config["chats"]
    chunk_size = config.get("chunk_size", 5000)

    client = TelegramClient(StringSession(session), api_id, api_hash)
    await client.connect()
    stores = []
    added = {}
    failed = []
    try:
        if not await client.is_user_authorized():
            print("TG_SESSION 无效或未登录", file=sys.stderr)
            return 1
        me = await client.get_me()
        print("当前账号：%s" % (me.phone or me.username or me.id), flush=True)
        dialogs = await client.get_dialogs(limit=None)
        target_ids = set()
        for c in chats:
            try:
                target_ids.add(int(c))
            except (TypeError, ValueError):
                pass
        found_ids = {utils.get_peer_id(d.entity) for d in dialogs}
        print("对话缓存条数：%d" % len(dialogs), flush=True)
        for tid in target_ids:
            print("目标 ID %d 是否在缓存中：%s" % (tid, tid in found_ids), flush=True)
        for username in chats:
            try:
                store = Store(DATA_DIR, username, chunk_size)
            except Exception as e:
                print("[%s] 初始化失败：%s: %s" % (username, type(e).__name__, e), file=sys.stderr)
                failed.append(username)
                continue
            stores.append(store)
            before = store.count
            if time.monotonic() < deadline:
                try:
                    await fetch_chat(client, store, username, deadline)
                except Exception as e:
                    print("[%s] 出错：%s: %s" % (username, type(e).__name__, e), file=sys.stderr)
                    failed.append(username)
            added[username] = store.count - before
        if time.monotonic() >= deadline:
            print("已达到时间预算，下次运行将从断点继续", flush=True)
        write_index(DATA_DIR, stores)
    finally:
        await client.disconnect()

    for username, n in added.items():
        print("[%s] 本次新增 %d 条" % (username, n))
    if failed:
        print("出错的群：" + ", ".join(failed), file=sys.stderr)
        return 1
    return 0


def main():
    sys.exit(asyncio.run(run()))


if __name__ == "__main__":
    main()
