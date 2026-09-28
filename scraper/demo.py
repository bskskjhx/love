
from __future__ import annotations

import gzip
import json
import math
import struct
import wave
import random
import shutil
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / ".demo-data"
TZ = timezone(timedelta(hours=8))
CHUNK = 500

rnd = random.Random(42)
rx = random.Random(7)
VOICE_REL = "media/voice-demo.wav"
TGS_REL = "media/sticker-demo.tgs"


def write_voice() -> None:
    path = OUT / VOICE_REL
    path.parent.mkdir(parents=True, exist_ok=True)
    rate = 8000
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = bytearray()
        for i in range(rate * 3):
            t = i / rate
            env = 0.35 + 0.65 * abs(math.sin(t * 2.3))
            frames += struct.pack("<h", int(9000 * env * math.sin(2 * math.pi * (220 + 60 * math.sin(t * 1.7)) * t)))
        w.writeframes(bytes(frames))


def write_tgs() -> None:
    ease = {"i": {"x": [0.4], "y": [1]}, "o": {"x": [0.6], "y": [0]}}
    ease3 = {"i": {"x": [0.4, 0.4, 0.4], "y": [1, 1, 1]}, "o": {"x": [0.6, 0.6, 0.6], "y": [0, 0, 0]}}
    anim = {
        "v": "5.5.2", "fr": 30, "ip": 0, "op": 60, "w": 512, "h": 512, "nm": "demo", "ddd": 0, "assets": [],
        "layers": [{
            "ddd": 0, "ind": 1, "ty": 4, "nm": "box", "sr": 1, "ip": 0, "op": 60, "st": 0, "bm": 0,
            "ks": {
                "o": {"a": 0, "k": 100},
                "r": {"a": 1, "k": [{"t": 0, "s": [0], **ease}, {"t": 60, "s": [360]}]},
                "p": {"a": 0, "k": [256, 256, 0]},
                "a": {"a": 0, "k": [0, 0, 0]},
                "s": {"a": 1, "k": [{"t": 0, "s": [70, 70, 100], **ease3}, {"t": 30, "s": [110, 110, 100], **ease3}, {"t": 60, "s": [70, 70, 100]}]},
            },
            "shapes": [{"ty": "gr", "nm": "g", "it": [
                {"ty": "rc", "nm": "r", "d": 1, "p": {"a": 0, "k": [0, 0]}, "s": {"a": 0, "k": [260, 260]}, "r": {"a": 0, "k": 70}},
                {"ty": "fl", "nm": "f", "c": {"a": 0, "k": [1, 0.72, 0.1, 1]}, "o": {"a": 0, "k": 100}, "r": 1},
                {"ty": "tr", "p": {"a": 0, "k": [0, 0]}, "a": {"a": 0, "k": [0, 0]}, "s": {"a": 0, "k": [100, 100]}, "r": {"a": 0, "k": 0}, "o": {"a": 0, "k": 100}},
            ]}],
        }],
    }
    path = OUT / TGS_REL
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gzip.compress(json.dumps(anim, separators=(",", ":")).encode()))


def fake_wave() -> list[int]:
    return [max(1, min(31, int(16 + 13 * math.sin(i / 3 + rx.random() * 2) + rx.randint(-5, 5)))) for i in range(48)]


def extras(cdir: Path, msgs: list[dict], meta: dict) -> None:
    replies: dict[str, list[int]] = {}
    for m in msgs:
        r = m.get("reply")
        if r and "svc" not in m and not r.get("ext"):
            replies.setdefault(str(r["id"]), []).append(m["id"])
    write(cdir / "replies.json", replies)
    pins: list[int] = []
    for m in reversed(msgs):
        if m.get("svc", {}).get("type") == "pin" and m.get("reply") and m["reply"]["id"] not in pins:
            pins.append(m["reply"]["id"])
    if pins:
        meta["pins"] = pins[:8]

