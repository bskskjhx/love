"""scrape.py 的行为特征测试（不连接 Telegram）。

    pip install -r scraper/requirements.txt
    python -m unittest discover -s scraper/tests
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import scrape  # noqa: E402
from telethon import types  # noqa: E402

UTC = timezone.utc
scrape.log.setLevel(logging.CRITICAL)  # 预期内的失败日志不刷屏


def run(coro):
    return asyncio.run(coro)


def dt(ts: int) -> datetime:
    return datetime.fromtimestamp(ts, UTC)


class TmpDir(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()


class ConfigTest(TmpDir):
    def test_parse_chat_ref(self):
        self.assertEqual(scrape.parse_chat_ref(5), 5)
        self.assertEqual(scrape.parse_chat_ref(" -100123 "), -100123)
        self.assertEqual(scrape.parse_chat_ref("@foo"), "@foo")
        self.assertEqual(scrape.parse_chat_ref("https://t.me/x"), "https://t.me/x")

    def test_load_config_merges_defaults_file_and_env(self):
        cfg_path = self.dir / "config.json"
        cfg_path.write_text(json.dumps({"chats": ["@a", "123"], "chunkSize": 10}), "utf-8")
        with mock.patch.object(scrape, "CONFIG_PATH", cfg_path), mock.patch.dict(os.environ, {"TG_CHATS": " @b , ,-5"}):
            cfg = scrape.load_config()
        self.assertEqual(cfg["chats"], ["@a", 123, "@b", -5])
        self.assertEqual(cfg["chunkSize"], 10)
        self.assertEqual(cfg["timezone"], "Asia/Shanghai")
        self.assertEqual(scrape.DEFAULT_CONFIG["chats"], [])

    def test_load_config_without_file(self):
        with mock.patch.object(scrape, "CONFIG_PATH", self.dir / "missing.json"), mock.patch.dict(os.environ, {"TG_CHATS": ""}):
            self.assertEqual(scrape.load_config()["chats"], [])


class JsonIoTest(TmpDir):
    def test_read_json_default(self):
        self.assertEqual(scrape.read_json(self.dir / "x.json", {"d": 1}), {"d": 1})

    def test_read_json_invalid_raises(self):
        (self.dir / "bad.json").write_text("{", "utf-8")
        with self.assertRaises(json.JSONDecodeError):
            scrape.read_json(self.dir / "bad.json", {})

    def test_write_json_compact_utf8_atomic(self):
        p = self.dir / "a" / "b.json"
        scrape.write_json(p, {"k": "中", "n": [1, 2]})
        self.assertEqual(p.read_text("utf-8"), '{"k":"中","n":[1,2]}')
        self.assertFalse((self.dir / "a" / "b.json.tmp").exists())

    def test_write_lines_json(self):
        p = self.dir / "m" / "0.json"
        scrape.write_lines_json(p, [{"id": 1}, {"id": 2, "t": "é"}])
        self.assertEqual(p.read_text("utf-8"), '[\n{"id":1},\n{"id":2,"t":"é"}\n]\n')
        scrape.write_lines_json(p, [])
        self.assertEqual(p.read_text("utf-8"), "[\n\n]\n")

    def test_write_json_stamped_keeps_timestamp_when_unchanged(self):
        p = self.dir / "meta.json"
        with mock.patch.object(scrape.time, "time", return_value=100):
            d1 = {"a": 1}
            scrape.write_json_stamped(p, d1)
        self.assertEqual(d1["updatedAt"], 100)
        with mock.patch.object(scrape.time, "time", return_value=200):
            d2 = {"a": 1, "updatedAt": 5}
            scrape.write_json_stamped(p, d2)
            self.assertEqual(d2["updatedAt"], 100)
            d3 = {"a": 2}
            scrape.write_json_stamped(p, d3)
            self.assertEqual(d3["updatedAt"], 200)
        self.assertEqual(json.loads(p.read_text("utf-8")), {"a": 2, "updatedAt": 200})

    def test_write_json_stamped_old_without_timestamp(self):
        p = self.dir / "meta.json"
        scrape.write_json(p, {"a": 1})
        with mock.patch.object(scrape.time, "time", return_value=300):
            d = {"a": 1}
            scrape.write_json_stamped(p, d)
        self.assertEqual(d["updatedAt"], 300)


class MediaLayoutTest(TmpDir):
    def test_media_bucket(self):
        self.assertEqual(scrape.media_bucket(0), 0)
        self.assertEqual(scrape.media_bucket(199), 0)
        self.assertEqual(scrape.media_bucket(200), 200)
        self.assertEqual(scrape.media_bucket(4321), 4200)

    def test_migrate_media_layout_idempotent(self):
        month = self.dir / "chats" / "-1" / "media" / "2024-01"
        month.mkdir(parents=True)
        (month / "205.jpg").write_bytes(b"x")
        (month / "205_thumb.jpg").write_bytes(b"t")
        (month / "notes.txt").write_bytes(b"n")
        msgs = self.dir / "chats" / "-1" / "messages" / "0.json"
        msgs.parent.mkdir(parents=True)
        scrape.write_lines_json(msgs, [{"id": 205, "media": {"file": "chats/-1/media/2024-01/205.jpg", "thumb": "chats/-1/media/2024-01/205_thumb.jpg"}}])
        scrape.migrate_media_layout(self.dir)
        self.assertTrue((month / "200" / "205.jpg").exists())
        self.assertTrue((month / "200" / "205_thumb.jpg").exists())
        self.assertTrue((month / "notes.txt").exists())
        once = msgs.read_text("utf-8")
        self.assertIn('"chats/-1/media/2024-01/200/205.jpg"', once)
        self.assertIn('"chats/-1/media/2024-01/200/205_thumb.jpg"', once)
        scrape.migrate_media_layout(self.dir)
        self.assertEqual(msgs.read_text("utf-8"), once)
        self.assertTrue((month / "200" / "205.jpg").exists())


class TextHelpersTest(unittest.TestCase):
    def test_ts_and_text_of(self):
        self.assertIsNone(scrape.ts(None))
        self.assertEqual(scrape.ts(dt(123)), 123)
        self.assertEqual(scrape.text_of(None), "")
        self.assertEqual(scrape.text_of("s"), "s")
        self.assertEqual(scrape.text_of(types.TextWithEntities(text="t", entities=[])), "t")

    def test_display_name(self):
        self.assertEqual(scrape.display_name(None), "")
        self.assertEqual(scrape.display_name(types.User(id=1, first_name="A", last_name="B")), "A B")
        self.assertEqual(scrape.display_name(types.User(id=1, first_name="A")), "A")
        self.assertEqual(scrape.display_name(types.User(id=1)), "未命名")
        self.assertEqual(scrape.display_name(types.User(id=1, first_name="A", deleted=True)), "已注销账号")
        self.assertEqual(scrape.display_name(types.Chat(id=1, title="G", photo=types.ChatPhotoEmpty(), participants_count=1, date=None, version=1)), "G")

    def test_preview_text(self):
        p = scrape.preview_text
        self.assertEqual(p({"text": "a\nb "}), "a b")
        self.assertEqual(p({"media": {"type": "photo"}}), "[图片]")
        self.assertEqual(p({"text": "x", "media": {"type": "photo"}}), "[图片] x")
        self.assertEqual(p({"text": "x", "media": {"type": "webpage"}}), "x")
        self.assertEqual(p({"media": {"type": "webpage"}}), "")
        self.assertEqual(p({"media": {"type": "sticker", "emoji": "😀"}}), "😀 贴纸")
        self.assertEqual(p({"media": {"type": "sticker"}}), "[贴纸]")
        self.assertEqual(p({"media": {"type": "poll", "poll": {"q": "Q"}}}), "📊 Q")
        self.assertEqual(p({"media": {"type": "poll"}}), "📊 ")
        self.assertEqual(p({"media": {"type": "file", "name": "a.pdf"}}), "📎 a.pdf")
        self.assertEqual(p({"media": {"type": "unknown"}}), "")
        self.assertEqual(p({"text": "x" * 200}), "x" * 120)
        self.assertEqual(p({"text": "x" * 200}, 80), "x" * 80)

    def test_waveform_of(self):
        from telethon import utils

        def doc(wave):
            return types.Document(id=1, access_hash=1, file_reference=b"", date=None, mime_type="audio/ogg", size=1, dc_id=1,
                                  attributes=[types.DocumentAttributeAudio(duration=1, voice=True, waveform=wave)])

        self.assertIsNone(scrape.waveform_of(None))
        self.assertIsNone(scrape.waveform_of(doc(None)))
        short = utils.encode_waveform(bytes(range(10)))
        self.assertEqual(scrape.waveform_of(doc(short)), list(utils.decode_waveform(short)))
        long = [i % 32 for i in range(100)]
        out = scrape.waveform_of(doc(utils.encode_waveform(bytes(long))))
        self.assertEqual(len(out), scrape.WAVE_POINTS)
        raw = list(utils.decode_waveform(utils.encode_waveform(bytes(long))))
        n = len(raw)
        expect = [max(raw[int(i * n / 48):max(int(i * n / 48) + 1, int((i + 1) * n / 48))]) for i in range(48)]
        self.assertEqual(out, expect)


def mk(i: int, date: int | None = None, **kw):
    return {"id": i, "date": date if date is not None else 1000 + i, **kw}


class ChunkStoreTest(TmpDir):
    def test_append_get_replace_save_reload(self):
        meta: dict = {}
        s = scrape.ChunkStore(self.dir, meta, 2)
        self.assertEqual(s.last_id, 0)
        self.assertIsNone(s.last_message())
        self.assertEqual(s.recent_ids(5), [])
        for i in (1, 2, 5, 7, 9):
            s.append(mk(i))
        self.assertEqual([c["count"] for c in meta["chunks"]], [2, 2, 1])
        self.assertEqual(meta["chunks"][1], {"n": 1, "min": 5, "max": 7, "from": 1005, "to": 1007, "count": 2})
        self.assertEqual(s.last_id, 9)
        self.assertEqual(s.find_chunk(5), 1)
        self.assertIsNone(s.find_chunk(3))
        self.assertIsNone(s.find_chunk(100))
        self.assertEqual(s.get(7)["id"], 7)
        self.assertIsNone(s.get(6))
        self.assertEqual(s.recent_ids(3), [5, 7, 9])
        self.assertEqual(s.recent_ids(0), [])
        self.assertFalse(s.replace(mk(7)))
        self.assertTrue(s.replace(mk(7, text="e")))
        self.assertFalse(s.replace(mk(6)))
        self.assertFalse(s.replace(mk(100)))
        s.save()
        self.assertEqual(s.dirty, set())
        self.assertEqual(sorted(p.name for p in (self.dir / "messages").iterdir()), ["0.json", "1.json", "2.json"])
        s2 = scrape.ChunkStore(self.dir, meta, 2)
        self.assertEqual(s2.get(7)["text"], "e")
        self.assertEqual(s2.last_message()["id"], 9)


class FakeArchiver(scrape.Archiver):
    """不连 Telegram：头像下载直接跳过。"""

    def __init__(self, data: Path, **cfg):
        client = mock.MagicMock()
        super().__init__(client, {**scrape.DEFAULT_CONFIG, "convertVoice": False, **cfg}, data)

    async def ensure_avatar(self, entity, record):  # noqa: D401
        record.setdefault("_avatar_checked", True)


def megagroup(**kw):
    return types.Channel(id=77, title="G", photo=types.ChatPhotoEmpty(), date=None, megagroup=True, access_hash=1, **kw)


def message(i, text="", **kw):
    return types.Message(id=i, peer_id=types.PeerChannel(77), date=dt(1000 + i), message=text, **kw)


class ArchiverTest(TmpDir):
    def test_service_info(self):
        def svc(action, from_id=None):
            return types.MessageService(id=1, peer_id=types.PeerChannel(77), date=dt(0), action=action, from_id=from_id)

        me = types.PeerUser(5)
        cases = [
            (svc(types.MessageActionChatAddUser(users=[5]), me), {"type": "join"}),
            (svc(types.MessageActionChatAddUser(users=[6, 7]), me), {"type": "add", "users": [6, 7]}),
            (svc(types.MessageActionChatJoinedByLink(inviter_id=1)), {"type": "join"}),
            (svc(types.MessageActionChatDeleteUser(user_id=5), me), {"type": "leave"}),
            (svc(types.MessageActionChatDeleteUser(user_id=6), me), {"type": "kick", "users": [6]}),
            (svc(types.MessageActionChatEditTitle(title="T")), {"type": "title", "title": "T"}),
            (svc(types.MessageActionChatDeletePhoto()), {"type": "photo_del"}),
            (svc(types.MessageActionPinMessage()), {"type": "pin"}),
            (svc(types.MessageActionChannelCreate(title="C")), {"type": "create", "title": "C"}),
            (svc(types.MessageActionChatMigrateTo(channel_id=1)), {"type": "migrate"}),
            (svc(types.MessageActionGroupCall(call=None, duration=60)), {"type": "call", "dur": 60}),
            (svc(types.MessageActionGroupCall(call=None)), {"type": "call"}),
            (svc(types.MessageActionGroupCallScheduled(call=None, schedule_date=dt(50))), {"type": "call_scheduled", "at": 50}),
            (svc(types.MessageActionInviteToGroupCall(call=None, users=[3])), {"type": "call_invite", "users": [3]}),
            (svc(types.MessageActionSetMessagesTTL(period=86400)), {"type": "ttl", "period": 86400}),
            (svc(types.MessageActionTopicCreate(title="t", icon_color=0)), {"type": "topic_create", "title": "t"}),
            (svc(types.MessageActionTopicEdit()), {"type": "topic_edit", "title": ""}),
            (svc(types.MessageActionHistoryClear()), {"type": "clear"}),
            (svc(types.MessageActionScreenshotTaken()), {"type": "screenshot"}),
            (svc(types.MessageActionCustomAction(message="m")), {"type": "custom", "text": "m"}),
            (svc(types.MessageActionContactSignUp()), {"type": "other", "name": "ContactSignUp"}),
        ]
        for msg, out in cases:
            self.assertEqual(scrape.Archiver.service_info(msg), out, msg.action)

    def test_serialize_text_message(self):
        a = FakeArchiver(self.dir)
        a.chat = megagroup()
        users: dict = {}
        msg = message(
            10, "hello world",
            from_id=types.PeerUser(5),
            entities=[
                types.MessageEntityBold(0, 5),
                types.MessageEntityTextUrl(6, 5, url="https://x"),
                types.MessageEntityPre(0, 1, language="py"),
                types.MessageEntityPre(0, 1, language=""),
                types.MessageEntityMentionName(0, 1, user_id=9),
                types.MessageEntityBlockquote(0, 1, collapsed=True),
                types.MessageEntityBlockquote(0, 1),
                types.MessageEntityCustomEmoji(0, 1, document_id=1),
            ],
            edit_date=dt(2000), grouped_id=123, post_author="sig", views=7,
            reactions=types.MessageReactions(results=[
                types.ReactionCount(reaction=types.ReactionEmoji("👍"), count=3),
                types.ReactionCount(reaction=types.ReactionPaid(), count=2),
                types.ReactionCount(reaction=types.ReactionCustomEmoji(1), count=1),
            ]),
            reply_to=types.MessageReplyHeader(reply_to_msg_id=4, quote_text="q" * 300),
        )
        m = run(a.serialize(msg, users, "chats/-1000000000077"))
        self.assertEqual(m, {
            "id": 10, "date": 1010, "from": 5, "text": "hello world",
            "ents": [["b", 0, 5], ["a", 6, 5, "https://x"], ["pre", 0, 1, "py"], ["pre", 0, 1], ["mname", 0, 1, 9], ["quote", 0, 1, 1], ["quote", 0, 1]],
            "edit": 2000, "group": "123", "sig": "sig", "views": 7,
            "reacts": [["👍", 3], ["⭐", 2]],
            "reply": {"id": 4, "quote": "q" * 200},
        })

    def test_serialize_anonymous_admin_and_external_reply(self):
        a = FakeArchiver(self.dir)
        a.chat = megagroup()
        users: dict = {}
        msg = message(11, "x", reply_to=types.MessageReplyHeader(reply_to_msg_id=4, reply_to_peer_id=types.PeerChannel(88)))
        m = run(a.serialize(msg, users, "c"))
        self.assertEqual(m["from"], -1000000000077)
        self.assertEqual(m["reply"], {"id": 4, "ext": True})
        self.assertEqual(users["-1000000000077"]["name"], "G")
        self.assertTrue(users["-1000000000077"]["chat"])

    def test_serialize_forum_topics(self):
        a = FakeArchiver(self.dir)
        a.chat = megagroup(forum=True)
        in_topic = message(20, "a", reply_to=types.MessageReplyHeader(reply_to_msg_id=15, forum_topic=True))
        reply_in_topic = message(21, "b", reply_to=types.MessageReplyHeader(reply_to_msg_id=20, reply_to_top_id=15, forum_topic=True))
        general = message(22, "c")
        created = types.MessageService(id=15, peer_id=types.PeerChannel(77), date=dt(0), action=types.MessageActionTopicCreate(title="t", icon_color=0))
        r = [run(a.serialize(x, {}, "c")) for x in (in_topic, reply_in_topic, general, created)]
        self.assertEqual(r[0]["topic"], 15)
        self.assertNotIn("reply", r[0])
        self.assertEqual((r[1]["topic"], r[1]["reply"]), (15, {"id": 20}))
        self.assertEqual(r[2]["topic"], 1)
        self.assertEqual(r[3]["topic"], 15)
        self.assertEqual(r[3]["svc"], {"type": "topic_create", "title": "t"})

    def test_serialize_ignores_empty(self):
        a = FakeArchiver(self.dir)
        self.assertIsNone(run(a.serialize(object(), {}, "c")))

    def test_media_info_non_file_types(self):
        a = FakeArchiver(self.dir)
        poll = types.MessageMediaPoll(
            poll=types.Poll(id=1, hash=0, question=types.TextWithEntities("Q", []), answers=[
                types.PollAnswer(types.TextWithEntities("A", []), b"a"), types.PollAnswer(types.TextWithEntities("B", []), b"b")], closed=True, quiz=True),
            results=types.PollResults(results=[types.PollAnswerVoters(option=b"a", voters=3)], total_voters=3),
        )
        geo = types.GeoPoint(long=2.5, lat=1.5, access_hash=0)
        cases = [
            (poll, {"type": "poll", "poll": {"q": "Q", "opts": [{"t": "A", "n": 3}, {"t": "B"}], "total": 3, "closed": True, "quiz": True}}),
            (types.MessageMediaGeo(geo=geo), {"type": "geo", "lat": 1.5, "lng": 2.5}),
            (types.MessageMediaGeoLive(geo=geo, period=1), {"type": "geo", "lat": 1.5, "lng": 2.5}),
            (types.MessageMediaGeo(geo=types.GeoPointEmpty()), {"type": "geo", "lat": None, "lng": None}),
            (types.MessageMediaVenue(geo=geo, title="T", address="A", provider="", venue_id="", venue_type=""),
             {"type": "venue", "lat": 1.5, "lng": 2.5, "title": "T", "address": "A"}),
            (types.MessageMediaContact(phone_number="123", first_name="F", last_name="L", vcard="", user_id=1), {"type": "contact", "name": "F L"}),
            (types.MessageMediaContact(phone_number="123", first_name="F", last_name="", vcard="", user_id=1), {"type": "contact", "name": "F"}),
            (types.MessageMediaDice(value=4, emoticon="🎲"), {"type": "dice", "emoji": "🎲", "value": 4}),
            (types.MessageMediaWebPage(webpage=types.WebPage(id=1, url="u", display_url="u", hash=0, site_name="S", title="t" * 500, description="")),
             {"type": "webpage", "url": "u", "site": "S", "title": "t" * 400}),
            (types.MessageMediaWebPage(webpage=types.WebPageEmpty(id=1)), None),
            (types.MessageMediaPhoto(), {"type": "unsupported", "note": "expired"}),
            (types.MessageMediaDocument(), {"type": "unsupported", "note": "expired"}),
            (types.MessageMediaUnsupported(), {"type": "unsupported", "note": "Unsupported"}),
        ]
        for media, out in cases:
            self.assertEqual(run(a.media_info(message(1, media=media), "c")), out, type(media).__name__)
        self.assertIsNone(run(a.media_info(message(1), "c")))

    def test_media_info_documents(self):
        from telethon import utils

        a = FakeArchiver(self.dir, downloadMedia=False)
        a.client = mock.MagicMock()
        a.client.download_media = mock.AsyncMock(return_value="ok")

        def doc_msg(mime, attrs, thumbs=None, spoiler=False):
            d = types.Document(id=1, access_hash=1, file_reference=b"", date=None, mime_type=mime, size=10, dc_id=1, attributes=attrs, thumbs=thumbs)
            return message(250, media=types.MessageMediaDocument(document=d, spoiler=spoiler))

        thumb = [types.PhotoSize(type="m", w=1, h=1, size=1)]
        wave = utils.encode_waveform(bytes(range(5)))
        cases = [
            (doc_msg("audio/ogg", [types.DocumentAttributeAudio(duration=3.4, voice=True, waveform=wave)]),
             {"type": "voice", "size": 10, "mime": "audio/ogg", "dur": 3, "wave": list(utils.decode_waveform(wave)), "skip": "type"}),
            (doc_msg("audio/mpeg", [types.DocumentAttributeAudio(duration=60, title="T", performer="P"), types.DocumentAttributeFilename("s.mp3")], thumbs=thumb),
             {"type": "audio", "size": 10, "mime": "audio/mpeg", "dur": 60, "title": "T", "performer": "P", "name": "s.mp3", "skip": "type",
              "thumb": "c/media/1970-01/200/250_thumb.jpg"}),
            (doc_msg("application/x-tgsticker", [types.DocumentAttributeSticker(alt="😀", stickerset=types.InputStickerSetEmpty())]),
             {"type": "sticker", "size": 10, "mime": "application/x-tgsticker", "emoji": "😀", "animated": True, "skip": "type"}),
            (doc_msg("image/webp", [types.DocumentAttributeSticker(alt="", stickerset=types.InputStickerSetEmpty()), types.DocumentAttributeImageSize(w=5, h=6)]),
             {"type": "sticker", "size": 10, "mime": "image/webp", "w": 5, "h": 6, "emoji": "", "skip": "type"}),
            (doc_msg("video/mp4", [types.DocumentAttributeVideo(duration=2, w=3, h=4), types.DocumentAttributeAnimated()], thumbs=thumb, spoiler=True),
             {"type": "gif", "size": 10, "mime": "video/mp4", "w": 3, "h": 4, "dur": 2, "spoiler": True, "skip": "type",
              "thumb": "c/media/1970-01/200/250_thumb.jpg"}),
            (doc_msg("video/mp4", [types.DocumentAttributeVideo(duration=2, w=3, h=3, round_message=True)]),
             {"type": "round", "size": 10, "mime": "video/mp4", "w": 3, "h": 3, "dur": 2, "skip": "type"}),
            (doc_msg("application/pdf", [types.DocumentAttributeFilename("a.pdf")]),
             {"type": "file", "size": 10, "mime": "application/pdf", "name": "a.pdf", "skip": "type"}),
        ]
        for msg, out in cases:
            self.assertEqual(run(a.media_info(msg, "c")), out, out["type"])

    def test_remember_and_chat_info_usernames(self):
        a = FakeArchiver(self.dir)
        users: dict = {"5": {"username": "old", "verified": True, "bot": True}}
        u = types.User(id=5, first_name="A", premium=True, usernames=[types.Username("x", active=False), types.Username("y", active=True)])
        run(a.remember(users, u))
        self.assertEqual(users["5"], {"username": "y", "bot": True, "name": "A", "premium": True, "_avatar_checked": True})
        run(a.remember(users, None))
        run(a.remember(users, types.User(id=5, first_name="A")))
        self.assertNotIn("username", users["5"])
        chat = types.Chat(id=3, title="C", photo=types.ChatPhotoEmpty(), participants_count=4, date=None, version=1)
        run(a.remember(users, chat))
        self.assertEqual(users["-3"], {"name": "C", "chat": True, "_avatar_checked": True})

        a.client = mock.AsyncMock(side_effect=scrape.RPCError(None, "x"))
        info = run(a.chat_info(megagroup(username="grp", forum=True)))
        self.assertEqual(info, {"id": -1000000000077, "title": "G", "username": "grp", "type": "supergroup", "forum": True})
        info = run(a.chat_info(chat))
        self.assertEqual(info, {"id": -3, "title": "C", "type": "group", "members": 4})
        info = run(a.chat_info(types.User(id=9, first_name="U", usernames=[types.Username("z", active=True)])))
        self.assertEqual(info, {"id": 9, "title": "U", "username": "z", "type": "private"})

    def test_replies_days_and_fill(self):
        a = FakeArchiver(self.dir, timezone="Asia/Shanghai")
        replies: dict = {}
        scrape.Archiver.add_reply(replies, mk(2, reply={"id": 1}))
        scrape.Archiver.add_reply(replies, mk(2, reply={"id": 1}))
        scrape.Archiver.add_reply(replies, mk(3, reply={"id": 1, "ext": True}))
        scrape.Archiver.add_reply(replies, mk(4))
        self.assertEqual(replies, {"1": [2]})

        meta = {"days": {}}
        a.count_day(meta, mk(1, 16 * 3600 - 1))
        a.count_day(meta, mk(2, 16 * 3600))
        a.count_day(meta, mk(3, 16 * 3600 + 5))
        self.assertEqual(meta["days"], {"1970-01-01": [1, 1], "1970-01-02": [2, 2]})

        store = scrape.ChunkStore(self.dir, {}, 10)
        store.append(mk(1, text="t", **{"from": 9}))
        missing: set = set()
        m1 = mk(5, reply={"id": 1})
        m2 = mk(6, reply={"id": 99})
        m3 = mk(7, reply={"id": 1, "ext": True})
        for x in (m1, m2, m3):
            scrape.Archiver.fill_reply(x, store, missing)
        self.assertEqual(m1["reply"], {"id": 1, "from": 9, "text": "t"})
        self.assertEqual(missing, {99})
        self.assertEqual(m3["reply"], {"id": 1, "ext": True})

        store.append(mk(2, reply={"id": 1}))
        (self.dir / "replies.json").unlink(missing_ok=True)
        self.assertEqual(a.load_replies(self.dir, store), {"1": [2]})
        scrape.write_json(self.dir / "replies.json", {"x": [1]})
        self.assertEqual(a.load_replies(self.dir, store), {"x": [1]})

    def test_write_index(self):
        a = FakeArchiver(self.dir, siteTitle="S", timezone="UTC")
        for cid, last_date, extra in ((-1, 50, {}), (-2, 90, {"username": "u"}), (-3, 50, {})):
            d = self.dir / "chats" / str(cid)
            scrape.write_json(d / "meta.json", {"id": cid, "title": f"t{cid}", "lastDate": last_date, "about": "x", "last": {"id": 1, "from": 7, "text": "hi"}, **extra})
            scrape.write_json(d / "users.json", {"7": {"name": "N"}})
        scrape.write_json(self.dir / "chats" / "junk" / "meta.json", {})
        with mock.patch.object(scrape.time, "time", return_value=42):
            a.write_index([-3, -1])
        idx = json.loads((self.dir / "index.json").read_text("utf-8"))
        self.assertEqual(idx["title"], "S")
        self.assertEqual(idx["updatedAt"], 42)
        self.assertEqual([c["id"] for c in idx["chats"]], [-2, -3, -1])
        self.assertEqual(idx["chats"][0], {"id": -2, "title": "t-2", "username": "u", "lastDate": 90, "last": {"id": 1, "from": 7, "text": "hi", "name": "N"}})


class FakeClient:
    """archive_chat 用到的 TelegramClient 接口的最小替身。"""

    def __init__(self, entity, history, recent=None, pins=(), fail_full=True, fail_on_iter=None):
        self.entity = entity
        self.history = history
        self.recent = recent or {}
        self.pins = pins
        self.fail_full = fail_full
        self.fail_on_iter = fail_on_iter
        self.calls: list = []

    async def get_entity(self, ref):
        return self.entity

    async def __call__(self, req):
        self.calls.append(type(req).__name__)
        raise scrape.RPCError(None, "no full info")

    async def iter_participants(self, entity, filter=None):
        creator = types.User(id=5, first_name="Owner")
        creator.participant = types.ChannelParticipantCreator(user_id=5, admin_rights=types.ChatAdminRights(anonymous=True), rank=None)
        yield creator

    async def get_messages(self, entity, ids=None, filter=None, limit=None):
        if filter is not None:
            return list(self.pins)
        return [self.recent.get(i) for i in ids]

    async def iter_messages(self, entity, min_id=0, reverse=False, limit=None, wait_time=None):
        for msg in self.history:
            if msg.id > min_id:
                if self.fail_on_iter == msg.id:
                    raise RuntimeError("boom")
                yield msg


class ArchiveChatTest(TmpDir):
    def make(self, client, **cfg):
        a = FakeArchiver(self.dir, chunkSize=2, maxProfilesPerRun=0, timezone="UTC", **cfg)
        a.client = client
        return a

    def test_first_run_then_incremental(self):
        chat = megagroup(username="grp")
        hist = [
            message(1, "first", from_id=types.PeerUser(5)),
            message(2, "reply", from_id=types.PeerUser(6), reply_to=types.MessageReplyHeader(reply_to_msg_id=1)),
            message(3, "", from_id=types.PeerUser(6), media=types.MessageMediaDice(value=3, emoticon="🎲")),
            message(4, "orphan", reply_to=types.MessageReplyHeader(reply_to_msg_id=999)),
        ]
        client = FakeClient(chat, hist, pins=[message(2)])
        with mock.patch.object(scrape.time, "time", return_value=500):
            meta = run(self.make(client).archive_chat("@grp"))
        cdir = self.dir / "chats" / "-1000000000077"
        self.assertEqual(meta["count"], 4)
        self.assertEqual((meta["firstId"], meta["lastId"], meta["firstDate"], meta["lastDate"]), (1, 4, 1001, 1004))
        self.assertEqual(meta["pins"], [2])
        self.assertEqual(meta["days"], {"1970-01-01": [1, 4]})
        self.assertEqual(meta["last"], {"id": 4, "from": -1000000000077, "text": "orphan"})
        self.assertEqual(meta["chunkSize"], 2)
        self.assertEqual(meta["updatedAt"], 500)
        self.assertEqual(json.loads((cdir / "meta.json").read_text("utf-8")), meta)
        users = json.loads((cdir / "users.json").read_text("utf-8"))
        self.assertEqual(users["5"]["title"], "所有者")
        self.assertEqual(users["5"]["count"], 1)
        self.assertEqual(users["6"]["count"], 2)
        self.assertEqual(users["-1000000000077"]["title"], "所有者")
        self.assertEqual(json.loads((cdir / "replies.json").read_text("utf-8")), {"1": [2], "999": [4]})
        chunk0 = json.loads((cdir / "messages" / "0.json").read_text("utf-8"))
        self.assertEqual(chunk0[1]["reply"], {"id": 1, "from": 5, "text": "first"})
        chunk1 = json.loads((cdir / "messages" / "1.json").read_text("utf-8"))
        self.assertEqual(chunk1[1]["reply"], {"id": 999})  # 被回复的消息拿不到时不补预览
        self.assertEqual(client.calls, ["GetFullChannelRequest"])

        # 第二次：最近消息有编辑，新增一条
        edited = message(2, "reply edited", from_id=types.PeerUser(6), reply_to=types.MessageReplyHeader(reply_to_msg_id=1))
        recent = {1: None, 2: edited, 3: hist[2], 4: hist[3]}
        client2 = FakeClient(chat, hist + [message(5, "new", from_id=types.PeerUser(5))], recent=recent)
        with mock.patch.object(scrape.time, "time", return_value=900):
            meta2 = run(self.make(client2, refreshRecent=3).archive_chat("@grp"))
        self.assertEqual(meta2["count"], 5)
        self.assertEqual(meta2["updatedAt"], 900)
        self.assertEqual(meta2["pins"], [])
        chunk0 = json.loads((cdir / "messages" / "0.json").read_text("utf-8"))
        self.assertEqual(chunk0[1]["text"], "reply edited")
        self.assertEqual(chunk0[1]["reply"], {"id": 1, "from": 5, "text": "first"})
        users = json.loads((cdir / "users.json").read_text("utf-8"))
        self.assertEqual(users["5"]["count"], 2)

    def test_missing_reply_preview_fetched(self):
        chat = megagroup()
        hist = [message(10, "r", from_id=types.PeerUser(5), reply_to=types.MessageReplyHeader(reply_to_msg_id=3)),
                message(11, "s", from_id=types.PeerUser(5), reply_to=types.MessageReplyHeader(reply_to_msg_id=4))]
        recent = {3: message(3, "line1\n" + "x" * 200, from_id=types.PeerUser(8)), 4: message(4, "", media=types.MessageMediaDice(value=1, emoticon="🎲"))}
        run(self.make(FakeClient(chat, hist, recent=recent)).archive_chat(1))
        chunk = json.loads((self.dir / "chats" / "-1000000000077" / "messages" / "0.json").read_text("utf-8"))
        self.assertEqual(chunk[0]["reply"], {"id": 3, "from": 8, "text": ("line1 " + "x" * 200)[:120]})
        self.assertEqual(chunk[1]["reply"], {"id": 4, "from": -1000000000077, "text": "[媒体]"})

    def test_failure_still_saves_progress(self):
        chat = megagroup()
        hist = [message(1, "a", from_id=types.PeerUser(5)), message(2, "b", from_id=types.PeerUser(5))]
        client = FakeClient(chat, hist, fail_on_iter=2)
        with self.assertRaises(RuntimeError):
            run(self.make(client).archive_chat(1))
        meta = json.loads((self.dir / "chats" / "-1000000000077" / "meta.json").read_text("utf-8"))
        self.assertEqual(meta["count"], 1)
        self.assertEqual(meta["last"]["text"], "a")


class ConcurrencyTest(TmpDir):
    def test_downloads_respect_limit(self):
        a = FakeArchiver(self.dir, downloadConcurrency=3, mediaTypes=["photo"])
        live = peak = 0

        async def slow(msg, file=None, **kw):
            nonlocal live, peak
            live += 1
            peak = max(peak, live)
            await asyncio.sleep(0.01)
            live -= 1
            return file

        a.client.download_media = slow

        async def go():
            infos = [{"type": "photo", "size": 1} for _ in range(10)]
            await asyncio.gather(*(a.download(message(i), info, "chats/1", ".jpg") for i, info in enumerate(infos, 1)))
            return infos

        infos = run(go())
        self.assertEqual(peak, 3)
        self.assertTrue(all(i["file"].endswith(f"/{n}.jpg") for n, i in enumerate(infos, 1)))

    def test_same_avatar_downloaded_once(self):
        a = scrape.Archiver(mock.MagicMock(), {**scrape.DEFAULT_CONFIG, "convertVoice": False}, self.dir)
        calls = 0

        async def photo(entity, file=None, **kw):
            nonlocal calls
            calls += 1
            await asyncio.sleep(0.01)
            return file

        a.client.download_profile_photo = photo
        u = types.User(id=5, first_name="A", photo=types.UserProfilePhoto(photo_id=9, dc_id=1))
        users: dict = {}

        async def go():
            await asyncio.gather(*(a.remember(users, u) for _ in range(5)))

        run(go())
        self.assertEqual(calls, 1)
        self.assertEqual(users["5"]["avatar"], "avatars/5_9.jpg")

    def test_batches_keep_order_and_disable_page_wait(self):
        class Slow(FakeArchiver):
            async def media_info(self, msg, chat_dir_rel):
                await asyncio.sleep((10 - msg.id % 10) / 1000)
                return None

        class Recording(FakeClient):
            async def iter_messages(self, entity, **kw):
                self.kw = kw
                async for m in super().iter_messages(entity, **kw):
                    yield m

        hist = [message(i, f"m{i}", from_id=types.PeerUser(5)) for i in range(1, 26)]
        client = Recording(megagroup(), hist)
        a = Slow(self.dir, chunkSize=10, maxProfilesPerRun=0, timezone="UTC", batchSize=7)
        a.client = client
        meta = run(a.archive_chat(1))
        self.assertEqual(client.kw["wait_time"], 0)
        self.assertIsNone(client.kw["limit"])
        self.assertEqual(meta["count"], 25)
        ids = []
        for n in range(3):
            ids += [m["id"] for m in json.loads((self.dir / "chats" / "-1000000000077" / "messages" / f"{n}.json").read_text("utf-8"))]
        self.assertEqual(ids, list(range(1, 26)))


class AdminTitlesTest(TmpDir):
    def test_basic_group_only_marks_admins(self):
        def member(uid, participant):
            u = types.User(id=uid, first_name=f"u{uid}")
            u.participant = participant
            return u

        class Client:
            async def iter_participants(self, entity, filter=None):
                yield member(1, types.ChatParticipantCreator(user_id=1))
                yield member(2, types.ChatParticipantAdmin(user_id=2, inviter_id=1, date=dt(0)))
                yield member(3, types.ChatParticipant(user_id=3, inviter_id=1, date=dt(0)))

        a = FakeArchiver(self.dir)
        a.client = Client()
        chat = types.Chat(id=9, title="g", photo=types.ChatPhotoEmpty(), participants_count=3, date=dt(0), version=1)
        users = {"3": {"name": "u3", "title": "管理员", "role": "admin"}}
        run(a.admin_titles(chat, users))
        self.assertEqual((users["1"]["title"], users["1"]["role"]), ("所有者", "owner"))
        self.assertEqual((users["2"]["title"], users["2"]["role"]), ("管理员", "admin"))
        self.assertNotIn("title", users["3"])
        self.assertNotIn("role", users["3"])


class DuplicateChatTest(TmpDir):
    def test_same_chat_configured_twice_archived_once(self):
        class Counting(FakeClient):
            iters = 0

            async def iter_messages(self, entity, **kw):
                Counting.iters += 1
                async for m in super().iter_messages(entity, **kw):
                    await asyncio.sleep(0)
                    yield m

        hist = [message(i, f"m{i}", from_id=types.PeerUser(5)) for i in range(1, 6)]
        client = Counting(megagroup(username="grp"), hist)
        cfg = {**scrape.DEFAULT_CONFIG, "convertVoice": False, "chunkSize": 2, "maxProfilesPerRun": 0, "timezone": "UTC"}
        shared = scrape.Shared(cfg)

        async def go():
            archivers = []
            for _ in range(2):
                a = FakeArchiver(self.dir, **cfg)
                a.client, a.shared = client, shared
                archivers.append(a)
            return await asyncio.gather(archivers[0].archive_chat("@grp"), archivers[1].archive_chat(-1000000000077))

        m1, m2 = run(go())
        self.assertEqual(Counting.iters, 1)
        self.assertIs(m1, m2)
        cdir = self.dir / "chats" / "-1000000000077"
        self.assertEqual(json.loads((cdir / "meta.json").read_text("utf-8"))["count"], 5)
        self.assertEqual(json.loads((cdir / "users.json").read_text("utf-8"))["5"]["count"], 5)


if __name__ == "__main__":
    unittest.main()
