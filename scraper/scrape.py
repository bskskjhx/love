"""Telegram 群聊增量抓取器。

读取 scraper/config.json（以及环境变量），把消息、用户资料、头像和媒体
按块写入 data/ 目录，供前端静态站点读取。

环境变量：
    TG_API_ID, TG_API_HASH, TG_SESSION  必填，TG_SESSION 由 login.py 生成
    TG_CHATS          可选，逗号分隔的额外群组（@username、t.me 链接或数字 id）
    DATA_DIR          可选，默认为仓库根目录下的 data/
    MAX_RUNTIME_MIN   可选，单次运行抓取新消息的时间预算（分钟），默认 40
"""

from __future__ import annotations

import asyncio
import bisect
import contextlib
import json
import logging
import mimetypes
import os
import re
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Awaitable, Callable
from zoneinfo import ZoneInfo

from telethon import TelegramClient, types, utils
from telethon.errors import RPCError
from telethon.sessions import StringSession
from telethon.tl.functions.channels import GetFullChannelRequest
from telethon.tl.functions.messages import GetForumTopicsRequest, GetFullChatRequest
from telethon.tl.functions.users import GetFullUserRequest

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = Path(__file__).resolve().parent / "config.json"

log = logging.getLogger("scrape")

DEFAULT_CONFIG: dict[str, Any] = {
    "siteTitle": "群聊存档",
    "timezone": "Asia/Shanghai",
    "chats": [],
    "chunkSize": 500,
    "maxMessagesPerRun": 0,
    "refreshRecent": 200,
    "downloadMedia": True,
    "maxMediaSizeMB": 20,
    "mediaTypes": ["photo", "sticker", "gif", "video", "round", "voice", "audio", "file"],
    "convertVoice": True,
    "maxProfilesPerRun": 100,
    "profileRefreshDays": 7,
    "chatConcurrency": 3,
    "downloadConcurrency": 6,
    "profileConcurrency": 4,
    "batchSize": 100,
}

ENTITY_TYPES: dict[type, str] = {
    types.MessageEntityBold: "b",
    types.MessageEntityItalic: "i",
    types.MessageEntityUnderline: "u",
    types.MessageEntityStrike: "s",
    types.MessageEntityCode: "code",
    types.MessageEntityPre: "pre",
    types.MessageEntityTextUrl: "a",
    types.MessageEntityUrl: "url",
    types.MessageEntityEmail: "email",
    types.MessageEntityPhone: "phone",
    types.MessageEntityMention: "mention",
    types.MessageEntityMentionName: "mname",
    types.MessageEntityHashtag: "hashtag",
    types.MessageEntityCashtag: "cashtag",
    types.MessageEntityBotCommand: "cmd",
    types.MessageEntitySpoiler: "spoiler",
    types.MessageEntityBlockquote: "quote",
}

ADMIN_PARTICIPANTS = (
    types.ChannelParticipantAdmin,
    types.ChannelParticipantCreator,
    types.ChatParticipantAdmin,
    types.ChatParticipantCreator,
)

MEDIA_LABELS = {
    "photo": "[图片]",
    "video": "[视频]",
    "gif": "[GIF]",
    "sticker": "[贴纸]",
    "voice": "[语音]",
    "round": "[视频消息]",
    "audio": "[音频]",
    "file": "[文件]",
    "poll": "[投票]",
    "geo": "[位置]",
    "venue": "[位置]",
    "contact": "[联系人]",
    "dice": "[骰子]",
    "game": "[游戏]",
    "invoice": "[账单]",
    "webpage": "",
    "unsupported": "[不支持的消息]",
}


# --------------------------------------------------------------------------- utils


def load_config() -> dict[str, Any]:
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_PATH.exists():
        cfg.update(json.loads(CONFIG_PATH.read_text("utf-8")))
    extra = [c.strip() for c in os.environ.get("TG_CHATS", "").split(",") if c.strip()]
    chats = list(cfg["chats"]) + extra
    cfg["chats"] = [parse_chat_ref(c) for c in chats]
    return cfg


def parse_chat_ref(ref: Any) -> int | str:
    if isinstance(ref, int):
        return ref
    ref = str(ref).strip()
    if ref.lstrip("-").isdigit():
        return int(ref)
    return ref


MEDIA_BUCKET = 200
MEDIA_OLD_PATH = re.compile(r'(chats/-?\d+/media/\d{4}-\d{2})/((\d+)[^"/\\]*")')


def media_bucket(msg_id: int) -> int:
    """同一个月的媒体再按消息 id 分组（每组最多 200 条消息），单个目录不超过 GitHub 网页的 1000 个文件上限"""
    return msg_id // MEDIA_BUCKET * MEDIA_BUCKET


def migrate_media_layout(data: Path) -> None:
    """把旧版 media/<月>/<id>.* 挪进 media/<月>/<分组>/，并改写消息里的路径；可重复执行"""
    moved = 0
    for month_dir in data.glob("chats/*/media/*"):
        if not month_dir.is_dir():
            continue
        for f in list(month_dir.iterdir()):
            m = re.match(r"\d+", f.name)
            if not f.is_file() or not m:
                continue
            dest = month_dir / str(media_bucket(int(m.group(0)))) / f.name
            dest.parent.mkdir(exist_ok=True)
            f.replace(dest)
            moved += 1
    rewritten = 0
    for path in data.glob("chats/*/messages/*.json"):
        old = path.read_text("utf-8")
        new = MEDIA_OLD_PATH.sub(lambda m: f"{m[1]}/{media_bucket(int(m[3]))}/{m[2]}", old)
        if new != old:
            write_text_atomic(path, new)
            rewritten += 1
    if moved or rewritten:
        log.info("媒体目录迁移：移动 %d 个文件，改写 %d 个消息块", moved, rewritten)


def write_text_atomic(path: Path, text: str) -> None:
    """先写临时文件再替换，中途被打断也不会留下半个文件。"""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, "utf-8")
    tmp.replace(path)


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text("utf-8"))
    except FileNotFoundError:
        return default


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    write_text_atomic(path, json.dumps(data, ensure_ascii=False, separators=(",", ":")))


def _without_stamp(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if k != "updatedAt"}