NAMES = ["张伟", "王芳", "李娜", "刘洋", "陈静", "杨帆", "赵磊", "黄敏", "周杰", "吴婷", "Alice", "Bob Chen", "小林", "阿泽", "Mika"]
PHRASES = [
    "早上好 ☀️", "有人在吗？", "哈哈哈哈哈", "这个问题我也遇到过", "可以试试重启一下", "收到 👌", "今天天气真好",
    "晚上一起吃饭吗", "刚看到新闻了", "我觉得还行吧", "+1", "有道理", "等我一下", "已经修好了，谢谢大家！",
    "周末有什么安排？", "推荐一本书：《三体》", "这个 bug 太离谱了 😂", "明天见", "好的", "我去看看",
    "有没有人用过 Vite？体验怎么样", "刚发布了新版本，欢迎试用", "这个链接打不开", "文档在这里",
    "代码写完了，求 review", "今晚月亮好圆 🌕", "终于下班了", "谁有空帮忙测一下",
]
LONG = (
    "分享一下最近的心得：\n\n1. 先把问题拆小，再逐个解决；\n2. 写代码之前先写测试；\n3. 每天记录进展。"
    "\n\n坚持了一个月，效率提升很明显。欢迎大家补充 🙌"
)


def svg_avatar(color: str, letter: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" fill="{color}"/>'
        f'<text x="80" y="104" font-size="72" text-anchor="middle" fill="#fff" font-family="sans-serif">{letter}</text></svg>'
    )


def svg_photo(w: int, h: int, hue: int, label: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl({hue},80%,65%)"/>'
        f'<stop offset="1" stop-color="hsl({(hue + 60) % 360},70%,45%)"/></linearGradient></defs>'
        f'<rect width="{w}" height="{h}" fill="url(#g)"/><circle cx="{w * 0.7}" cy="{h * 0.3}" r="{min(w, h) * 0.12}" fill="#fff" opacity=".8"/>'
        f'<path d="M0 {h} L{w * 0.35} {h * 0.5} L{w * 0.6} {h * 0.75} L{w * 0.8} {h * 0.6} L{w} {h} Z" fill="#000" opacity=".25"/>'
        f'<text x="24" y="{h - 24}" font-size="{max(18, w // 22)}" fill="#fff" font-family="sans-serif">{label}</text></svg>'
    )


def u16(s: str) -> int:
    return len(s.encode("utf-16-le")) // 2


def ents(text: str, *specs: tuple) -> list[list]:
    out = []
    for sub, t, *extra in specs:
        i = text.index(sub)
        out.append([t, u16(text[:i]), u16(sub), *extra])
    return out


def write(path: Path, data, lines: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if lines:
        path.write_text("[\n" + ",\n".join(json.dumps(i, ensure_ascii=False, separators=(",", ":")) for i in data) + "\n]\n", "utf-8")
    else:
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), "utf-8")


