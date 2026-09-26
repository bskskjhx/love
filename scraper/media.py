import asyncio
import json
import os
import sys
import time

from telethon.errors import FloodWaitError

from storage import _atomic_write

MAX_MEDIA_SIZE = 5 * 1024 * 1024
MEDIA_TYPES = ("photo", "sticker", "voice", "video")
EXT = {"photo": ".jpg", "sticker": ".webp", "voice": ".ogg", "video": ".jpg"}


class _Stop(Exception):
    def __init__(self, seconds):
        super().__init__(seconds)
        self.seconds = seconds


def _load_index(path):
    idx = {}
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as fh:
            idx = json.load(fh)
    if not isinstance(idx, dict):
        raise ValueError("媒体索引格式错误：" + path)
    done = idx.get("done")
    return dict(done) if isinstance(done, dict) else {}


def _dump_index(path, done):
    _atomic_write(path, {"done": done})


def _remove(path):
    try:
        os.remove(path)
    except FileNotFoundError:
        pass


async def _retry(deadline, make):
    retries = 0
    while True:
        try:
            return await make()
        except FloodWaitError as e:
            wait = e.seconds + 1
            if wait > deadline - time.monotonic() or retries >= 3:
                raise _Stop(e.seconds)
            retries += 1
            await asyncio.sleep(wait)


def _media_size(msg):
    try:
        f = msg.file
    except Exception:
        return None
    return getattr(f, "size", None) if f is not None else None


def _target(msg, mtype):
    if mtype == "photo":
        return msg.photo
    if mtype == "sticker":
        return msg.sticker
    if mtype == "voice":
        return msg.voice
    if mtype == "video":
        return msg.video
    return None


def _collect_targets(store, done):
    targets = []
    for entry in store.meta["chunks"]:
        path = os.path.join(store.chunks_dir, entry["file"])
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        for msg in data[: entry["count"]]:
            mtype = msg.get("m")
            if mtype not in MEDIA_TYPES:
                continue
            mid = int(msg["i"])
            key = str(mid)
            if key in done:
                continue
            targets.append((mid, mtype, msg.get("sz")))
    targets.sort()
    return targets


async def sync_media(client, entity, store, deadline):
    tag = "[%s]" % store.username
    try:
        if time.monotonic() >= deadline:
            return
        base = os.path.join(store.data_dir, store.username, "media")
        index_path = os.path.join(base, "index.json")
        done = _load_index(index_path)
        targets = _collect_targets(store, done)
        if not targets:
            print("%s 媒体：无需下载" % tag, flush=True)
            return
        os.makedirs(base, exist_ok=True)
        state = {"dirty": False}
        added = skipped = failed = seen = 0

        def flush():
            if state["dirty"]:
                _dump_index(index_path, done)
                state["dirty"] = False

        def mark(key, status):
            done[key] = status
            state["dirty"] = True

        try:
            need_fetch = [
                mid
                for mid, mtype, sz in targets
                if mtype == "video" or sz is None or sz <= MAX_MEDIA_SIZE
            ]
            msgs_by_id = {}
            for i in range(0, len(need_fetch), 100):
                if time.monotonic() >= deadline:
                    break
                batch = need_fetch[i : i + 100]
                fetched = await _retry(
                    deadline, lambda: client.get_messages(entity, ids=batch)
                )
                for msg in fetched:
                    if msg is not None:
                        msgs_by_id[msg.id] = msg
                if i + 100 < len(need_fetch):
                    await asyncio.sleep(0.3)

            for mid, mtype, sz in targets:
                if time.monotonic() >= deadline:
                    break
                key = str(mid)
                seen += 1

                if mtype != "video" and sz is not None and sz > MAX_MEDIA_SIZE:
                    mark(key, "skip")
                    skipped += 1
                    if seen % 50 == 0:
                        flush()
                    continue

                msg = msgs_by_id.get(mid)
                obj = _target(msg, mtype) if msg is not None else None
                if obj is None:
                    mark(key, "no")
                    failed += 1
                    if seen % 50 == 0:
                        flush()
                    continue

                if mtype != "video":
                    size = sz if sz is not None else _media_size(msg)
                    if size is not None and size > MAX_MEDIA_SIZE:
                        mark(key, "skip")
                        skipped += 1
                        if seen % 50 == 0:
                            flush()
                        continue

                path = os.path.join(base, key + EXT[mtype])
                if mtype == "video":
                    got = await _retry(
                        deadline,
                        lambda: client.download_media(msg, thumb=-1, file=path),
                    )
                elif mtype == "photo":
                    got = await _retry(
                        deadline, lambda: client.download_media(obj, file=path)
                    )
                else:
                    got = await _retry(
                        deadline, lambda: client.download_media(msg, file=path)
                    )

                if got:
                    mark(key, "ok")
                    added += 1
                else:
                    _remove(path)
                    mark(key, "no")
                    failed += 1

                if seen % 50 == 0:
                    flush()
                await asyncio.sleep(0.3)
        except _Stop as e:
            print("%s 媒体：FloodWait %d 秒，停止" % (tag, e.seconds), flush=True)
        finally:
            flush()
        print(
            "%s 媒体：新增 %d，跳过 %d，失败 %d" % (tag, added, skipped, failed),
            flush=True,
        )
    except Exception as e:
        print(
            "[%s] 媒体同步出错：%s: %s" % (store.username, type(e).__name__, e),
            file=sys.stderr,
            flush=True,
        )