def write_json_stamped(path: Path, data: dict[str, Any]) -> None:
    """只有内容真正变化时才刷新 updatedAt，避免每小时产生空提交。"""
    old = read_json(path, {})
    if old and _without_stamp(old) == _without_stamp(data) and "updatedAt" in old:
        data["updatedAt"] = old["updatedAt"]
    else:
        data["updatedAt"] = int(time.time())
    write_json(path, data)


def write_lines_json(path: Path, items: list[Any]) -> None:
    """数组每项一行，git diff 更友好。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    body = ",\n".join(json.dumps(i, ensure_ascii=False, separators=(",", ":")) for i in items)
    write_text_atomic(path, "[\n" + body + "\n]\n")


def ts(dt: datetime | None) -> int | None:
    return int(dt.timestamp()) if dt else None


def text_of(v: Any) -> str:
    """兼容 TextWithEntities 与 str。"""
    return getattr(v, "text", v) or ""


def join_name(first: str | None, last: str | None) -> str:
    return " ".join(p for p in (first, last) if p)


def display_name(entity: Any) -> str:
    if entity is None:
        return ""
    if isinstance(entity, types.User):
        if entity.deleted:
            return "已注销账号"
        return join_name(entity.first_name, entity.last_name) or "未命名"
    return getattr(entity, "title", "") or ""


def username_of(entity: Any) -> str | None:
    """主用户名；没有时取第一个启用的附加用户名（Fragment 收藏用户名）。"""
    username = getattr(entity, "username", None)
    if not username and getattr(entity, "usernames", None):
        username = next((u.username for u in entity.usernames if u.active), None)
    return username


def coords(geo: Any) -> dict[str, float | None]:
    """GeoPointEmpty 没有坐标，记为 None。"""
    return {"lat": getattr(geo, "lat", None), "lng": getattr(geo, "long", None)}


def preview_text(m: dict[str, Any], limit: int = 120) -> str:
    text = (m.get("text") or "").replace("\n", " ").strip()
    media = m.get("media") or {}
    label = MEDIA_LABELS.get(media.get("type", ""), "")
    if media.get("type") == "sticker" and media.get("emoji"):
        label = f"{media['emoji']} 贴纸"
    if media.get("type") == "poll":
        label = f"📊 {media.get('poll', {}).get('q', '')}"
    if media.get("type") == "file" and media.get("name"):
        label = f"📎 {media['name']}"
    s = text or label
    if text and label and media.get("type") not in ("webpage",):
        s = f"{label} {text}"
    return s[:limit]


# --------------------------------------------------------------------------- storage


WAVE_POINTS = 48


def waveform_of(doc: Any) -> list[int] | None:
    """语音波形：Telegram 用 5 bit 打包，解码后重采样到固定点数（0–31）。"""
    for a in getattr(doc, "attributes", None) or []:
        if isinstance(a, types.DocumentAttributeAudio) and a.waveform:
            raw = list(utils.decode_waveform(a.waveform))
            if not raw:
                return None
            n = len(raw)
            if n <= WAVE_POINTS:
                return raw
            return [max(raw[int(i * n / WAVE_POINTS):max(int(i * n / WAVE_POINTS) + 1, int((i + 1) * n / WAVE_POINTS))]) for i in range(WAVE_POINTS)]
    return None


def entities_of(msg: types.Message) -> list[list[Any]]:
    """文字格式：[类型, offset, length, 附加值?]，不认识的类型丢弃。"""
    ents = []
    for e in msg.entities or []:
        t = ENTITY_TYPES.get(type(e))
        if not t:
            continue
        item: list[Any] = [t, e.offset, e.length]
        if t == "a":
            item.append(e.url)
        elif t == "pre" and e.language:
            item.append(e.language)
        elif t == "mname":
            item.append(e.user_id)
        elif t == "quote" and getattr(e, "collapsed", False):
            item.append(1)
        ents.append(item)
    return ents


def reactions_of(msg: types.Message) -> list[list[Any]]:
    """表情回应：普通 emoji 与付费星星；自定义表情无法展示，丢弃。"""
    reacts: list[list[Any]] = []
    if msg.reactions and msg.reactions.results:
        for r in msg.reactions.results:
            if isinstance(r.reaction, types.ReactionEmoji):
                reacts.append([r.reaction.emoticon, r.count])
            elif isinstance(r.reaction, types.ReactionPaid):
                reacts.append(["⭐", r.count])
    return reacts


def poll_info(media: types.MessageMediaPoll) -> dict[str, Any]:
    poll, results = media.poll, media.results
    counts: dict[bytes, int] = {}
    if results and results.results:
        counts = {r.option: r.voters for r in results.results}
    opts = []
    for a in poll.answers:
        o: dict[str, Any] = {"t": text_of(a.text)}
        if a.option in counts:
            o["n"] = counts[a.option]
        opts.append(o)
    p: dict[str, Any] = {"q": text_of(poll.question), "opts": opts}
    if results and results.total_voters is not None:
        p["total"] = results.total_voters
    if poll.closed:
        p["closed"] = True
    if poll.quiz:
        p["quiz"] = True
    return {"type": "poll", "poll": p}


def document_kind(msg: types.Message) -> str:
    """文档的展示类型；判断顺序有意义（如 GIF 也是 video，圆形视频也是 video）。"""
    if msg.sticker:
        return "sticker"
    if msg.gif:
        return "gif"
    if msg.video_note:
        return "round"
    if msg.voice:
        return "voice"
    if msg.audio:
        return "audio"
    if msg.video:
        return "video"
    return "file"


class ChunkStore:
    """按 id 升序分块存储消息，每块最多 chunk_size 条。"""

    def __init__(self, chat_dir: Path, meta: dict[str, Any], chunk_size: int):
        self.dir = chat_dir / "messages"
        self.chunks: list[dict[str, Any]] = meta.setdefault("chunks", [])
        self.chunk_size = chunk_size
        self.cache: dict[int, list[dict[str, Any]]] = {}
        self.dirty: set[int] = set()

    def _path(self, n: int) -> Path:
        return self.dir / f"{n}.json"

    def load(self, n: int) -> list[dict[str, Any]]:
        if n not in self.cache:
            self.cache[n] = read_json(self._path(n), [])
        return self.cache[n]

    @property
    def last_id(self) -> int:
        return self.chunks[-1]["max"] if self.chunks else 0

    def find_chunk(self, mid: int) -> int | None:
        maxes = [c["max"] for c in self.chunks]
        i = bisect.bisect_left(maxes, mid)
        if i < len(self.chunks) and self.chunks[i]["min"] <= mid:
            return i
        return None

    def get(self, mid: int) -> dict[str, Any] | None:
        n = self.find_chunk(mid)
        if n is None:
            return None
        lst = self.load(n)
        ids = [m["id"] for m in lst]
        i = bisect.bisect_left(ids, mid)
        return lst[i] if i < len(lst) and ids[i] == mid else None

    def append(self, m: dict[str, Any]) -> None:
        if not self.chunks or self.chunks[-1]["count"] >= self.chunk_size:
            self.chunks.append({"n": len(self.chunks), "min": m["id"], "max": m["id"], "from": m["date"], "to": m["date"], "count": 0})
            self.cache[len(self.chunks) - 1] = []
        n = len(self.chunks) - 1
        lst = self.load(n)
        lst.append(m)
        c = self.chunks[n]
        c["max"], c["to"], c["count"] = m["id"], m["date"], len(lst)
        self.dirty.add(n)

    def replace(self, m: dict[str, Any]) -> bool:
        n = self.find_chunk(m["id"])
        if n is None:
            return False
        lst = self.load(n)
        for i, old in enumerate(lst):
            if old["id"] == m["id"]:
                if old != m:
                    lst[i] = m
                    self.dirty.add(n)
                    return True
                return False
        return False

    def recent_ids(self, k: int) -> list[int]:
        out: list[int] = []
        for c in reversed(self.chunks):
            out = [m["id"] for m in self.load(c["n"])] + out
            if len(out) >= k:
                break
        return out[-k:] if k else []

    def last_message(self) -> dict[str, Any] | None:
        if not self.chunks:
            return None
        lst = self.load(self.chunks[-1]["n"])
        return lst[-1] if lst else None

    def save(self) -> None:
        for n in sorted(self.dirty):
            lst = self.cache[n]
            write_lines_json(self._path(n), lst)
            c = self.chunks[n]
            c.update(min=lst[0]["id"], max=lst[-1]["id"], count=len(lst))
            c["from"], c["to"] = lst[0]["date"], lst[-1]["date"]
        self.dirty.clear()


# --------------------------------------------------------------------------- scraper


class Shared:
    def __init__(self, cfg: dict[str, Any]):
        self.downloads = asyncio.Semaphore(max(1, int(cfg["downloadConcurrency"])))
        self.inflight: dict[str, asyncio.Future[Any]] = {}
        self.locks: dict[int, asyncio.Lock] = {}
        self.archived: dict[int, dict[str, Any]] = {}
        self.deadline = time.monotonic() + float(os.environ.get("MAX_RUNTIME_MIN", "40")) * 60


class ChatLog(logging.LoggerAdapter):
    def process(self, msg: Any, kwargs: Any) -> tuple[Any, Any]:
        return f"[{self.extra['chat']}] {str(msg).lstrip()}", kwargs


class Archiver:
    def __init__(self, client: TelegramClient, cfg: dict[str, Any], data_dir: Path, shared: Shared | None = None):
        self.client = client
        self.cfg = cfg
        self.data = data_dir
        self.tz = ZoneInfo(cfg["timezone"])
        self.ffmpeg = shutil.which("ffmpeg") if cfg.get("convertVoice") else None
        self.chat: Any = None
        self.shared = shared or Shared(cfg)
        self.deadline = self.shared.deadline
        self.log = ChatLog(log, {"chat": "-"})

    async def _once(self, key: str, factory: Callable[[], Awaitable[Any]]) -> Any:
        task = self.shared.inflight.get(key)
        if task is None:
            task = asyncio.ensure_future(factory())
            self.shared.inflight[key] = task
            task.add_done_callback(lambda _: self.shared.inflight.pop(key, None))
        return await task

    # ---- avatars

    async def ensure_avatar(self, entity: Any, record: dict[str, Any]) -> None:
        photo = getattr(entity, "photo", None)
        photo_id = getattr(photo, "photo_id", None)
        if not photo_id:
            if getattr(entity, "min", False):
                return  # min 实体不带完整头像信息，保留已有头像
            if record.get("avatar"):
                self._rm(record["avatar"])
            record.pop("avatar", None)
            record.pop("photo", None)
            return
        pid = str(photo_id)
        peer_id = utils.get_peer_id(entity)
        rel = f"avatars/{peer_id}_{pid}.jpg"
        if record.get("photo") == pid and (self.data / rel).exists():
            return
        path = await self._once(rel, lambda: self._download_avatar(entity, rel, peer_id))
        if path:
            if record.get("avatar") and record["avatar"] != rel:
                self._rm(record["avatar"])
            record["avatar"], record["photo"] = rel, pid

    async def _download_avatar(self, entity: Any, rel: str, peer_id: int) -> Any:
        async with self.shared.downloads:
            try:
                return await self.client.download_profile_photo(entity, file=str(self.data / rel), download_big=False)
            except (RPCError, OSError, ValueError) as e:
                self.log.warning("头像下载失败 %s: %s", peer_id, e)
                return None

    def _rm(self, rel: str) -> None:
        try:
            (self.data / rel).unlink()
        except OSError:  # 含 FileNotFoundError
            pass

    # ---- users

    def sender_id_of(self, msg: Any) -> int | None:
        """超级群里匿名管理员发言时 from_id 为空（sender_id 为 None），发送者就是群组本身。"""
        if msg.sender_id is not None:
            return msg.sender_id
        chat = self.chat
        if isinstance(chat, types.Channel) and chat.megagroup and not isinstance(msg, types.MessageService):
            return utils.get_peer_id(chat)
        return None

    def sender_of(self, msg: Any) -> Any:
        """匿名管理员以群组身份发言，sender 可能解析不到，此时用群组本身。"""
        if msg.sender is not None:
            return msg.sender
        chat = self.chat
        if chat is not None and self.sender_id_of(msg) == utils.get_peer_id(chat):
            return chat
        return None

    async def admin_titles(self, entity: Any, users: dict[str, Any]) -> None:
        """记录管理员头衔：自定义头衔，否则为“所有者”/“管理员”。"""
        titles: dict[str, tuple[str, str]] = {}
        anon_titles: list[str] = []
        try:
            async for u in self.client.iter_participants(entity, filter=types.ChannelParticipantsAdmins):
                p = getattr(u, "participant", None)
                if not isinstance(p, ADMIN_PARTICIPANTS):
                    continue
                creator = isinstance(p, (types.ChannelParticipantCreator, types.ChatParticipantCreator))
                titles[str(u.id)] = (getattr(p, "rank", None) or ("所有者" if creator else "管理员"), "owner" if creator else "admin")
                if getattr(getattr(p, "admin_rights", None), "anonymous", False):
                    anon_titles.append(titles[str(u.id)][0])
                if str(u.id) not in users:
                    await self.remember(users, u)
        except (RPCError, ValueError, TypeError) as e:
            self.log.warning("   获取管理员列表失败，保留原有头衔: %s", e)
            return
        # 匿名管理员消息没有签名时显示的头衔：只有一位匿名管理员时就是其头衔
        admins = len(titles)
        if getattr(entity, "megagroup", False):
            chat_key = str(utils.get_peer_id(entity))
            titles[chat_key] = (anon_titles[0] if len(anon_titles) == 1 else "匿名管理员", "owner")
            if chat_key not in users:
                await self.remember(users, entity)
        for key, rec in users.items():
            if key in titles:
                rec["title"], rec["role"] = titles[key]
            else:
                rec.pop("title", None)
                rec.pop("role", None)
        self.log.info("   管理员 %d 位", admins)

    async def remember(self, users: dict[str, Any], entity: Any) -> None:
        if entity is None:
            return
        key = str(utils.get_peer_id(entity))
        rec = users.setdefault(key, {})
        rec["name"] = display_name(entity)
        username = username_of(entity)
        if username:
            rec["username"] = username
        else:
            rec.pop("username", None)
        if isinstance(entity, types.User):
            if entity.bot:
                rec["bot"] = True
            for flag in ("premium", "verified", "scam", "fake", "deleted"):
                if getattr(entity, flag, False):
                    rec[flag] = True
                else:
                    rec.pop(flag, None)
        if not isinstance(entity, types.User):
            rec["chat"] = True
        await self.ensure_avatar(entity, rec)

    async def fetch_profiles(self, users: dict[str, Any]) -> None:
        """补全个人简介：每次最多请求 maxProfilesPerRun 位，超过 profileRefreshDays 天的才刷新。"""
        limit = int(self.cfg["maxProfilesPerRun"])
        if limit <= 0:
            return
        now = int(time.time())
        stale = now - int(float(self.cfg["profileRefreshDays"]) * 86400)
        todo = [
            (k, rec)
            for k, rec in users.items()
            if not rec.get("chat") and not rec.get("deleted") and k.lstrip("-").isdigit() and int(k) > 0 and rec.get("bioAt", 0) < stale
        ]
        # 从没取过的优先，其次是发言多的
        todo.sort(key=lambda kv: (kv[1].get("bioAt", 0), -kv[1].get("count", 0)))
        sem = asyncio.Semaphore(max(1, int(self.cfg["profileConcurrency"])))
        stop = False
        done = 0

        async def one(key: str, rec: dict[str, Any]) -> None:
            nonlocal stop, done
            async with sem:
                if stop or time.monotonic() > self.deadline:
                    return
                try:
                    full = await self.client(GetFullUserRequest(int(key)))
                except ValueError:
                    # 本次会话里没见过这个用户，拿不到 access_hash，下个周期再试
                    rec["bioAt"] = now
                    return
                except RPCError as e:
                    if not stop:
                        self.log.warning("   获取用户资料失败，停止本轮: %s", e)
                    stop = True
                    return
            about = full.full_user.about
            if about:
                rec["bio"] = about
            else:
                rec.pop("bio", None)
            rec["bioAt"] = now
            done += 1

        await asyncio.gather(*(one(k, r) for k, r in todo[:limit]))
        if done:
            self.log.info("   更新个人简介 %d 位", done)

    # ---- media

    async def media_info(self, msg: types.Message, chat_dir_rel: str) -> dict[str, Any] | None:
        media = msg.media
        if media is None:
            return None
        f = msg.file
        if isinstance(media, types.MessageMediaPhoto):
            if not media.photo:
                return {"type": "unsupported", "note": "expired"}
            info: dict[str, Any] = {"type": "photo", "w": f.width, "h": f.height, "size": f.size}
            if getattr(media, "spoiler", False):
                info["spoiler"] = True
            await self.download(msg, info, chat_dir_rel, ".jpg")
            return info
        if isinstance(media, types.MessageMediaDocument):
            if not media.document:
                return {"type": "unsupported", "note": "expired"}
            return await self._document_info(msg, media, chat_dir_rel)
        if isinstance(media, types.MessageMediaWebPage):
            wp = media.webpage
            if isinstance(wp, types.WebPage):
                out = {"type": "webpage", "url": wp.url}
                for k, v in (("site", wp.site_name), ("title", wp.title), ("desc", wp.description)):
                    if v:
                        out[k] = v[:400]
                return out
            return None
        if isinstance(media, types.MessageMediaPoll):
            return poll_info(media)
        if isinstance(media, types.MessageMediaVenue):
            return {"type": "venue", **coords(media.geo), "title": media.title, "address": media.address}
        if isinstance(media, (types.MessageMediaGeo, types.MessageMediaGeoLive)):
            return {"type": "geo", **coords(media.geo)}
        if isinstance(media, types.MessageMediaContact):
            # 出于隐私考虑不保存电话号码
            return {"type": "contact", "name": join_name(media.first_name, media.last_name)}
        if isinstance(media, types.MessageMediaDice):
            return {"type": "dice", "emoji": media.emoticon, "value": media.value}
        if isinstance(media, types.MessageMediaGame):
            return {"type": "game", "title": media.game.title}
        if isinstance(media, types.MessageMediaInvoice):
            return {"type": "invoice", "title": media.title}
        return {"type": "unsupported", "note": type(media).__name__.removeprefix("MessageMedia")}

    async def _document_info(self, msg: types.Message, media: types.MessageMediaDocument, chat_dir_rel: str) -> dict[str, Any]:
        f = msg.file
        t = document_kind(msg)
        info: dict[str, Any] = {"type": t, "size": f.size, "mime": f.mime_type}
        if f.width:
            info["w"], info["h"] = f.width, f.height
        if f.duration:
            info["dur"] = round(f.duration)
        if t == "file" and f.name:
            info["name"] = f.name
        if t in ("voice", "audio"):
            wave = waveform_of(media.document)
            if wave:
                info["wave"] = wave
        if t == "audio":
            if f.title:
                info["title"] = f.title
            if f.performer:
                info["performer"] = f.performer
            if f.name:
                info["name"] = f.name
        if t == "sticker":
            info["emoji"] = f.emoji or ""
            if f.mime_type == "application/x-tgsticker":
                # .tgs 是 gzip 压缩的 Lottie 动画，前端按需解压播放
                info["animated"] = True
                await self.download(msg, info, chat_dir_rel, ".tgs")
                return info
        if getattr(media, "spoiler", False):
            info["spoiler"] = True
        ext = f.ext or mimetypes.guess_extension(f.mime_type or "") or ""
        if ext == ".oga":
            ext = ".ogg"
        await self.download(msg, info, chat_dir_rel, ext)
        if t in ("video", "gif", "round", "file", "audio") and msg.document.thumbs:
            await self.download_thumb(msg, info, chat_dir_rel)
        return info

    def _media_rel(self, msg: types.Message, chat_dir_rel: str, suffix: str) -> str:
        month = msg.date.astimezone(self.tz).strftime("%Y-%m")
        return f"{chat_dir_rel}/media/{month}/{media_bucket(msg.id)}/{msg.id}{suffix}"

    async def download(self, msg: types.Message, info: dict[str, Any], chat_dir_rel: str, ext: str) -> None:
        t = info["type"]
        if not self.cfg["downloadMedia"] or t not in self.cfg["mediaTypes"]:
            info["skip"] = "type"
            return
        convert = t == "voice" and self.ffmpeg is not None
        rel = self._media_rel(msg, chat_dir_rel, ".m4a" if convert else ext)
        if (self.data / rel).exists():
            info["file"] = rel
            return
        size = info.get("size") or 0
        if size > self.cfg["maxMediaSizeMB"] * 1024 * 1024:
            info["skip"] = "size"
            return
        raw_rel = self._media_rel(msg, chat_dir_rel, ext)
        saved = await self._once(rel, lambda: self._fetch_media(msg, raw_rel, rel if convert else None))
        if not saved:
            info["skip"] = "error"
            return
        info["file"] = saved
        info.pop("skip", None)

    async def _fetch_media(self, msg: types.Message, raw_rel: str, converted_rel: str | None) -> str | None:
        target = self.data / raw_rel
        target.parent.mkdir(parents=True, exist_ok=True)
        async with self.shared.downloads:
            try:
                path = await self.client.download_media(msg, file=str(target))
            except (RPCError, OSError, ValueError, TypeError) as e:
                self.log.warning("媒体下载失败 msg=%s: %s", msg.id, e)
                return None
        if not path:
            return None
        if converted_rel is None:
            return raw_rel
        out = self.data / converted_rel
        proc = await asyncio.create_subprocess_exec(
            self.ffmpeg, "-y", "-loglevel", "error", "-i", str(target), "-c:a", "aac", "-b:a", "48k", str(out)
        )
        if await proc.wait() == 0 and out.exists():
            target.unlink(missing_ok=True)
            return converted_rel
        return raw_rel

    async def download_thumb(self, msg: types.Message, info: dict[str, Any], chat_dir_rel: str) -> None:
        rel = self._media_rel(msg, chat_dir_rel, "_thumb.jpg")
        if (self.data / rel).exists():
            info["thumb"] = rel
            return
        if await self._once(rel, lambda: self._fetch_thumb(msg, rel)):
            info["thumb"] = rel

    async def _fetch_thumb(self, msg: types.Message, rel: str) -> Any:
        async with self.shared.downloads:
            try:
                return await self.client.download_media(msg, file=str(self.data / rel), thumb=-1)
            except (RPCError, OSError, ValueError, TypeError) as e:
                self.log.debug("缩略图下载失败 msg=%s: %s", msg.id, e)
                return None

    # ---- messages

    @staticmethod
    def service_info(msg: types.MessageService) -> dict[str, Any]:
        a = msg.action
        sender = msg.sender_id
        if isinstance(a, types.MessageActionChatAddUser):
            users = [int(u) for u in a.users]
            if users == [sender]:
                return {"type": "join"}
            return {"type": "add", "users": users}
        if isinstance(a, (types.MessageActionChatJoinedByLink, types.MessageActionChatJoinedByRequest)):
            return {"type": "join"}
        if isinstance(a, types.MessageActionChatDeleteUser):
            if a.user_id == sender:
                return {"type": "leave"}
            return {"type": "kick", "users": [a.user_id]}
        if isinstance(a, types.MessageActionChatEditTitle):
            return {"type": "title", "title": a.title}
        if isinstance(a, types.MessageActionChatEditPhoto):
            return {"type": "photo"}
        if isinstance(a, types.MessageActionChatDeletePhoto):
            return {"type": "photo_del"}
        if isinstance(a, types.MessageActionPinMessage):
            return {"type": "pin"}
        if isinstance(a, (types.MessageActionChatCreate, types.MessageActionChannelCreate)):
            return {"type": "create", "title": a.title}
        if isinstance(a, (types.MessageActionChatMigrateTo, types.MessageActionChannelMigrateFrom)):
            return {"type": "migrate"}
        if isinstance(a, types.MessageActionGroupCall):
            return {"type": "call", "dur": a.duration} if a.duration else {"type": "call"}
        if isinstance(a, types.MessageActionGroupCallScheduled):
            return {"type": "call_scheduled", "at": ts(a.schedule_date)}
        if isinstance(a, types.MessageActionInviteToGroupCall):
            return {"type": "call_invite", "users": [int(u) for u in a.users]}
        if isinstance(a, types.MessageActionSetMessagesTTL):
            return {"type": "ttl", "period": a.period}
        if isinstance(a, types.MessageActionTopicCreate):
            return {"type": "topic_create", "title": a.title}
        if isinstance(a, types.MessageActionTopicEdit):
            return {"type": "topic_edit", "title": a.title or ""}
        if isinstance(a, types.MessageActionHistoryClear):
            return {"type": "clear"}
        if isinstance(a, types.MessageActionScreenshotTaken):
            return {"type": "screenshot"}
        if isinstance(a, types.MessageActionCustomAction):
            return {"type": "custom", "text": a.message}
        return {"type": "other", "name": type(a).__name__.removeprefix("MessageAction")}

    async def serialize(self, msg: Any, users: dict[str, Any], chat_dir_rel: str) -> dict[str, Any] | None:
        if not isinstance(msg, (types.Message, types.MessageService)):
            return None
        m: dict[str, Any] = {"id": msg.id, "date": ts(msg.date)}
        sender_id = self.sender_id_of(msg)
        if sender_id is not None:
            m["from"] = sender_id
            await self.remember(users, self.sender_of(msg))
        if isinstance(msg, types.MessageService):
            m["svc"] = self.service_info(msg)
            for e in getattr(msg, "action_entities", None) or []:
                await self.remember(users, e)
        else:
            await self._serialize_content(msg, m, users, chat_dir_rel)
        self._serialize_topic_and_reply(msg, m)
        return m

    async def _serialize_content(self, msg: types.Message, m: dict[str, Any], users: dict[str, Any], chat_dir_rel: str) -> None:
        """普通消息的正文、媒体和各种附加信息，按固定顺序写入 m（键顺序即 JSON 中的顺序）。"""
        if msg.message:
            m["text"] = msg.message
        ents = entities_of(msg)
        if ents:
            m["ents"] = ents
        media = await self.media_info(msg, chat_dir_rel)
        if media:
            m["media"] = media
        if msg.edit_date and not msg.edit_hide:
            m["edit"] = ts(msg.edit_date)
        if msg.grouped_id:
            m["group"] = str(msg.grouped_id)
        if msg.post_author:
            m["sig"] = msg.post_author
        if msg.via_bot_id:
            name = getattr(msg.via_bot, "username", None) or (users.get(str(msg.via_bot_id)) or {}).get("username")
            if name:
                m["via"] = name
        if msg.fwd_from:
            fw = msg.forward
            name = display_name(fw.sender) or display_name(fw.chat) or fw.from_name or ""
            m["fwd"] = {"name": name or "未知", "date": ts(fw.date)}
        reacts = reactions_of(msg)
        if reacts:
            m["reacts"] = reacts
        if msg.views:
            m["views"] = msg.views

    def _serialize_topic_and_reply(self, msg: Any, m: dict[str, Any]) -> None:
        rt = msg.reply_to
        if getattr(self.chat, "forum", False):
            # 论坛话题：话题 id 即创建话题的服务消息 id，未在话题内的消息属于 General（1）
            if isinstance(msg, types.MessageService) and isinstance(msg.action, types.MessageActionTopicCreate):
                m["topic"] = msg.id
            elif isinstance(rt, types.MessageReplyHeader) and rt.forum_topic:
                m["topic"] = rt.reply_to_top_id or rt.reply_to_msg_id
                if not rt.reply_to_top_id:
                    rt = None  # 只是发在话题里，并不是回复某条消息
            else:
                m["topic"] = 1
        if isinstance(rt, types.MessageReplyHeader) and rt.reply_to_msg_id:
            m["reply"] = {"id": rt.reply_to_msg_id}
            if rt.reply_to_peer_id and utils.get_peer_id(rt.reply_to_peer_id) != utils.get_peer_id(msg.peer_id):
                m["reply"]["ext"] = True
            if getattr(rt, "quote_text", None):
                m["reply"]["quote"] = rt.quote_text[:200]

    # ---- chat

    async def chat_info(self, entity: Any) -> dict[str, Any]:
        info: dict[str, Any] = {
            "id": utils.get_peer_id(entity),
            "title": display_name(entity),
        }
        username = username_of(entity)
        if username:
            info["username"] = username
        if isinstance(entity, types.Channel):
            info["type"] = "supergroup" if entity.megagroup else "channel"
            if entity.forum:
                info["forum"] = True
            try:
                full = await self.client(GetFullChannelRequest(entity))
                info["about"] = full.full_chat.about or ""
                info["members"] = full.full_chat.participants_count
            except RPCError as e:
                self.log.warning("获取群资料失败: %s", e)
        elif isinstance(entity, types.Chat):
            info["type"] = "group"
            info["members"] = entity.participants_count
            try:
                full = await self.client(GetFullChatRequest(entity.id))
                info["about"] = full.full_chat.about or ""
            except RPCError as e:
                self.log.warning("获取群资料失败: %s", e)
        else:
            info["type"] = "private"
        return info

    async def archive_chat(self, ref: int | str) -> dict[str, Any] | None:
        self.log.extra["chat"] = ref
        entity = await self.client.get_entity(ref)
        chat_id = utils.get_peer_id(entity)
        async with self.shared.locks.setdefault(chat_id, asyncio.Lock()):
            if chat_id in self.shared.archived:
                self.log.info("本次运行已抓取过（重复配置），跳过")
                return self.shared.archived[chat_id]
            meta = await self._archive(entity, chat_id)
            self.shared.archived[chat_id] = meta
            return meta

    async def _archive(self, entity: Any, chat_id: int) -> dict[str, Any]:
        self.chat = entity
        chat_dir_rel = f"chats/{chat_id}"
        chat_dir = self.data / chat_dir_rel
        meta = read_json(chat_dir / "meta.json", {})
        users: dict[str, Any] = read_json(chat_dir / "users.json", {})
        meta.update(await self.chat_info(entity))
        await self.ensure_avatar(entity, meta)
        meta.setdefault("days", {})
        store = ChunkStore(chat_dir, meta, self.cfg["chunkSize"])
        self.log.extra["chat"] = meta["title"]
        self.log.info("== %s (%s)，已存档至 #%s", meta["title"], chat_id, store.last_id)
        replies = self.load_replies(chat_dir, store)

        missing_replies: set[int] = set()
        try:
            if isinstance(entity, (types.Channel, types.Chat)) and meta.get("type") != "channel":
                await self.admin_titles(entity, users)
            # 1) 刷新最近的消息（编辑、表情回应、浏览数）
            await self.refresh_recent(entity, store, users, chat_dir_rel, missing_replies)
            # 2) 增量抓取新消息
            await self.fetch_new(entity, store, meta, users, replies, chat_dir_rel, missing_replies)
            # 3) 补全不在存档中的被回复消息预览
            if missing_replies:
                await self.fetch_missing_replies(entity, store, missing_replies, users, chat_dir_rel)
            # 4) 置顶消息与论坛话题
            await self.fetch_pins(entity, meta)
            if meta.get("forum"):
                await self.fetch_topics(entity, meta)
            # 5) 个人简介
            await self.fetch_profiles(users)
        finally:
            # 中途出错（含超时、网络中断）也保存已抓到的进度
            self.save_chat(chat_dir, meta, store, users, replies)
        return meta

    async def refresh_recent(
        self, entity: Any, store: ChunkStore, users: dict[str, Any], chat_dir_rel: str, missing_replies: set[int]
    ) -> None:
        recent = store.recent_ids(int(self.cfg["refreshRecent"]))
        if not recent:
            return
        fetched = await self.client.get_messages(entity, ids=recent)
        # 已被删除的消息（None）在存档中保留
        serialized = await asyncio.gather(*(self.serialize(msg, users, chat_dir_rel) for msg in fetched if msg is not None))
        changed = 0
        for m in serialized:
            if m is None:
                continue
            self.fill_reply(m, store, missing_replies)
            old = store.get(m["id"]) or {}
            r = m.get("reply")
            if r and "text" not in r and "text" in old.get("reply", {}):
                m["reply"] = old["reply"]  # 之前通过 API 补全过的预览
                missing_replies.discard(r["id"])
            if store.replace(m):
                changed += 1
        self.log.info("   刷新 %d 条，其中 %d 条有变化", len(recent), changed)

    async def fetch_new(
        self,
        entity: Any,
        store: ChunkStore,
        meta: dict[str, Any],
        users: dict[str, Any],
        replies: dict[str, list[int]],
        chat_dir_rel: str,
        missing_replies: set[int],
    ) -> None:
        size = max(1, int(self.cfg["batchSize"]))
        queue: asyncio.Queue[Any] = asyncio.Queue(maxsize=size * 4)
        end = object()

        async def produce() -> None:
            try:
                async for msg in self.client.iter_messages(
                    entity, min_id=store.last_id, reverse=True, limit=int(self.cfg["maxMessagesPerRun"]) or None, wait_time=0
                ):
                    await queue.put(msg)
            except Exception as e:  # noqa: BLE001
                await queue.put(e)
            else:
                await queue.put(end)

        producer = asyncio.create_task(produce())
        new_count = 0
        try:
            while True:
                batch = [await queue.get()]
                while len(batch) < size and not queue.empty():
                    batch.append(queue.get_nowait())
                stop = next((i for i, x in enumerate(batch) if x is end or isinstance(x, BaseException)), None)
                msgs = batch if stop is None else batch[:stop]
                before = new_count
                new_count += await self._ingest(msgs, store, meta, users, replies, chat_dir_rel, missing_replies)
                if new_count // 500 > before // 500:
                    self.log.info("   已抓取 %d 条新消息 (#%d)", new_count, store.last_id)
                if stop is not None:
                    if isinstance(batch[stop], BaseException):
                        raise batch[stop]
                    break
                if time.monotonic() > self.deadline:
                    self.log.info("   达到本次运行时间预算，剩余消息留到下次")
                    break
        finally:
            producer.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await producer
        self.log.info("   新消息 %d 条", new_count)

    async def _ingest(
        self,
        msgs: list[Any],
        store: ChunkStore,
        meta: dict[str, Any],
        users: dict[str, Any],
        replies: dict[str, list[int]],
        chat_dir_rel: str,
        missing_replies: set[int],
    ) -> int:
        serialized = await asyncio.gather(*(self.serialize(msg, users, chat_dir_rel) for msg in msgs))
        n = 0
        for m in serialized:
            if m is None:
                continue
            self.fill_reply(m, store, missing_replies)
            store.append(m)
            self.add_reply(replies, m)
            self.count_day(meta, m)
            if "from" in m:
                rec = users.setdefault(str(m["from"]), {})
                rec["count"] = rec.get("count", 0) + 1
            n += 1
        return n

    def save_chat(
        self, chat_dir: Path, meta: dict[str, Any], store: ChunkStore, users: dict[str, Any], replies: dict[str, list[int]]
    ) -> None:
        """写回消息块，并据此更新 meta 里的统计与最后一条预览。"""
        store.save()
        last = store.last_message()
        meta["count"] = sum(c["count"] for c in store.chunks)
        if store.chunks:
            meta["firstId"], meta["lastId"] = store.chunks[0]["min"], store.chunks[-1]["max"]
            meta["firstDate"], meta["lastDate"] = store.chunks[0]["from"], store.chunks[-1]["to"]
        meta["chunkSize"] = self.cfg["chunkSize"]
        if last:
            meta["last"] = {"id": last["id"], "from": last.get("from"), "text": preview_text(last, 80), **({"svc": last["svc"]} if "svc" in last else {})}
        write_json_stamped(chat_dir / "meta.json", meta)
        write_json(chat_dir / "users.json", users)
        write_json(chat_dir / "replies.json", replies)

    # ---- 回复索引、置顶、话题

    @staticmethod
    def add_reply(replies: dict[str, list[int]], m: dict[str, Any]) -> None:
        r = m.get("reply")
        if r and not r.get("ext"):
            lst = replies.setdefault(str(r["id"]), [])
            if m["id"] not in lst:
                lst.append(m["id"])

    def load_replies(self, chat_dir: Path, store: ChunkStore) -> dict[str, list[int]]:
        """被回复 id → 回复它的消息 id 列表；文件不存在时扫描全部已存档消息重建一次。"""
        path = chat_dir / "replies.json"
        if path.exists():
            return read_json(path, {})
        replies: dict[str, list[int]] = {}
        for c in store.chunks:
            for m in store.load(c["n"]):
                self.add_reply(replies, m)
        return replies

    async def fetch_pins(self, entity: Any, meta: dict[str, Any]) -> None:
        try:
            pins = await self.client.get_messages(entity, filter=types.InputMessagesFilterPinned, limit=100)
            meta["pins"] = [p.id for p in pins if p is not None]
        except RPCError as e:
            self.log.warning("获取置顶消息失败: %s", e)

    async def fetch_topics(self, entity: Any, meta: dict[str, Any]) -> None:
        try:
            res = await self.client(GetForumTopicsRequest(peer=entity, offset_date=None, offset_id=0, offset_topic=0, limit=100))
        except RPCError as e:
            self.log.warning("获取话题列表失败: %s", e)
            return
        tops = {m.id: m for m in res.messages}
        topics = []
        for t in res.topics:
            if not isinstance(t, types.ForumTopic):
                continue
            item: dict[str, Any] = {"id": t.id, "title": t.title, "color": f"#{t.icon_color:06x}"}
            if t.closed:
                item["closed"] = True
            if t.pinned:
                item["pinned"] = True
            if t.hidden:
                item["hidden"] = True
            top = tops.get(t.top_message)
            if isinstance(top, types.Message):
                item["last"] = {"id": top.id, "date": ts(top.date), "from": self.sender_id_of(top), "text": (top.message or ("[媒体]" if top.media else ""))[:80]}
            topics.append(item)
        meta["topics"] = topics

    def count_day(self, meta: dict[str, Any], m: dict[str, Any]) -> None:
        day = datetime.fromtimestamp(m["date"], self.tz).strftime("%Y-%m-%d")
        d = meta["days"].setdefault(day, [m["id"], 0])
        d[1] += 1

    @staticmethod
    def fill_reply(m: dict[str, Any], store: ChunkStore, missing: set[int]) -> None:
        r = m.get("reply")
        if not r or r.get("ext"):
            return
        target = store.get(r["id"])
        if target:
            r["from"] = target.get("from")
            r["text"] = preview_text(target)
        else:
            missing.add(r["id"])

    async def fetch_missing_replies(
        self, entity: Any, store: ChunkStore, missing: set[int], users: dict[str, Any], chat_dir_rel: str
    ) -> None:
        ids = sorted(missing)[:1000]
        previews: dict[int, dict[str, Any]] = {}
        fetched = [msg for msg in await self.client.get_messages(entity, ids=ids) if msg is not None]
        senders = {utils.get_peer_id(x): x for x in map(self.sender_of, fetched) if x}
        await asyncio.gather(*(self.remember(users, x) for x in senders.values()))
        for msg in fetched:
            text = (msg.message or "").replace("\n", " ")[:120]
            if not text and msg.media:
                text = "[媒体]"
            previews[msg.id] = {"from": self.sender_id_of(msg), "text": text}
        for n in list(store.cache):
            for m in store.cache[n]:
                r = m.get("reply")
                if r and r["id"] in previews and "text" not in r:
                    r.update(previews[r["id"]])
                    store.dirty.add(n)

    def write_index(self, order: list[int]) -> None:
        chats = []
        for meta_path in sorted((self.data / "chats").glob("*/meta.json")):
            meta = read_json(meta_path, {})
            if not meta.get("id"):
                continue
            users = read_json(meta_path.parent / "users.json", {})
            last = dict(meta.get("last") or {})
            if last.get("from") is not None:
                last["name"] = users.get(str(last["from"]), {}).get("name", "")
            chats.append({
                k: meta[k]
                for k in ("id", "title", "username", "avatar", "type", "members", "count", "firstDate", "lastDate", "updatedAt")
                if k in meta
            } | {"last": last})
        pos = {cid: i for i, cid in enumerate(order)}
        chats.sort(key=lambda c: (-(c.get("lastDate") or 0), pos.get(c["id"], 1 << 30)))
        write_json_stamped(self.data / "index.json", {
            "title": self.cfg["siteTitle"],
            "timezone": self.cfg["timezone"],
            "chats": chats,
        })


async def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    logging.getLogger("telethon").setLevel(logging.WARNING)
    cfg = load_config()
    if not cfg["chats"]:
        log.error("未配置任何群组：请编辑 scraper/config.json 的 chats 或设置 TG_CHATS")
        return 2
    try:
        api_id, api_hash, session = int(os.environ["TG_API_ID"]), os.environ["TG_API_HASH"], os.environ["TG_SESSION"]
    except KeyError as e:
        log.error("缺少环境变量 %s", e)
        return 2
    data_dir = Path(os.environ.get("DATA_DIR") or ROOT / "data").resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    migrate_media_layout(data_dir)

    client = TelegramClient(StringSession(session), api_id, api_hash, flood_sleep_threshold=300, receive_updates=False)
    async with client:
        if not await client.is_user_authorized():
            log.error("TG_SESSION 无效或已过期，请重新运行 scraper/login.py")
            return 2
        if any(isinstance(c, int) for c in cfg["chats"]):
            await client.get_dialogs()  # 让数字 id 能被解析
        shared = Shared(cfg)
        sem = asyncio.Semaphore(max(1, int(cfg["chatConcurrency"])))

        async def one(ref: int | str) -> tuple[bool, int | None]:
            async with sem:
                try:
                    meta = await Archiver(client, cfg, data_dir, shared).archive_chat(ref)
                    return True, meta["id"] if meta else None
                except Exception:  # noqa: BLE001 单个群失败不影响其他群
                    log.exception("抓取 %s 失败", ref)
                    return False, None

        results = await asyncio.gather(*(one(ref) for ref in cfg["chats"]))
        failed = sum(1 for ok, _ in results if not ok)
        order = list(dict.fromkeys(cid for ok, cid in results if ok and cid is not None))
        Archiver(client, cfg, data_dir, shared).write_index(order)
    log.info("完成，%d 个失败", failed)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