def make_chat(chat_id: int, title: str, username: str | None, about: str, n_msgs: int, days_span: int, members: list[int], users: dict) -> dict:
    cdir = OUT / "chats" / str(chat_id)
    now = datetime.now(TZ).replace(minute=0, second=0, microsecond=0)
    start = now - timedelta(days=days_span)
    times = sorted(start.timestamp() + rnd.random() * (now.timestamp() - start.timestamp()) for _ in range(n_msgs))
    msgs: list[dict] = []
    chat_users: dict[str, dict] = {}
    mid = 0
    group_seq = 0

    def add(m: dict) -> dict:
        nonlocal mid
        mid += 1
        m["id"] = mid
        msgs.append(m)
        if "from" in m and m["from"] in users:
            u = chat_users.setdefault(str(m["from"]), dict(users[m["from"]]))
            u["count"] = u.get("count", 0) + 1
        return m

    def photo(date: int, w: int, h: int, label: str, next_id: int) -> dict:
        month = datetime.fromtimestamp(date, TZ).strftime("%Y-%m")
        rel = f"chats/{chat_id}/media/{month}/{next_id // 200 * 200}/{next_id}.svg"
        (OUT / rel).parent.mkdir(parents=True, exist_ok=True)
        (OUT / rel).write_text(svg_photo(w, h, rnd.randrange(360), label), "utf-8")
        return {"type": "photo", "w": w, "h": h, "size": 1234, "file": rel}

    add({"date": int(times[0]) - 60, "from": members[0], "svc": {"type": "create", "title": title}})
    i = 0
    while i < len(times):
        t = int(times[i])
        who = rnd.choice(members)
        r = rnd.random()
        m: dict = {"date": t, "from": who}
        if r < 0.62:
            m["text"] = rnd.choice(PHRASES)
        elif r < 0.66:
            m["text"] = LONG
            m["ents"] = ents(LONG, ("分享一下最近的心得", "b"), ("1. 先把问题拆小，再逐个解决；\n2. 写代码之前先写测试；\n3. 每天记录进展。", "quote"))
        elif r < 0.70:
            txt = "项目地址 https://github.com/LonamiWebs/Telethon ，文档见 Telethon 官网 #分享 @user0"
            m["text"] = txt
            m["ents"] = ents(txt, ("https://github.com/LonamiWebs/Telethon", "url"), ("Telethon 官网", "a", "https://docs.telethon.dev"), ("#分享", "hashtag"), ("@user0", "mention"))
            m["media"] = {"type": "webpage", "url": "https://github.com/LonamiWebs/Telethon", "site": "GitHub", "title": "LonamiWebs/Telethon", "desc": "Pure Python 3 MTProto API Telegram client library, for bots too!"}
        elif r < 0.73:
            txt = "npm run build 之后再试试 🚀，或者用这段：\nconst res = await fetch(url)\nconsole.log(await res.json())\n还有 剧透内容 和 删除线 以及 斜体、下划线"
            m["text"] = txt
            m["ents"] = ents(txt, ("npm run build", "code"), ("const res = await fetch(url)\nconsole.log(await res.json())", "pre", "js"), ("剧透内容", "spoiler"), ("删除线", "s"), ("斜体", "i"), ("下划线", "u"))
        elif r < 0.80:
            w, h = rnd.choice([(1280, 960), (960, 1280), (1600, 900), (1080, 1080)])
            m["media"] = photo(t, w, h, f"照片 #{mid + 1}", mid + 1)
            if rnd.random() < 0.4:
                m["text"] = rnd.choice(["看看这个", "今天拍的", "风景不错吧", "📷"])
            if rnd.random() < 0.05:
                m["media"]["spoiler"] = True
        elif r < 0.82:
            group_seq += 1
            gid = str(900000 + group_seq)
            k = rnd.randint(2, 5)
            for j in range(k):
                w, h = rnd.choice([(1280, 960), (960, 1280), (1080, 1080)])
                gm = {"date": t, "from": who, "group": gid, "media": photo(t, w, h, f"相册 {j + 1}/{k}", mid + 1)}
                if j == 0:
                    gm["text"] = "一组照片 📸"
                add(gm)
            i += 1
            continue
        elif r < 0.85:
            m["media"] = {"type": "sticker", "emoji": rnd.choice(["😂", "👍", "🥰", "🤔", "🎉"]), "animated": True, "file": TGS_REL}
        elif r < 0.87:
            m["media"] = {"type": "voice", "dur": rnd.randint(2, 70), "size": 23456, "mime": "audio/wav", "file": VOICE_REL, "wave": fake_wave()}
        elif r < 0.89:
            m["media"] = {"type": "video", "dur": rnd.randint(5, 300), "w": 1280, "h": 720, "size": 48_000_000, "mime": "video/mp4", "skip": "size"}
            m["text"] = "视频太大没下载"
        elif r < 0.91:
            name = rnd.choice(["报告.pdf", "slides.pptx", "数据.xlsx", "notes.txt"])
            month = datetime.fromtimestamp(t, TZ).strftime("%Y-%m")
            rel = f"chats/{chat_id}/media/{month}/{(mid + 1) // 200 * 200}/{mid + 1}.txt"
            (OUT / rel).parent.mkdir(parents=True, exist_ok=True)
            (OUT / rel).write_text("演示文件内容\n", "utf-8")
            m["media"] = {"type": "file", "name": name, "size": rnd.randint(10_000, 9_000_000), "mime": "application/octet-stream", "file": rel}
        elif r < 0.92:
            m["media"] = {"type": "poll", "poll": {"q": "周末去哪儿玩？", "opts": [{"t": "爬山", "n": 5}, {"t": "看电影", "n": 8}, {"t": "宅家", "n": 12}], "total": 25}}
        elif r < 0.93:
            m["media"] = {"type": "geo", "lat": 31.2304, "lng": 121.4737}
        elif r < 0.95:
            m["fwd"] = {"name": rnd.choice(["科技频道", "每日新闻", "王芳"]), "date": t - 86400}
            m["text"] = rnd.choice(PHRASES)
        elif r < 0.97:
            m.pop("from")
            new = rnd.choice(list(users))
            m["from"] = new
            m["svc"] = rnd.choice([{"type": "join"}, {"type": "leave"}, {"type": "pin"}, {"type": "title", "title": title}])
            if m["svc"]["type"] == "pin" and msgs:
                target = rnd.choice(msgs[-50:])
                m["reply"] = {"id": target["id"], "from": target.get("from"), "text": (target.get("text") or "[图片]")[:120]}
        elif r < 0.985:
            m["text"] = rnd.choice(PHRASES)
            m["edit"] = t + 120
        else:
            m["from"] = chat_id
            m["text"] = rnd.choice(["请大家遵守群规 🙏", "本周活动安排已置顶", "已清理广告账号"])
            if rnd.random() < 0.7:
                m["sig"] = rnd.choice(["管理组", "值班小编"])
        if "svc" not in m and msgs and rnd.random() < 0.18:
            cands = [x for x in msgs[-30:] if "svc" not in x and x.get("from") != chat_id]
            if cands:
                target = rnd.choice(cands)
                m["reply"] = {"id": target["id"], "from": target.get("from"), "text": (target.get("text") or "[图片]")[:120]}
                m.setdefault("text", rnd.choice(PHRASES))
        if "svc" not in m and rnd.random() < 0.08:
            m["reacts"] = [[e, rnd.randint(1, 9)] for e in rnd.sample(["👍", "❤️", "😂", "🔥", "🎉", "👀"], rnd.randint(1, 3))]
        add(m)
        i += 1

    for uid, rank in zip(members[:3], ["所有者", "管理员", "吉祥物"]):
        rec = chat_users.setdefault(str(uid), dict(users[uid], count=0))
        rec["title"], rec["role"] = rank, "owner" if rank == "所有者" else "admin"

    chunks = []
    for n in range(0, len(msgs), CHUNK):
        part = msgs[n:n + CHUNK]
        write(cdir / "messages" / f"{n // CHUNK}.json", part, lines=True)
        chunks.append({"n": n // CHUNK, "min": part[0]["id"], "max": part[-1]["id"], "from": part[0]["date"], "to": part[-1]["date"], "count": len(part)})
    days: dict[str, list[int]] = {}
    for m in msgs:
        d = datetime.fromtimestamp(m["date"], TZ).strftime("%Y-%m-%d")
        days.setdefault(d, [m["id"], 0])[1] += 1
    last = msgs[-1]
    meta = {
        "id": chat_id, "title": title, "type": "supergroup", "about": about, "members": len(members) * 37,
        "count": len(msgs), "firstId": msgs[0]["id"], "lastId": last["id"], "firstDate": msgs[0]["date"], "lastDate": last["date"],
        "chunks": chunks, "days": days, "chunkSize": CHUNK, "updatedAt": int(time.time()),
        "last": {"id": last["id"], "from": last.get("from"), "text": last.get("text") or ("[图片]" if last.get("media") else ""), **({"svc": last["svc"]} if "svc" in last else {})},
    }
    if username:
        meta["username"] = username
    rel = f"avatars/{chat_id}_1.svg"
    (OUT / rel).write_text(svg_avatar(f"hsl({abs(chat_id) % 360},60%,50%)", title[0]), "utf-8")
    meta["avatar"] = rel
    extras(cdir, msgs, meta)
    write(cdir / "meta.json", meta)
    write(cdir / "users.json", chat_users)
    return meta


def make_forum(chat_id: int, users: dict) -> dict:
    cdir = OUT / "chats" / str(chat_id)
    members = list(users)[:10]
    now = datetime.now(TZ).replace(minute=0, second=0, microsecond=0)
    t = int((now - timedelta(days=30)).timestamp())
    msgs: list[dict] = []
    chat_users: dict[str, dict] = {}

    def add(m: dict) -> dict:
        nonlocal t
        t += rx.randint(60, 3600)
        m.setdefault("date", t)
        m["id"] = len(msgs) + 1
        msgs.append(m)
        if m.get("from") in users:
            u = chat_users.setdefault(str(m["from"]), dict(users[m["from"]]))
            u["count"] = u.get("count", 0) + 1
        return m

    add({"from": members[0], "svc": {"type": "create", "title": "开发者论坛"}, "topic": 1})
    topics = [("公告", "#6FB9F0"), ("问题求助", "#FFD67E"), ("闲聊", "#CB86DB"), ("作品展示", "#8EEE98"), ("已归档讨论", "#FF93B2")]
    tids: dict[str, int] = {"General": 1}
    for title, _ in topics:
        m = add({"from": members[0], "svc": {"type": "topic_create", "title": title}})
        m["topic"] = m["id"]
        tids[title] = m["id"]
    quote = "引用一段很长的讨论记录：\n" + "\n".join(f"第 {i} 点：这里是比较长的内容，用来演示可折叠的引用块。" for i in range(1, 9))
    code = "def fib(n: int) -> int:\n    # 经典递归\n    return n if n < 2 else fib(n - 1) + fib(n - 2)\n\nprint(fib(10))  # 55"
    for _ in range(560):
        topic = rx.choice(list(tids.values()))
        who = rx.choice(members)
        m: dict = {"from": who, "topic": topic, "text": rx.choice(PHRASES)}
        r = rx.random()
        if r < 0.05:
            m["media"] = {"type": "voice", "dur": rx.randint(2, 40), "size": 30000, "mime": "audio/wav", "file": VOICE_REL, "wave": fake_wave()}
            m.pop("text")
        elif r < 0.07:
            m["media"] = {"type": "audio", "dur": 3, "size": 48000, "mime": "audio/wav", "file": VOICE_REL, "title": rx.choice(["夜曲", "晴天", "Demo Song"]), "performer": rx.choice(["周杰伦", "Mika", "乐队"])}
            m.pop("text")
        elif r < 0.09:
            m["text"] = "我写了个斐波那契：\n" + code
            m["ents"] = ents(m["text"], (code, "pre", "python"))
        elif r < 0.11:
            m["text"] = quote
            m["ents"] = ents(quote, (quote.split("\n", 1)[1], "quote", 1))
        elif r < 0.13:
            m["media"] = {"type": "sticker", "emoji": "🎉", "animated": True, "file": TGS_REL}
            m.pop("text")
        elif r < 0.15:
            m["text"] = "安装命令是 npm i lottie-web ，点一下就能复制"
            m["ents"] = ents(m["text"], ("npm i lottie-web", "code"))
        same = [x for x in msgs[-40:] if x.get("topic") == topic and "svc" not in x]
        if same and rx.random() < 0.3:
            target = rx.choice(same)
            m["reply"] = {"id": target["id"], "from": target.get("from"), "text": (target.get("text") or "[媒体]")[:120]}
        if rx.random() < 0.06:
            m["reacts"] = [[e, rx.randint(1, 9)] for e in rx.sample(["👍", "❤️", "🔥", "🎉"], rx.randint(1, 2))]
        add(m)
        if rx.random() < 0.02:
            target = rx.choice([x for x in msgs[-60:] if "svc" not in x])
            add({"from": members[0], "topic": target["topic"], "svc": {"type": "pin"}, "reply": {"id": target["id"], "from": target.get("from"), "text": (target.get("text") or "[媒体]")[:120]}})

    for uid, rank in zip(members[:2], ["所有者", "版主"]):
        rec = chat_users.setdefault(str(uid), dict(users[uid], count=0))
        rec["title"], rec["role"] = rank, "owner" if rank == "所有者" else "admin"
    chunks = []
    for n in range(0, len(msgs), CHUNK):
        part = msgs[n:n + CHUNK]
        write(cdir / "messages" / f"{n // CHUNK}.json", part, lines=True)
        chunks.append({"n": n // CHUNK, "min": part[0]["id"], "max": part[-1]["id"], "from": part[0]["date"], "to": part[-1]["date"], "count": len(part)})
    days: dict[str, list[int]] = {}
    for m in msgs:
        d = datetime.fromtimestamp(m["date"], TZ).strftime("%Y-%m-%d")
        days.setdefault(d, [m["id"], 0])[1] += 1
    last = msgs[-1]
    topic_list = []
    colors = {"General": "#8E8E93", **dict(topics)}
    for title, tid in tids.items():
        tm = [x for x in msgs if x.get("topic") == tid and "svc" not in x]
        item = {"id": tid, "title": title, "color": colors[title]}
        if title == "公告":
            item["pinned"] = True
        if title == "已归档讨论":
            item["closed"] = True
        if tm:
            lm = tm[-1]
            item["last"] = {"id": lm["id"], "date": lm["date"], "from": lm.get("from"), "text": (lm.get("text") or "[媒体]")[:80]}
        topic_list.append(item)
    meta = {
        "id": chat_id, "title": "开发者论坛", "username": "devforum", "type": "supergroup", "forum": True,
        "about": "按话题讨论开发问题", "members": 1280, "count": len(msgs), "firstId": 1, "lastId": last["id"],
        "firstDate": msgs[0]["date"], "lastDate": last["date"], "chunks": chunks, "days": days, "chunkSize": CHUNK,
        "updatedAt": int(time.time()), "topics": topic_list,
        "last": {"id": last["id"], "from": last.get("from"), "text": last.get("text") or "[媒体]"},
    }
    rel = f"avatars/{chat_id}_1.svg"
    (OUT / rel).write_text(svg_avatar("hsl(210,60%,50%)", "开"), "utf-8")
    meta["avatar"] = rel
    extras(cdir, msgs, meta)
    write(cdir / "meta.json", meta)
    write(cdir / "users.json", chat_users)
    return meta


def main() -> None:
    shutil.rmtree(OUT, ignore_errors=True)
    (OUT / "avatars").mkdir(parents=True)
    write_voice()
    write_tgs()
    users: dict[int, dict] = {}
    for idx, name in enumerate(NAMES):
        uid = 1000 + idx
        u = {"name": name}
        if idx % 3 != 2:
            u["username"] = f"user{idx}"
        if idx % 2 == 0:
            rel = f"avatars/{uid}_1.svg"
            (OUT / rel).write_text(svg_avatar(f"hsl({idx * 47 % 360},65%,55%)", name[0]), "utf-8")
            u["avatar"] = rel
        if idx == 14:
            u["bot"] = True
        users[uid] = u
    ids = list(users)
    chats = [
        make_chat(-1001111111111, "前端技术交流", "frontend_cn", "讨论 React / Vue / Vite 等前端技术。\n禁止广告。", 3200, 400, ids, users),
        make_chat(-1002222222222, "周末爬山小分队 ⛰️", None, "每周六早上集合", 450, 60, ids[:6], users),
        make_chat(-1003333333333, "读书会", "bookclub", "", 1200, 180, ids[3:12], users),
        make_forum(-1004444444444, users),
    ]
    idx = []
    for c in sorted(chats, key=lambda c: -c["lastDate"]):
        last = dict(c["last"])
        if last.get("from") is not None:
            last["name"] = users[last["from"]]["name"]
        idx.append({k: c[k] for k in ("id", "title", "username", "avatar", "type", "members", "count", "firstDate", "lastDate", "updatedAt") if k in c} | {"last": last})
    write(OUT / "index.json", {"title": "群聊存档（演示）", "timezone": "Asia/Shanghai", "updatedAt": int(time.time()), "chats": idx})
    print(f"演示数据已写入 {OUT}")


if __name__ == "__main__":
    main()
